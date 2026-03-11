# Setup Guide – Twitch Factorio Chaos

## Prerequisites

| Requirement | Details |
|---|---|
| **Node.js** | ≥ 18.0 (required for `node --test` test runner) |
| **Factorio** | Version 2.0 or later |
| **Twitch account** | A dedicated bot account is recommended |

---

## 1 – Twitch Bot Credentials

1. Create (or use an existing) Twitch account for your bot.
2. Generate an OAuth token at <https://twitchapps.com/tmi/>.
3. Keep the token safe – it grants chat access to the account.

---

## 2 – Install Node.js Dependencies

From the **repository root** (where `package.json` lives):

```bash
npm install
```

---

## 3 – Configure the Bot

Edit `bot/config.json`:

```json
{
  "twitch": {
    "username": "YOUR_BOT_USERNAME",
    "oauth":    "oauth:YOUR_OAUTH_TOKEN",
    "channel":  "YOUR_CHANNEL_NAME"
  },
  "factorio": {
    "consolePath": "C:/Users/YOU/AppData/Roaming/Factorio/script-output/commands.txt"
  }
}
```

> **consolePath** must point to a file inside Factorio's `script-output` folder.  
> On Linux the path is usually `~/.factorio/script-output/commands.txt`.

---

## 4 – Install the Factorio Mod

1. Copy the `factorio_mod/` folder to your Factorio mods directory and rename it to match the mod naming convention:

   `twitch-factorio-chaos_1.0.0`

   | OS | Path |
   |---|---|
   | Windows | `%APPDATA%\Factorio\mods\twitch-factorio-chaos_1.0.0` |
   | Linux   | `~/.factorio/mods/twitch-factorio-chaos_1.0.0` |
   | macOS   | `~/Library/Application Support/factorio/mods/twitch-factorio-chaos_1.0.0` |

2. Enable the mod from the Factorio in-game mod manager.

---

## 5 – Start the Bot

```bash
node bot/bot.js
```

The bot will connect to your Twitch channel and start listening for commands.

---

## Difficulty Tiers & Twitch Monetization

Events are grouped into three tiers. You can adjust the thresholds in `bot/config.json` under `difficulties`.

| Tier | Access | Default Bit Cost | Description |
|---|---|---|---|
| 🟢 **Easy** | Everyone (free chat command) | 0 bits | Low-impact, fun events |
| 🟡 **Medium** | Subscribers **or** 100 bits | 100 bits | Moderate disruption |
| 🔴 **Hard** | Moderators+ **or** 500 bits | 500 bits | Severe disruption |

### How viewers trigger events

- **Chat command** – type the command in chat. Access is controlled by your Twitch role.
- **Bits (cheer)** – cheer bits and include the command in your message:
  `Cheer500 !nuke`  
  If your bit amount meets or exceeds the tier's `minBits` threshold the event fires immediately.

### Customising thresholds

In `bot/config.json`, change `minBits` per tier:

```json
"difficulties": {
  "medium": { "minBits": 200 },
  "hard":   { "minBits": 1000 }
}
```

To change which roles are allowed for each tier, edit `allowedRoles`.

---

## Available Chat Commands

| Command | Difficulty | Description |
|---|---|---|
| `!meteor [x] [y]` | 🟢 Easy | Meteorite impact at optional coordinates |
| `!biter [count]` | 🟢 Easy | Spawn biters (1–20, default 5) |
| `!storm [duration]` | 🟢 Easy | Lightning storm for *duration* seconds |
| `!belt_reverse` | 🟢 Easy | Reverse all transport belts |
| `!blackout [duration]` | 🟡 Medium | Power outage for *duration* seconds |
| `!ore_delete` | 🟡 Medium | Delete ore near the player |
| `!rail_destroy [count]` | 🟡 Medium | Destroy random rail segments (1–50) |
| `!combustion_stop [duration]` | 🟡 Medium | Halt all burner machines temporarily |
| `!spawn_inside [count]` | 🔴 Hard | Spawn enemies inside the base |
| `!nuke [x] [y]` | 🔴 Hard | Nuclear explosion |

---

## Optional: Voting Mode

Enable in `config.json`:

```json
"voting": {
  "enabled": true,
  "durationSeconds": 30,
  "minimumVotes": 3
}
```

When active, triggering a command starts a 30-second vote.  
Viewers type `!vote` to support it. The event fires only if enough votes accumulate.

---

## Optional: Random Events

```json
"randomEvents": {
  "enabled": true,
  "intervalMinutes": 10,
  "events": ["meteor", "biter", "storm"]
}
```

The bot randomly selects and fires one of the listed events every N minutes.

---

## Optional: RCON

1. Start Factorio with `--rcon-port 27015 --rcon-password secret`.
2. Fill in the RCON fields in `config.json`:

```json
"factorio": {
  "rconHost": "127.0.0.1",
  "rconPort": 27015,
  "rconPassword": "secret"
}
```

The bot detects a non-empty `rconHost` and routes commands through RCON
instead of the file-based approach. You can integrate an npm RCON library
(e.g. `rcon`) in `bot/bot.js` inside the `sendToFactorio` function.

---

## Running Tests

```bash
node --test bot/bot.test.js
```

---

## Troubleshooting

| Symptom | Solution |
|---|---|
| Bot can't connect | Check username / OAuth token in config.json |
| Events don't fire | Verify `consolePath` is correct and the mod is enabled |
| `permission denied` on file write | Ensure the bot process has write access to script-output |
| Command works in chat but nothing happens in-game | Open the Factorio console and check for Lua errors |
| Bits event not triggering | Make sure the bit amount meets the tier threshold in config.json |
| Combustion machines not restarting | Verify the mod is installed and Factorio 2.0 is being used |
