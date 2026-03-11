-- control.lua
-- Entry point for the Twitch Factorio Chaos mod.
-- Registers the remote interface so the bot can trigger events via
--   /silent-command remote.call("twitch_events", "<event>", ...)

local events = require("events")

-- ── Remote Interface ──────────────────────────────────────────────────────────

remote.add_interface("twitch_events", {

  --- Meteorite impact at (x, y).
  meteor = function(x, y)
    events.meteor(x, y)
  end,

  --- Biter attack: spawns `count` big biters (1–20).
  biter_attack = function(count)
    events.biter_attack(count)
  end,

  --- Lightning storm lasting `duration` seconds (10–300).
  storm = function(duration)
    events.storm(duration)
  end,

  --- Blackout: disables the power grid for `duration` seconds (5–300).
  blackout = function(duration)
    events.blackout(duration)
  end,

  --- Reverses all transport belts on the map.
  belt_reverse = function()
    events.belt_reverse()
  end,

  --- Deletes ore resources near the player.
  ore_delete = function()
    events.ore_delete()
  end,

  --- Nuclear explosion at (x, y).
  nuke = function(x, y)
    events.nuke(x, y)
  end,

})

-- ── Tick-based one-shot timer processing ──────────────────────────────────────
-- storm_queue and blackout_poles are populated by events.lua and consumed here.

local function process_timers(event)
  local tick = event.tick

  -- Storm: fire pending lightning strikes whose target tick has arrived
  if storage.storm_queue and #storage.storm_queue > 0 then
    local remaining = {}
    for _, strike in ipairs(storage.storm_queue) do
      if tick >= strike.tick then
        local surface = game.surfaces[1]
        if surface and surface.valid then
          surface.create_entity{name = "lightning", position = {strike.x, strike.y}}
        end
      else
        table.insert(remaining, strike)
      end
    end
    storage.storm_queue = remaining
  end

  -- Blackout: restore poles when their duration has expired
  if storage.blackout_poles and #storage.blackout_poles > 0 then
    local remaining = {}
    for _, entry in ipairs(storage.blackout_poles) do
      if tick >= entry.tick then
        local surface = game.surfaces[1]
        if surface and surface.valid then
          -- Re-enable by unit number; works even if the original reference is gone
          for _, unit_number in ipairs(entry.unit_numbers) do
            local pole = surface.find_entity_by_unit_number(unit_number)
            if pole and pole.valid then
              pole.active = true
            end
          end
        end
        game.print("[Twitch] 💡 Power restored!")
      else
        table.insert(remaining, entry)
      end
    end
    storage.blackout_poles = remaining
  end
end

-- ── Initialisation ────────────────────────────────────────────────────────────

script.on_init(function()
  storage.storm_queue    = storage.storm_queue    or {}
  storage.blackout_poles = storage.blackout_poles or {}
  game.print("[Twitch Chaos] Mod loaded! Remote interface 'twitch_events' is active.")
end)

script.on_load(function()
  -- storage is restored automatically by the engine on load.
end)

script.on_event(defines.events.on_tick, process_timers)
