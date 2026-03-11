"use strict";

const tmi = require("tmi.js");
const fs = require("fs");
const path = require("path");

const config = JSON.parse(
  fs.readFileSync(path.join(__dirname, "config.json"), "utf8")
);

// ── Cooldown tracking ──────────────────────────────────────────────────────────
// Maps command name → timestamp of last execution (ms)
const lastCommandTime = {};
// Maps username → timestamp of last command (ms) – global per-user cooldown
const lastUserTime = {};
// Tracks the ongoing vote, if any
let activeVote = null;
// Timer handle for random events
let randomEventTimer = null;

// ── Role helpers ───────────────────────────────────────────────────────────────

/**
 * Returns the highest Twitch role for a user based on their badges/tags.
 * Roles in descending privilege order:
 *   broadcaster → moderator → vip → subscriber → everyone
 */
function getUserRole(tags) {
  if (tags.badges && tags.badges.broadcaster) return "broadcaster";
  if (tags.mod || (tags.badges && tags.badges.moderator)) return "moderator";
  if (tags.badges && tags.badges.vip) return "vip";
  if (tags.subscriber || (tags.badges && tags.badges.subscriber))
    return "subscriber";
  return "everyone";
}

const ROLE_RANK = {
  broadcaster: 4,
  moderator: 3,
  vip: 2,
  subscriber: 1,
  everyone: 0,
};

/**
 * Returns true if the user's role is in the allowed-roles list for a command.
 */
function isRoleAllowed(userRole, allowedRoles) {
  if (!allowedRoles || allowedRoles.length === 0) return false;
  // If "everyone" is allowed, all roles pass.
  if (allowedRoles.includes("everyone")) return true;
  return allowedRoles.includes(userRole);
}

// ── Cooldown helpers ───────────────────────────────────────────────────────────

function isOnCooldown(commandName) {
  const now = Date.now();
  const perCmd = (config.commands.perCommandCooldownSeconds || 60) * 1000;
  if (lastCommandTime[commandName] && now - lastCommandTime[commandName] < perCmd) {
    return Math.ceil((perCmd - (now - lastCommandTime[commandName])) / 1000);
  }
  return 0;
}

function isUserOnCooldown(username) {
  const now = Date.now();
  const global = (config.commands.globalCooldownSeconds || 30) * 1000;
  if (lastUserTime[username] && now - lastUserTime[username] < global) {
    return Math.ceil((global - (now - lastUserTime[username])) / 1000);
  }
  return 0;
}

function setCooldown(commandName, username) {
  lastCommandTime[commandName] = Date.now();
  lastUserTime[username] = Date.now();
}

// ── Factorio command dispatch ──────────────────────────────────────────────────

/**
 * Sends a /silent-command to Factorio by appending it to the console input
 * file that Factorio watches, or via RCON if configured.
 *
 * The command string should be the Lua expression that follows
 * /silent-command, e.g. remote.call("twitch_events","meteor",100,200)
 */
function sendToFactorio(luaCommand) {
  const fullCommand = `/silent-command ${luaCommand}\n`;

  // RCON path (optional – requires factorio-rcon or similar)
  if (config.factorio.rconHost && config.factorio.rconPort) {
    // RCON is intentionally left as a placeholder.
    // Users can integrate a library such as `rcon` from npm.
    console.log(`[RCON] Would send: ${fullCommand.trim()}`);
    return;
  }

  // File-based path – write the command to the script-output file
  const consolePath = config.factorio.consolePath;
  if (!consolePath) {
    console.warn(
      "[Bot] factorio.consolePath is not set in config.json – command not sent."
    );
    return;
  }
  try {
    fs.appendFileSync(consolePath, fullCommand, "utf8");
    console.log(`[Bot] Sent to Factorio: ${fullCommand.trim()}`);
  } catch (err) {
    console.error(`[Bot] Failed to write command to file: ${err.message}`);
  }
}

// ── Command definitions ────────────────────────────────────────────────────────

/**
 * Each command maps to a function that returns the Lua expression to execute.
 * Commands receive the parsed arguments array (strings after the command word).
 */
const COMMANDS = {
  meteor(args) {
    const x = parseInt(args[0], 10) || Math.floor(Math.random() * 400) - 200;
    const y = parseInt(args[1], 10) || Math.floor(Math.random() * 400) - 200;
    return `remote.call("twitch_events","meteor",${x},${y})`;
  },

  biter(args) {
    const count = Math.min(parseInt(args[0], 10) || 5, 20);
    return `remote.call("twitch_events","biter_attack",${count})`;
  },

  storm(args) {
    const duration = Math.min(parseInt(args[0], 10) || 60, 300);
    return `remote.call("twitch_events","storm",${duration})`;
  },

  blackout(args) {
    const duration = Math.min(parseInt(args[0], 10) || 60, 300);
    return `remote.call("twitch_events","blackout",${duration})`;
  },

  belt_reverse() {
    return `remote.call("twitch_events","belt_reverse")`;
  },

  ore_delete() {
    return `remote.call("twitch_events","ore_delete")`;
  },

  nuke(args) {
    const x = parseInt(args[0], 10) || Math.floor(Math.random() * 400) - 200;
    const y = parseInt(args[1], 10) || Math.floor(Math.random() * 400) - 200;
    return `remote.call("twitch_events","nuke",${x},${y})`;
  },
};

// ── Voting ─────────────────────────────────────────────────────────────────────

function startVote(commandName, client, channel) {
  if (activeVote) {
    client.say(channel, `A vote for !${activeVote.command} is already running.`);
    return;
  }

  activeVote = {
    command: commandName,
    votes: new Set(),
    startTime: Date.now(),
  };

  const duration = config.voting.durationSeconds || 30;
  client.say(
    channel,
    `Vote started! Type !vote to vote for !${commandName}. Voting ends in ${duration}s.`
  );

  setTimeout(() => {
    if (!activeVote) return;
    const voteCount = activeVote.votes.size;
    const minimum = config.voting.minimumVotes || 3;
    if (voteCount >= minimum) {
      client.say(
        channel,
        `Vote passed with ${voteCount} votes! Executing !${commandName}...`
      );
      const lua = COMMANDS[commandName]([]);
      if (lua) sendToFactorio(lua);
      setCooldown(commandName, "_vote_system");
    } else {
      client.say(
        channel,
        `Vote for !${commandName} failed (${voteCount}/${minimum} votes required).`
      );
    }
    activeVote = null;
  }, duration * 1000);
}

// ── Random events ──────────────────────────────────────────────────────────────

function startRandomEvents(client, channel) {
  const intervalMs = (config.randomEvents.intervalMinutes || 10) * 60 * 1000;
  const events = config.randomEvents.events || ["meteor", "biter"];

  randomEventTimer = setInterval(() => {
    const pick = events[Math.floor(Math.random() * events.length)];
    if (COMMANDS[pick]) {
      const lua = COMMANDS[pick]([]);
      sendToFactorio(lua);
      client.say(channel, `[Random Event] !${pick} triggered automatically!`);
    }
  }, intervalMs);
}

// ── Message handler ────────────────────────────────────────────────────────────

function handleMessage(client, channel, tags, message) {
  const prefix = config.commands.prefix || "!";
  const text = message.trim();

  // Handle !vote during an active vote
  if (text.toLowerCase() === `${prefix}vote` && activeVote) {
    activeVote.votes.add(tags.username);
    client.say(channel, `@${tags.username} voted! (${activeVote.votes.size} votes)`);
    return;
  }

  if (!text.startsWith(prefix)) return;

  const parts = text.slice(prefix.length).trim().split(/\s+/);
  const commandName = parts[0].toLowerCase();
  const args = parts.slice(1);

  if (!COMMANDS[commandName]) return;

  const userRole = getUserRole(tags);
  const allowedRoles =
    (config.commands.allowedRoles && config.commands.allowedRoles[commandName]) || [];

  if (!isRoleAllowed(userRole, allowedRoles)) {
    client.say(
      channel,
      `@${tags.username} You don't have permission to use !${commandName}.`
    );
    return;
  }

  const userWait = isUserOnCooldown(tags.username);
  if (userWait > 0) {
    client.say(
      channel,
      `@${tags.username} Please wait ${userWait}s before sending another command.`
    );
    return;
  }

  const cmdWait = isOnCooldown(commandName);
  if (cmdWait > 0) {
    client.say(
      channel,
      `@${tags.username} !${commandName} is on cooldown. Try again in ${cmdWait}s.`
    );
    return;
  }

  // Voting mode: queue the command for a vote instead of executing immediately
  if (config.voting && config.voting.enabled) {
    startVote(commandName, client, channel);
    return;
  }

  const lua = COMMANDS[commandName](args);
  if (!lua) return;

  sendToFactorio(lua);
  setCooldown(commandName, tags.username);
  client.say(channel, `@${tags.username} triggered !${commandName}!`);
}

// ── Bot setup ──────────────────────────────────────────────────────────────────

function createClient() {
  return new tmi.Client({
    options: { debug: false },
    identity: {
      username: config.twitch.username,
      password: config.twitch.oauth,
    },
    channels: [config.twitch.channel],
  });
}

function start() {
  const client = createClient();

  client.on("message", (channel, tags, message, self) => {
    if (self) return;
    handleMessage(client, channel, tags, message);
  });

  client.on("connected", (addr, port) => {
    console.log(`[Bot] Connected to ${addr}:${port}`);
    console.log(`[Bot] Listening in channel: ${config.twitch.channel}`);
    if (config.randomEvents && config.randomEvents.enabled) {
      startRandomEvents(client, config.twitch.channel);
      console.log(
        `[Bot] Random events enabled every ${config.randomEvents.intervalMinutes} minutes.`
      );
    }
  });

  client.on("disconnected", (reason) => {
    console.warn(`[Bot] Disconnected: ${reason}`);
    if (randomEventTimer) clearInterval(randomEventTimer);
  });

  client.connect().catch((err) => {
    console.error(`[Bot] Connection error: ${err}`);
    process.exit(1);
  });

  return client;
}

// Export helpers for testing; only start the bot when run directly.
module.exports = {
  getUserRole,
  isRoleAllowed,
  isOnCooldown,
  isUserOnCooldown,
  setCooldown,
  handleMessage,
  COMMANDS,
  lastCommandTime,
  lastUserTime,
};

if (require.main === module) {
  start();
}
