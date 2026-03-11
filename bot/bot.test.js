"use strict";

// bot.test.js – unit tests for the bot helper functions
// Run with:  node --test bot/bot.test.js
// (requires Node.js ≥ 18 for the built-in test runner)

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

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
      },
      difficulties: {
        easy: {
          description: "Free for everyone",
          minBits: 0,
          allowedRoles: ["broadcaster", "moderator", "vip", "subscriber", "everyone"],
        },
        medium: {
          description: "Subscriber or 100 bits",
          minBits: 100,
          allowedRoles: ["broadcaster", "moderator", "vip", "subscriber"],
        },
        hard: {
          description: "500 bits or moderator+",
          minBits: 500,
          allowedRoles: ["broadcaster", "moderator"],
        },
      },
      commandDifficulty: {
        meteor: "easy",
        biter: "easy",
        storm: "easy",
        belt_reverse: "easy",
        blackout: "medium",
        ore_delete: "medium",
        rail_destroy: "medium",
        combustion_stop: "medium",
        spawn_inside: "hard",
        nuke: "hard",
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
    assert.equal(bot.getUserRole({ badges: { broadcaster: "1" } }), "broadcaster");
  });

  it("returns moderator when mod flag is true", () => {
    assert.equal(bot.getUserRole({ mod: true, badges: {} }), "moderator");
  });

  it("returns vip when vip badge is present", () => {
    assert.equal(bot.getUserRole({ badges: { vip: "1" }, mod: false }), "vip");
  });

  it("returns subscriber when subscriber flag is true", () => {
    assert.equal(
      bot.getUserRole({ subscriber: true, badges: {}, mod: false }),
      "subscriber"
    );
  });

  it("returns everyone for regular viewers", () => {
    assert.equal(
      bot.getUserRole({ badges: {}, mod: false, subscriber: false }),
      "everyone"
    );
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

// ── getCommandDifficulty ───────────────────────────────────────────────────────

describe("getCommandDifficulty", () => {
  it("meteor is easy", () => {
    assert.equal(bot.getCommandDifficulty("meteor"), "easy");
  });

  it("blackout is medium", () => {
    assert.equal(bot.getCommandDifficulty("blackout"), "medium");
  });

  it("rail_destroy is medium", () => {
    assert.equal(bot.getCommandDifficulty("rail_destroy"), "medium");
  });

  it("combustion_stop is medium", () => {
    assert.equal(bot.getCommandDifficulty("combustion_stop"), "medium");
  });

  it("spawn_inside is hard", () => {
    assert.equal(bot.getCommandDifficulty("spawn_inside"), "hard");
  });

  it("nuke is hard", () => {
    assert.equal(bot.getCommandDifficulty("nuke"), "hard");
  });

  it("unknown command defaults to easy", () => {
    assert.equal(bot.getCommandDifficulty("unknowncmd"), "easy");
  });
});

// ── getDifficultyConfig ────────────────────────────────────────────────────────

describe("getDifficultyConfig", () => {
  it("easy tier has minBits 0", () => {
    assert.equal(bot.getDifficultyConfig("easy").minBits, 0);
  });

  it("medium tier has minBits 100", () => {
    assert.equal(bot.getDifficultyConfig("medium").minBits, 100);
  });

  it("hard tier has minBits 500", () => {
    assert.equal(bot.getDifficultyConfig("hard").minBits, 500);
  });

  it("easy tier allows everyone", () => {
    assert.ok(bot.getDifficultyConfig("easy").allowedRoles.includes("everyone"));
  });

  it("hard tier does not allow subscriber", () => {
    assert.ok(!bot.getDifficultyConfig("hard").allowedRoles.includes("subscriber"));
  });
});

// ── canExecuteCommand ──────────────────────────────────────────────────────────

describe("canExecuteCommand", () => {
  it("everyone can execute an easy command", () => {
    assert.equal(bot.canExecuteCommand("meteor", "everyone", null).allowed, true);
  });

  it("everyone cannot execute a medium command via chat (no bits)", () => {
    assert.equal(bot.canExecuteCommand("blackout", "everyone", null).allowed, false);
  });

  it("subscriber can execute a medium command via chat", () => {
    assert.equal(bot.canExecuteCommand("blackout", "subscriber", null).allowed, true);
  });

  it("everyone with 100 bits can execute a medium command", () => {
    assert.equal(bot.canExecuteCommand("blackout", "everyone", 100).allowed, true);
  });

  it("everyone with 99 bits cannot execute a medium command", () => {
    assert.equal(bot.canExecuteCommand("blackout", "everyone", 99).allowed, false);
  });

  it("everyone cannot execute a hard command via chat", () => {
    assert.equal(bot.canExecuteCommand("nuke", "everyone", null).allowed, false);
  });

  it("moderator can execute a hard command via chat", () => {
    assert.equal(bot.canExecuteCommand("nuke", "moderator", null).allowed, true);
  });

  it("everyone with 500 bits can execute a hard command", () => {
    assert.equal(bot.canExecuteCommand("nuke", "everyone", 500).allowed, true);
  });

  it("everyone with 499 bits cannot execute a hard command", () => {
    assert.equal(bot.canExecuteCommand("nuke", "everyone", 499).allowed, false);
  });

  it("spawn_inside with 500 bits is allowed", () => {
    assert.equal(bot.canExecuteCommand("spawn_inside", "everyone", 500).allowed, true);
  });
});

// ── Cooldowns ─────────────────────────────────────────────────────────────────

describe("cooldowns", () => {
  beforeEach(() => {
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
    assert.equal(
      bot.COMMANDS.meteor(["100", "200"]),
      'remote.call("twitch_events","meteor",100,200)'
    );
  });

  it("meteor accepts coordinate 0 as explicit value", () => {
    assert.equal(
      bot.COMMANDS.meteor(["0", "0"]),
      'remote.call("twitch_events","meteor",0,0)'
    );
  });

  it("meteor falls back to random coords when args are absent", () => {
    assert.match(
      bot.COMMANDS.meteor([]),
      /remote\.call\("twitch_events","meteor",-?\d+,-?\d+\)/
    );
  });

  it("biter clamps count to 20", () => {
    assert.equal(
      bot.COMMANDS.biter(["999"]),
      'remote.call("twitch_events","biter_attack",20)'
    );
  });

  it("biter defaults to 5 when no args", () => {
    assert.equal(
      bot.COMMANDS.biter([]),
      'remote.call("twitch_events","biter_attack",5)'
    );
  });

  it("storm clamps duration to 300", () => {
    assert.equal(
      bot.COMMANDS.storm(["9999"]),
      'remote.call("twitch_events","storm",300)'
    );
  });

  it("blackout clamps duration to 300", () => {
    assert.equal(
      bot.COMMANDS.blackout(["9999"]),
      'remote.call("twitch_events","blackout",300)'
    );
  });

  it("belt_reverse returns correct lua", () => {
    assert.equal(
      bot.COMMANDS.belt_reverse([]),
      'remote.call("twitch_events","belt_reverse")'
    );
  });

  it("ore_delete returns correct lua", () => {
    assert.equal(
      bot.COMMANDS.ore_delete([]),
      'remote.call("twitch_events","ore_delete")'
    );
  });

  it("nuke produces correct lua with coords", () => {
    assert.equal(
      bot.COMMANDS.nuke(["50", "-50"]),
      'remote.call("twitch_events","nuke",50,-50)'
    );
  });

  it("nuke accepts coordinate 0 as explicit value", () => {
    assert.equal(
      bot.COMMANDS.nuke(["0", "0"]),
      'remote.call("twitch_events","nuke",0,0)'
    );
  });

  it("rail_destroy uses default count 10", () => {
    assert.equal(
      bot.COMMANDS.rail_destroy([]),
      'remote.call("twitch_events","rail_destroy",10)'
    );
  });

  it("rail_destroy clamps count to 50", () => {
    assert.equal(
      bot.COMMANDS.rail_destroy(["9999"]),
      'remote.call("twitch_events","rail_destroy",50)'
    );
  });

  it("rail_destroy passes explicit count", () => {
    assert.equal(
      bot.COMMANDS.rail_destroy(["20"]),
      'remote.call("twitch_events","rail_destroy",20)'
    );
  });

  it("combustion_stop uses default duration 60", () => {
    assert.equal(
      bot.COMMANDS.combustion_stop([]),
      'remote.call("twitch_events","combustion_stop",60)'
    );
  });

  it("combustion_stop clamps to 300", () => {
    assert.equal(
      bot.COMMANDS.combustion_stop(["9999"]),
      'remote.call("twitch_events","combustion_stop",300)'
    );
  });

  it("spawn_inside uses default count 5", () => {
    assert.equal(
      bot.COMMANDS.spawn_inside([]),
      'remote.call("twitch_events","spawn_inside",5)'
    );
  });

  it("spawn_inside clamps count to 15", () => {
    assert.equal(
      bot.COMMANDS.spawn_inside(["9999"]),
      'remote.call("twitch_events","spawn_inside",15)'
    );
  });
});

// ── handleMessage ─────────────────────────────────────────────────────────────

describe("handleMessage", () => {
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

  it("blocks non-sub from a hard command with bits info in message", () => {
    const tags = { username: "alice", badges: {}, mod: false, subscriber: false };
    bot.handleMessage(fakeClient, "#test", tags, "!nuke");
    assert.equal(messages.length, 1);
    assert.match(messages[0].msg, /HARD.*500 bits/i);
  });

  it("blocks non-sub from a medium command with bits info in message", () => {
    const tags = { username: "alice", badges: {}, mod: false, subscriber: false };
    bot.handleMessage(fakeClient, "#test", tags, "!blackout");
    assert.equal(messages.length, 1);
    assert.match(messages[0].msg, /MEDIUM.*100 bits/i);
  });

  it("allows broadcaster to trigger a hard command", () => {
    const tags = { username: "streamer", badges: { broadcaster: "1" }, mod: false };
    bot.handleMessage(fakeClient, "#test", tags, "!nuke");
    assert.equal(messages.length, 1);
    assert.match(messages[0].msg, /triggered.*!nuke/i);
  });

  it("allows subscriber to trigger a medium command", () => {
    const tags = { username: "sub1", badges: {}, mod: false, subscriber: true };
    bot.handleMessage(fakeClient, "#test", tags, "!blackout");
    assert.equal(messages.length, 1);
    assert.match(messages[0].msg, /triggered.*!blackout/i);
  });

  it("allows everyone to trigger an easy command (sends confirmation with tier label)", () => {
    const tags = { username: "alice", badges: {}, mod: false, subscriber: false };
    bot.handleMessage(fakeClient, "#test", tags, "!meteor");
    assert.equal(messages.length, 1);
    assert.match(messages[0].msg, /triggered.*!meteor/i);
    assert.match(messages[0].msg, /EASY/);
  });

  it("enforces per-user cooldown on second command", () => {
    const tags = { username: "bob", badges: { broadcaster: "1" }, mod: false };
    bot.handleMessage(fakeClient, "#test", tags, "!meteor");
    assert.equal(messages.length, 1);
    assert.match(messages[0].msg, /triggered/i);

    bot.handleMessage(fakeClient, "#test", tags, "!biter");
    assert.equal(messages.length, 2);
    assert.match(messages[1].msg, /please wait/i);
  });
});

// ── handleCheer ────────────────────────────────────────────────────────────────

describe("handleCheer", () => {
  const messages = [];
  const fakeClient = {
    say: (channel, msg) => messages.push({ channel, msg }),
  };

  beforeEach(() => {
    messages.length = 0;
    Object.keys(bot.lastCommandTime).forEach((k) => delete bot.lastCommandTime[k]);
    Object.keys(bot.lastUserTime).forEach((k) => delete bot.lastUserTime[k]);
  });

  it("ignores cheers with 0 bits", () => {
    const tags = { username: "alice", bits: "0" };
    bot.handleCheer(fakeClient, "#test", tags, "Cheer100 !meteor");
    assert.equal(messages.length, 0);
  });

  it("ignores cheers with no matching command", () => {
    const tags = { username: "alice", bits: "100" };
    bot.handleCheer(fakeClient, "#test", tags, "Cheer100 great stream");
    assert.equal(messages.length, 0);
  });

  it("executes easy command with any cheer amount", () => {
    const tags = { username: "alice", bits: "1" };
    bot.handleCheer(fakeClient, "#test", tags, "Cheer1 !meteor");
    assert.equal(messages.length, 1);
    assert.match(messages[0].msg, /triggered.*!meteor/i);
    assert.match(messages[0].msg, /EASY/);
  });

  it("executes medium command when bits meet threshold", () => {
    const tags = { username: "alice", bits: "100" };
    bot.handleCheer(fakeClient, "#test", tags, "Cheer100 !blackout");
    assert.equal(messages.length, 1);
    assert.match(messages[0].msg, /triggered.*!blackout/i);
    assert.match(messages[0].msg, /MEDIUM/);
  });

  it("blocks medium command when bits are below threshold", () => {
    const tags = { username: "alice", bits: "99" };
    bot.handleCheer(fakeClient, "#test", tags, "Cheer99 !blackout");
    assert.equal(messages.length, 1);
    assert.match(messages[0].msg, /100 bits/i);
  });

  it("executes hard command with 500 bits", () => {
    const tags = { username: "alice", bits: "500" };
    bot.handleCheer(fakeClient, "#test", tags, "Cheer500 !nuke");
    assert.equal(messages.length, 1);
    assert.match(messages[0].msg, /triggered.*!nuke/i);
    assert.match(messages[0].msg, /HARD/);
  });

  it("blocks hard command with 499 bits", () => {
    const tags = { username: "alice", bits: "499" };
    bot.handleCheer(fakeClient, "#test", tags, "Cheer499 !nuke");
    assert.equal(messages.length, 1);
    assert.match(messages[0].msg, /500 bits/i);
  });

  it("executes rail_destroy with 100 bits (medium tier)", () => {
    const tags = { username: "alice", bits: "100" };
    bot.handleCheer(fakeClient, "#test", tags, "Cheer100 !rail_destroy");
    assert.equal(messages.length, 1);
    assert.match(messages[0].msg, /triggered.*!rail_destroy/i);
  });

  it("executes spawn_inside with 500 bits (hard tier)", () => {
    const tags = { username: "alice", bits: "500" };
    bot.handleCheer(fakeClient, "#test", tags, "Cheer500 !spawn_inside");
    assert.equal(messages.length, 1);
    assert.match(messages[0].msg, /triggered.*!spawn_inside/i);
  });

  it("respects command cooldown on cheer", () => {
    bot.setCooldown("meteor", "_setup");
    const tags = { username: "alice", bits: "50" };
    bot.handleCheer(fakeClient, "#test", tags, "Cheer50 !meteor");
    assert.equal(messages.length, 1);
    assert.match(messages[0].msg, /on cooldown/i);
  });
});
