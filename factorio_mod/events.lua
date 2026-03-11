-- events.lua
-- Implements all chaos events exposed through the remote interface.
-- One-shot timers are managed via storage tables processed in control.lua's
-- on_tick handler (script.on_nth_tick registers recurring intervals and cannot
-- target a specific future tick directly).

local events = {}

-- ── Helpers ───────────────────────────────────────────────────────────────────

--- Returns the first valid connected player position, or {0,0} as fallback.
local function get_player_position()
  for _, player in pairs(game.players) do
    if player.valid and player.connected then
      return player.position
    end
  end
  return {x = 0, y = 0}
end

--- Clamps a number between min_val and max_val.
local function clamp(value, min_val, max_val)
  return math.max(min_val, math.min(max_val, value))
end

--- Simple Fisher-Yates shuffle (in-place) for a Lua table.
local function shuffle(t)
  for i = #t, 2, -1 do
    local j = math.random(i)
    t[i], t[j] = t[j], t[i]
  end
end

-- ── Meteor ────────────────────────────────────────────────────────────────────

--- Creates a meteorite-style impact explosion at position (x, y).
function events.meteor(x, y)
  local surface = game.surfaces[1]
  local pos = {x = x, y = y}

  surface.create_entity{name = "big-explosion", position = pos}

  local offsets = {
    {-1, -1}, {1, -1}, {-1, 1}, {1, 1},
    {0, -2},  {0, 2},  {-2, 0}, {2, 0},
  }
  for _, off in ipairs(offsets) do
    surface.create_entity{
      name     = "explosion",
      position = {x + off[1], y + off[2]},
    }
  end

  local area = {{x - 3, y - 3}, {x + 3, y + 3}}
  for _, entity in ipairs(surface.find_entities_filtered{area = area, type = "tree"}) do
    entity.destroy()
  end

  game.print("[Twitch] ☄  Meteor impact at (" .. x .. ", " .. y .. ")!")
end

-- ── Biter Attack ──────────────────────────────────────────────────────────────

--- Spawns `count` big biters near random positions around the player.
function events.biter_attack(count)
  local surface = game.surfaces[1]
  count = clamp(count, 1, 20)

  local base = get_player_position()
  local spawned = 0

  for _ = 1, count do
    local x = base.x + math.random(-150, 150)
    local y = base.y + math.random(-150, 150)
    local entity = surface.create_entity{
      name     = "big-biter",
      position = {x, y},
      force    = "enemy",
    }
    if entity then spawned = spawned + 1 end
  end

  game.print("[Twitch] 🦟 Biter attack! " .. spawned .. " biters spawned!")
end

-- ── Storm ─────────────────────────────────────────────────────────────────────
-- Lightning strikes are queued in storage.storm_queue and processed by the
-- on_tick handler in control.lua.

--- Schedules a series of lightning strikes over `duration` seconds.
function events.storm(duration)
  duration = clamp(duration, 10, 300)
  local strikes = math.floor(duration / 2)
  local base = get_player_position()

  if not storage.storm_queue then
    storage.storm_queue = {}
  end

  for i = 1, strikes do
    local target_tick = game.tick + i * 120  -- one strike every 2 s (120 ticks)
    table.insert(storage.storm_queue, {
      tick = target_tick,
      x    = base.x + math.random(-100, 100),
      y    = base.y + math.random(-100, 100),
    })
  end

  game.print("[Twitch] ⚡ Storm incoming for " .. duration .. " seconds!")
end

-- ── Blackout ──────────────────────────────────────────────────────────────────
-- Pole unit-numbers are stored so we can safely re-enable them via
-- game.get_entity_by_unit_number() even if entity references become stale.

--- Disables all electric poles for `duration` seconds, then restores them.
function events.blackout(duration)
  duration = clamp(duration, 5, 300)
  local surface = game.surfaces[1]

  local poles = surface.find_entities_filtered{
    type  = "electric-pole",
    force = "player",
  }

  if not storage.blackout_poles then
    storage.blackout_poles = {}
  end

  local restore_tick = game.tick + (duration * 60)
  local unit_numbers = {}

  for _, pole in ipairs(poles) do
    if pole.valid then
      pole.active = false
      table.insert(unit_numbers, pole.unit_number)
    end
  end

  table.insert(storage.blackout_poles, {
    tick         = restore_tick,
    unit_numbers = unit_numbers,
  })

  game.print("[Twitch] 🔌 BLACKOUT! Power will be restored in " .. duration .. " seconds.")
end

-- ── Belt Reverse ──────────────────────────────────────────────────────────────

--- Reverses the direction of all transport belts owned by the player's force.
function events.belt_reverse()
  local surface = game.surfaces[1]
  local belts = surface.find_entities_filtered{
    type  = {"transport-belt", "fast-transport-belt", "express-transport-belt"},
    force = "player",
  }

  local count = 0
  for _, belt in ipairs(belts) do
    if belt.valid then
      -- Directions: 0=N, 2=E, 4=S, 6=W  (defines.direction values)
      belt.direction = (belt.direction + 4) % 8
      count = count + 1
    end
  end

  game.print("[Twitch] ↔  Belt Reverse! " .. count .. " belts flipped!")
end

-- ── Ore Delete ────────────────────────────────────────────────────────────────

--- Removes all ore resources within a 20-tile radius around the player.
function events.ore_delete()
  local surface = game.surfaces[1]
  local base = get_player_position()
  local radius = 20

  local area = {
    {base.x - radius, base.y - radius},
    {base.x + radius, base.y + radius},
  }

  local resources = surface.find_entities_filtered{area = area, type = "resource"}

  local count = 0
  for _, res in ipairs(resources) do
    if res.valid then
      res.destroy()
      count = count + 1
    end
  end

  game.print("[Twitch] ⛏  Ore deleted! " .. count .. " resource patches removed around the player.")
end

-- ── Rail Destroy ──────────────────────────────────────────────────────────────

--- Randomly destroys up to `count` rail segments near the player's position.
function events.rail_destroy(count)
  local surface = game.surfaces[1]
  count = clamp(count, 1, 50)

  local base = get_player_position()
  local radius = 200
  local area = {
    {base.x - radius, base.y - radius},
    {base.x + radius, base.y + radius},
  }

  local rails = surface.find_entities_filtered{
    type  = {"straight-rail", "curved-rail", "half-diagonal-rail"},
    force = "player",
    area  = area,
  }

  if #rails == 0 then
    game.print("[Twitch] 🚂 Rail Destroy: No rails found nearby!")
    return
  end

  -- Build index list, shuffle, and destroy up to `count` entries
  local indices = {}
  for i = 1, #rails do indices[i] = i end
  shuffle(indices)

  local destroyed = 0
  for i = 1, math.min(count, #indices) do
    local rail = rails[indices[i]]
    if rail and rail.valid then
      rail.destroy()
      destroyed = destroyed + 1
    end
  end

  game.print("[Twitch] 🚂 Rail Destroy! " .. destroyed .. " rail segments removed!")
end

-- ── Combustion Stop ───────────────────────────────────────────────────────────
-- Temporarily disables all burner-powered machines owned by the player.
-- Entity unit-numbers are stored so they can be restored later via
-- game.get_entity_by_unit_number().

--- Halts all burner machines for `duration` seconds, then restores them.
function events.combustion_stop(duration)
  duration = clamp(duration, 5, 300)
  local surface = game.surfaces[1]

  -- Collect candidates by known burner entity types
  local burner_types = {
    "mining-drill",   -- covers burner-mining-drill
    "furnace",        -- stone-furnace, steel-furnace
    "boiler",
    "locomotive",
    "car",
    "tank",
    "artillery-wagon",
  }

  local candidates = surface.find_entities_filtered{
    type  = burner_types,
    force = "player",
  }

  if not storage.combustion_restore then
    storage.combustion_restore = {}
  end

  local restore_tick = game.tick + (duration * 60)
  local unit_numbers = {}

  for _, entity in ipairs(candidates) do
    -- Only disable entities that actually use burner energy
    if entity.valid and entity.burner then
      entity.active = false
      table.insert(unit_numbers, entity.unit_number)
    end
  end

  table.insert(storage.combustion_restore, {
    tick         = restore_tick,
    unit_numbers = unit_numbers,
  })

  game.print("[Twitch] 🔥 Combustion Stop! All burner machines halted for " .. duration .. " seconds!")
end

-- ── Spawn Inside ──────────────────────────────────────────────────────────────

--- Spawns `count` medium biters inside the player's base perimeter by placing
--- them adjacent to random player-owned buildings.
function events.spawn_inside(count)
  local surface = game.surfaces[1]
  count = clamp(count, 1, 15)

  local base = get_player_position()
  local radius = 100

  -- Find player structures to determine base extent
  local buildings = surface.find_entities_filtered{
    force = "player",
    area  = {
      {base.x - radius, base.y - radius},
      {base.x + radius, base.y + radius},
    },
  }

  local spawned = 0

  if #buildings > 0 then
    for _ = 1, count do
      local target = buildings[math.random(#buildings)]
      if target and target.valid then
        local tx = target.position.x + math.random(-5, 5)
        local ty = target.position.y + math.random(-5, 5)
        local entity = surface.create_entity{
          name     = "medium-biter",
          position = {tx, ty},
          force    = "enemy",
        }
        if entity then spawned = spawned + 1 end
      end
    end
  else
    -- Fallback: spawn very close to the player
    for _ = 1, count do
      local entity = surface.create_entity{
        name     = "medium-biter",
        position = {base.x + math.random(-10, 10), base.y + math.random(-10, 10)},
        force    = "enemy",
      }
      if entity then spawned = spawned + 1 end
    end
  end

  game.print("[Twitch] 👾 SPAWN INSIDE! " .. spawned .. " enemies appeared inside your base!")
end

-- ── Nuke ──────────────────────────────────────────────────────────────────────

--- Creates a nuclear explosion at position (x, y).
function events.nuke(x, y)
  local surface = game.surfaces[1]

  surface.create_entity{
    name     = "atomic-rocket",
    position = {x, y},
    force    = "neutral",
  }

  -- Fallback grid of explosions in case atomic-rocket entity is unavailable
  for dx = -5, 5, 2 do
    for dy = -5, 5, 2 do
      surface.create_entity{
        name     = "big-explosion",
        position = {x + dx, y + dy},
      }
    end
  end

  game.print("[Twitch] 💥 NUKE at (" .. x .. ", " .. y .. ")!")
end

return events
