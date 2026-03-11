"use strict";

// bot.test.js – unit tests for the bot helper functions
// Run with:  node --test bot/bot.test.js
// (requires Node.js ≥ 18 for the built-in test runner)

const { describe, it, before, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

// Temporarily mock config so bot.js doesn't need real credentials
process.env.NODE_ENV = "test";

// Patch require for config.json before loading bot.js
const Module = require("module");
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request.endsWith("config.json") || request === "./config.json") {
    return {
      twitch: { username: "testbot", oauth: "oauth:test", channel: "#test" },
      factorio: { consolePath: "", rconHost: "", rconPort: 0, rconPassword: "" },
      commands: {
        prefix: "!",
        globalCooldownSeconds: 30,
        perCommandCooldownSeconds: 60,
        allowedRoles: {
          meteor: ["broadcaster", "moderator", "vip", "subscriber", "everyone"],
          biter: ["broadcaster", "moderator", "vip", "subscriber", "everyone"],
          storm: ["broadcaster", "moderator", "vip", "subscriber", "everyone"],
          blackout: ["broadcaster", "moderator", "vip"],
          nuke: ["broadcaster", "moderator"],
          belt_reverse: ["broadcaster", "moderator", "vip", "subscriber", "everyone"],
          ore_delete: ["broadcaster", "moderator", "vip"],
        },
      },
      voting: { enabled: false, durationSeconds: 30, minimumVotes: 3 },
      randomEvents: { enabled: false, intervalMinutes: 10, events: ["meteor"] },
    };
  }
  return originalLoad.apply(this, arguments);
};

const bot = require("./bot.js");

// ── getUserRole ────────────────────────────────────────────────────────────────

describe("getUserRole", () => {
  it("returns broadcaster when broadcaster badge is present", () => {
    const tags = { badges: { broadcaster: "1" } };
    assert.equal(bot.getUserRole(tags), "broadcaster");
  });

  it("returns moderator when mod flag is true", () => {
    const tags = { mod: true, badges: {} };
    assert.equal(bot.getUserRole(tags), "moderator");
  });

  it("returns vip when vip badge is present", () => {
    const tags = { badges: { vip: "1" }, mod: false };
    assert.equal(bot.getUserRole(tags), "vip");
  });

  it("returns subscriber when subscriber flag is true", () => {
    const tags = { subscriber: true, badges: {}, mod: false };
    assert.equal(bot.getUserRole(tags), "subscriber");
  });

  it("returns everyone for regular viewers", () => {
    const tags = { badges: {}, mod: false, subscriber: false };
    assert.equal(bot.getUserRole(tags), "everyone");
  });
});

// ── isRoleAllowed ──────────────────────────────────────────────────────────────

describe("isRoleAllowed", () => {
  it("allows everyone when everyone is in the list", () => {
    assert.equal(bot.isRoleAllowed("everyone", ["broadcaster", "everyone"]), true);
  });

  it("blocks a role not in the list", () => {
    assert.equal(bot.isRoleAllowed("everyone", ["broadcaster", "moderator"]), false);
  });

  it("allows moderator when in the list", () => {
    assert.equal(bot.isRoleAllowed("moderator", ["broadcaster", "moderator"]), true);
  });

  it("returns false for empty allowed list", () => {
    assert.equal(bot.isRoleAllowed("broadcaster", []), false);
  });
});

// ── Cooldowns ─────────────────────────────────────────────────────────────────

describe("cooldowns", () => {
  beforeEach(() => {
    // Clear cooldown state before each test
    Object.keys(bot.lastCommandTime).forEach((k) => delete bot.lastCommandTime[k]);
    Object.keys(bot.lastUserTime).forEach((k) => delete bot.lastUserTime[k]);
  });

  it("isOnCooldown returns 0 when no cooldown set", () => {
    assert.equal(bot.isOnCooldown("meteor"), 0);
  });

  it("isOnCooldown returns remaining seconds after setCooldown", () => {
    bot.setCooldown("meteor", "alice");
    const remaining = bot.isOnCooldown("meteor");
    assert.ok(remaining > 0, "expected remaining > 0");
    assert.ok(remaining <= 60, "expected remaining <= 60");
  });

  it("isUserOnCooldown returns 0 when no cooldown set", () => {
    assert.equal(bot.isUserOnCooldown("alice"), 0);
  });

  it("isUserOnCooldown returns remaining seconds after setCooldown", () => {
    bot.setCooldown("meteor", "alice");
    const remaining = bot.isUserOnCooldown("alice");
    assert.ok(remaining > 0);
    assert.ok(remaining <= 30);
  });
});

// ── COMMANDS ──────────────────────────────────────────────────────────────────

describe("COMMANDS", () => {
  it("meteor produces correct lua with explicit coords", () => {
    const lua = bot.COMMANDS.meteor(["100", "200"]);
    assert.equal(lua, 'remote.call("twitch_events","meteor",100,200)');
  });

  it("meteor falls back to random coords when args are absent", () => {
    const lua = bot.COMMANDS.meteor([]);
    assert.match(lua, /remote\.call\("twitch_events","meteor",-?\d+,-?\d+\)/);
  });

  it("biter clamps count to 20", () => {
    const lua = bot.COMMANDS.biter(["999"]);
    assert.equal(lua, 'remote.call("twitch_events","biter_attack",20)');
  });

  it("biter defaults to 5 when no args", () => {
    const lua = bot.COMMANDS.biter([]);
    assert.equal(lua, 'remote.call("twitch_events","biter_attack",5)');
  });

  it("storm clamps duration to 300", () => {
    const lua = bot.COMMANDS.storm(["9999"]);
    assert.equal(lua, 'remote.call("twitch_events","storm",300)');
  });

  it("blackout clamps duration to 300", () => {
    const lua = bot.COMMANDS.blackout(["9999"]);
    assert.equal(lua, 'remote.call("twitch_events","blackout",300)');
  });

  it("belt_reverse returns correct lua", () => {
    const lua = bot.COMMANDS.belt_reverse([]);
    assert.equal(lua, 'remote.call("twitch_events","belt_reverse")');
  });

  it("ore_delete returns correct lua", () => {
    const lua = bot.COMMANDS.ore_delete([]);
    assert.equal(lua, 'remote.call("twitch_events","ore_delete")');
  });

  it("nuke produces correct lua with coords", () => {
    const lua = bot.COMMANDS.nuke(["50", "-50"]);
    assert.equal(lua, 'remote.call("twitch_events","nuke",50,-50)');
  });
});

// ── handleMessage ─────────────────────────────────────────────────────────────

describe("handleMessage", () => {
  // Minimal fake tmi client
  const messages = [];
  const fakeClient = {
    say: (channel, msg) => messages.push({ channel, msg }),
  };

  beforeEach(() => {
    messages.length = 0;
    Object.keys(bot.lastCommandTime).forEach((k) => delete bot.lastCommandTime[k]);
    Object.keys(bot.lastUserTime).forEach((k) => delete bot.lastUserTime[k]);
  });

  it("ignores messages without the prefix", () => {
    const tags = { username: "alice", badges: {}, mod: false, subscriber: false };
    bot.handleMessage(fakeClient, "#test", tags, "hello world");
    assert.equal(messages.length, 0);
  });

  it("ignores unknown commands", () => {
    const tags = { username: "alice", badges: {}, mod: false, subscriber: false };
    bot.handleMessage(fakeClient, "#test", tags, "!unknowncmd");
    assert.equal(messages.length, 0);
  });

  it("blocks users without sufficient role", () => {
    // 'nuke' only allows broadcaster and moderator
    const tags = { username: "alice", badges: {}, mod: false, subscriber: false };
    bot.handleMessage(fakeClient, "#test", tags, "!nuke");
    assert.equal(messages.length, 1);
    assert.match(messages[0].msg, /don't have permission/i);
  });

  it("allows a valid command for an authorized role (sends confirmation)", () => {
    const tags = {
      username: "alice",
      badges: { broadcaster: "1" },
      mod: false,
      subscriber: false,
    };
    // We stub sendToFactorio by overriding consolePath to empty string
    // (the bot logs a warning but doesn't throw)
    bot.handleMessage(fakeClient, "#test", tags, "!meteor");
    assert.equal(messages.length, 1);
    assert.match(messages[0].msg, /triggered !meteor/i);
  });

  it("enforces per-user cooldown on second command", () => {
    const tags = {
      username: "bob",
      badges: { broadcaster: "1" },
      mod: false,
      subscriber: false,
    };
    // First command — should succeed
    bot.handleMessage(fakeClient, "#test", tags, "!meteor");
    assert.equal(messages.length, 1);
    assert.match(messages[0].msg, /triggered/i);

    // Second immediate command — should be blocked by user cooldown
    bot.handleMessage(fakeClient, "#test", tags, "!biter");
    assert.equal(messages.length, 2);
    assert.match(messages[1].msg, /please wait/i);
  });
});
