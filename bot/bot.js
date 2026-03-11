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

// ── Difficulty tier helpers ────────────────────────────────────────────────────

const DEFAULT_DIFFICULTIES = {
  easy: {
    description: "Fun, low-impact events. Free for everyone via chat.",
    minBits: 0,
    allowedRoles: ["broadcaster", "moderator", "vip", "subscriber", "everyone"],
  },
  medium: {
    description: "Moderate disruption. Requires subscriber or 100 bits.",
    minBits: 100,
    allowedRoles: ["broadcaster", "moderator", "vip", "subscriber"],
  },
  hard: {
    description: "Severe disruption. Requires 500 bits or moderator+.",
    minBits: 500,
    allowedRoles: ["broadcaster", "moderator"],
  },
};

/** Returns the difficulty tier name ("easy" | "medium" | "hard") for a command. */
function getCommandDifficulty(commandName) {
  return (
    (config.commandDifficulty && config.commandDifficulty[commandName]) || "easy"
  );
}

/** Returns the difficulty configuration object for a given tier name. */
function getDifficultyConfig(difficulty) {
  const tiers = config.difficulties || DEFAULT_DIFFICULTIES;
  return tiers[difficulty] || tiers.easy || DEFAULT_DIFFICULTIES.easy;
}

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

/**
 * Returns true if the user's role is in the allowed-roles list for a command.
 */
function isRoleAllowed(userRole, allowedRoles) {
  if (!allowedRoles || allowedRoles.length === 0) return false;
  // If "everyone" is allowed, all roles pass.
  if (allowedRoles.includes("everyone")) return true;
  return allowedRoles.includes(userRole);
}

/**
 * Checks whether a user can execute a command, considering both role and bits.
 * @param {string} commandName
 * @param {string} userRole  - result of getUserRole()
 * @param {number|null} bitsAmount - bits donated in this message (0 or null = none)
 * @returns {{ allowed: boolean, via?: string, difficulty?: string, minBits?: number }}
 */
function canExecuteCommand(commandName, userRole, bitsAmount) {
  const difficulty = getCommandDifficulty(commandName);
  const diffConfig = getDifficultyConfig(difficulty);

  // Role-based access (normal chat command)
  if (isRoleAllowed(userRole, diffConfig.allowedRoles)) {
    return { allowed: true, via: "role" };
  }

  // Bits-based access (cheer event)
  const minBits = diffConfig.minBits || 0;
  if (minBits > 0 && bitsAmount != null && bitsAmount >= minBits) {
    return { allowed: true, via: "bits" };
  }

  return {
    allowed: false,
    difficulty,
    minBits: diffConfig.minBits || 0,
    allowedRoles: diffConfig.allowedRoles,
  };
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
  const globalMs = (config.commands.globalCooldownSeconds || 30) * 1000;
  if (lastUserTime[username] && now - lastUserTime[username] < globalMs) {
    return Math.ceil((globalMs - (now - lastUserTime[username])) / 1000);
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
 */
function sendToFactorio(luaCommand) {
  const fullCommand = `/silent-command ${luaCommand}\n`;

  // RCON path (optional – integrate an npm rcon library in this block)
  if (config.factorio.rconHost && config.factorio.rconPort) {
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
 * Parses an integer coord arg; uses a fallback only when the value is absent or NaN.
 * Explicitly handles 0 as a valid coordinate.
 */
function parseCoord(arg, fallback) {
  const n = parseInt(arg, 10);
  return Number.isNaN(n) ? fallback() : n;
}

/**
 * Each command maps to a function that returns the Lua expression to execute.
 * Commands receive the parsed arguments array (strings after the command word).
 */
const COMMANDS = {
  // ── Easy tier ───────────────────────────────────────────────────────────────

  meteor(args) {
    const x = parseCoord(args[0], () => Math.floor(Math.random() * 400) - 200);
    const y = parseCoord(args[1], () => Math.floor(Math.random() * 400) - 200);
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

  belt_reverse() {
    return `remote.call("twitch_events","belt_reverse")`;
  },

  // ── Medium tier ─────────────────────────────────────────────────────────────

  blackout(args) {
    const duration = Math.min(parseInt(args[0], 10) || 60, 300);
    return `remote.call("twitch_events","blackout",${duration})`;
  },

  ore_delete() {
    return `remote.call("twitch_events","ore_delete")`;
  },

  rail_destroy(args) {
    const count = Math.min(parseInt(args[0], 10) || 10, 50);
    return `remote.call("twitch_events","rail_destroy",${count})`;
  },

  combustion_stop(args) {
    const duration = Math.min(parseInt(args[0], 10) || 60, 300);
    return `remote.call("twitch_events","combustion_stop",${duration})`;
  },

  // ── Hard tier ───────────────────────────────────────────────────────────────

  spawn_inside(args) {
    const count = Math.min(parseInt(args[0], 10) || 5, 15);
    return `remote.call("twitch_events","spawn_inside",${count})`;
  },

  nuke(args) {
    const x = parseCoord(args[0], () => Math.floor(Math.random() * 400) - 200);
    const y = parseCoord(args[1], () => Math.floor(Math.random() * 400) - 200);
    return `remote.call("twitch_events","nuke",${x},${y})`;
  },
};

// ── Cheer (bits) handler ───────────────────────────────────────────────────────

/**
 * Handles a Twitch cheer (bits donation).
 * Parses the cheer message for a command name; if the bit amount meets the
 * tier's minimum threshold the event is executed immediately.
 */
function handleCheer(client, channel, tags, message) {
  const bits = parseInt(tags.bits, 10);
  if (!bits || bits <= 0) return;

  const prefix = config.commands.prefix || "!";
  // Escape the prefix for use inside a RegExp
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = message.match(new RegExp(`${escaped}(\\w+)`, "i"));
  if (!match) return;

  const commandName = match[1].toLowerCase();
  if (!COMMANDS[commandName]) return;

  const difficulty = getCommandDifficulty(commandName);
  const diffConfig = getDifficultyConfig(difficulty);
  const minBits = diffConfig.minBits || 0;

  if (minBits > 0 && bits < minBits) {
    client.say(
      channel,
      `@${tags.username} Need ${minBits} bits to trigger !${commandName} (${difficulty} tier). You donated ${bits} bits.`
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

  const lua = COMMANDS[commandName]([]);
  if (!lua) return;

  sendToFactorio(lua);
  setCooldown(commandName, tags.username);
  client.say(
    channel,
    `@${tags.username} cheered ${bits} bits and triggered !${commandName}! [${difficulty.toUpperCase()}] 🎉`
  );
}

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
  const check = canExecuteCommand(commandName, userRole, null);

  if (!check.allowed) {
    const difficulty = getCommandDifficulty(commandName);
    const diffConfig = getDifficultyConfig(difficulty);
    const minBits = diffConfig.minBits || 0;

    if (minBits > 0) {
      client.say(
        channel,
        `@${tags.username} !${commandName} is a ${difficulty.toUpperCase()} event – requires ${minBits} bits or a higher role.`
      );
    } else {
      client.say(
        channel,
        `@${tags.username} You don't have permission to use !${commandName}.`
      );
    }
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

  const difficulty = getCommandDifficulty(commandName);
  sendToFactorio(lua);
  setCooldown(commandName, tags.username);
  client.say(
    channel,
    `@${tags.username} triggered !${commandName}! [${difficulty.toUpperCase()}]`
  );
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

  client.on("cheer", (channel, tags, message) => {
    handleCheer(client, channel, tags, message);
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
  canExecuteCommand,
  getCommandDifficulty,
  getDifficultyConfig,
  isOnCooldown,
  isUserOnCooldown,
  setCooldown,
  handleMessage,
  handleCheer,
  COMMANDS,
  lastCommandTime,
  lastUserTime,
};

if (require.main === module) {
  start();
}
