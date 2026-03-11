# Setup Guide – Twitch Factorio Chaos

## Prerequisites

| Requirement | Details |
|---|---|
| **Node.js** | ≥ 16.0 |
| **Factorio** | Version 1.1 or later |
| **Twitch account** | A dedicated bot account is recommended |

---

## 1 – Twitch Bot Credentials

1. Create (or use an existing) Twitch account for your bot.
2. Generate an OAuth token at <https://twitchapps.com/tmi/>.
3. Keep the token safe – it grants chat access to the account.

---

## 2 – Install Node.js Dependencies

```bash
cd bot
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

1. Copy the `factorio_mod/` folder to your Factorio mods directory:

   | OS | Path |
   |---|---|
   | Windows | `%APPDATA%\Factorio\mods\twitch-factorio-chaos_1.0.0` |
   | Linux   | `~/.factorio/mods/twitch-factorio-chaos_1.0.0` |
   | macOS   | `~/Library/Application Support/factorio/mods/twitch-factorio-chaos_1.0.0` |

2. Rename the folder to match the mod naming convention:  
   `twitch-factorio-chaos_1.0.0`

3. Enable the mod from the Factorio in-game mod manager.

---

## 5 – Wire Up the Console File

The bot writes `/silent-command` instructions to a plain text file.  
Factorio can execute these via the in-game Lua console **or** you can watch the
file externally and paste commands.

A simpler approach is to use **RCON** (see *Optional: RCON* below).

### Quick workaround (manual)

Open Factorio's in-game console and run:

```lua
/silent-command game.print("Mod active!")
```

If you see the message, the mod is correctly installed.

---

## 6 – Start the Bot

```bash
node bot/bot.js
```

The bot will connect to your Twitch channel and start listening for commands.

---

## Available Chat Commands

| Command | Description | Min. Role |
|---|---|---|
| `!meteor [x] [y]` | Meteorite impact at optional coordinates | everyone |
| `!biter [count]` | Spawn biters (1–20, default 5) | everyone |
| `!storm [duration]` | Lightning storm for *duration* seconds | everyone |
| `!blackout [duration]` | Power outage for *duration* seconds | vip |
| `!belt_reverse` | Reverse all transport belts | everyone |
| `!ore_delete` | Delete ore near the player | vip |
| `!nuke [x] [y]` | Nuclear explosion | moderator |

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
Viewers type `!vote` to support it.  The event fires only if enough votes
accumulate.

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
instead of the file-based approach.  You can integrate an npm RCON library
(e.g. `rcon`) in `bot/bot.js` in the `sendToFactorio` function.

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
| Command works in Twitch but nothing happens in-game | Open the Factorio console and check for Lua errors |
