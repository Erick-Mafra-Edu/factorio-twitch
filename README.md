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
│   └── config.json     # Configuration (credentials, difficulty tiers, cooldowns)
├── factorio_mod/
│   ├── info.json       # Mod metadata (Factorio 2.0)
│   ├── control.lua     # Remote interface registration + tick-based timers
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

## Difficulty Tiers & Twitch Monetization

Events are grouped into tiers. Thresholds are configurable in `bot/config.json`.

| Tier | Chat Access | Bits to unlock |
|---|---|---|
| 🟢 Easy | Everyone | 0 |
| 🟡 Medium | Subscribers+ | 100 bits |
| 🔴 Hard | Moderators+ | 500 bits |

Viewers can use bits to bypass role restrictions – just cheer the required amount
and include the command in the message: `Cheer500 !nuke`

## Chat Commands

| Command | Tier | Description |
|---|---|---|
| `!meteor [x] [y]` | 🟢 Easy | Meteorite impact |
| `!biter [count]` | 🟢 Easy | Spawn biters (max 20) |
| `!storm [duration]` | 🟢 Easy | Lightning storm |
| `!belt_reverse` | 🟢 Easy | Reverse all belts |
| `!blackout [duration]` | 🟡 Medium | Power outage |
| `!ore_delete` | 🟡 Medium | Delete nearby ore |
| `!rail_destroy [count]` | 🟡 Medium | Destroy random rails |
| `!combustion_stop [duration]` | 🟡 Medium | Halt all burner machines |
| `!spawn_inside [count]` | 🔴 Hard | Spawn enemies inside base |
| `!nuke [x] [y]` | 🔴 Hard | Nuclear explosion |

See [docs/setup.md](docs/setup.md) for the full setup guide, voting mode,
random events, RCON support, and troubleshooting.

## Running Tests

```bash
node --test bot/bot.test.js
```
