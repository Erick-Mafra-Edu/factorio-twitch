# Twitch Factorio Chaos

> Let your Twitch chat trigger live chaos events inside Factorio!

## Architecture

```
Twitch Chat
    ↓
Bot (Node.js + tmi.js)
    ↓
/silent-command → Factorio console file  (or RCON)
    ↓
Lua Mod  (remote interface "twitch_events")
    ↓
In-game event executed
```

## Project Structure

```
factorio-twitch/
├── bot/
│   ├── bot.js          # Node.js Twitch bot
│   ├── bot.test.js     # Unit tests
│   └── config.json     # Configuration (credentials, cooldowns, permissions)
├── factorio_mod/
│   ├── info.json       # Mod metadata
│   ├── control.lua     # Remote interface registration
│   └── events.lua      # Event implementations
├── docs/
│   └── setup.md        # Full setup guide
└── package.json
```

## Quick Start

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure** `bot/config.json` with your Twitch credentials and Factorio path.

3. **Install the mod** – copy `factorio_mod/` into your Factorio mods directory
   (rename to `twitch-factorio-chaos_1.0.0`).

4. **Run the bot**

   ```bash
   node bot/bot.js
   ```

5. Start a game with the mod enabled and watch your chat control the chaos!

## Chat Commands

| Command | Description | Min. Role |
|---|---|---|
| `!meteor [x] [y]` | Meteorite impact | everyone |
| `!biter [count]` | Spawn biters (max 20) | everyone |
| `!storm [duration]` | Lightning storm | everyone |
| `!blackout [duration]` | Power outage | vip |
| `!belt_reverse` | Reverse all belts | everyone |
| `!ore_delete` | Delete nearby ore | vip |
| `!nuke [x] [y]` | Nuclear explosion | moderator |

See [docs/setup.md](docs/setup.md) for the full setup guide, voting mode,
random events, RCON support, and troubleshooting.

## Running Tests

```bash
node --test bot/bot.test.js
```
