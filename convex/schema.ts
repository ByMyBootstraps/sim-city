import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  players: defineTable({
    username: v.string(),
    x: v.number(),
    y: v.number(),
    health: v.number(),
    lastActiveTime: v.number(),
    isZombie: v.optional(v.boolean()), // Optional for backward compatibility
    connectionId: v.optional(v.string()), // Optional for backward compatibility
  })
    .index("by_username", ["username"])
    .index("by_lastActiveTime", ["lastActiveTime"])
    .index("by_connectionId", ["connectionId"])
    .index("by_isZombie", ["isZombie"]),
    
  npcZombies: defineTable({
    x: v.number(),
    y: v.number(),
    targetX: v.number(),
    targetY: v.number(),
    speed: v.number(),
    lastMoveTime: v.number(),
    wanderCooldown: v.number(),
  }),
    
  gameState: defineTable({
    gameId: v.string(), // Always "main" for single game instance
    status: v.union(v.literal("lobby"), v.literal("playing"), v.literal("ended")),
    hostPlayerId: v.optional(v.id("players")), // Current host who can control game
    roundStartTime: v.optional(v.number()), // When current round started
    roundEndTime: v.optional(v.number()), // When current round ended
    lastNPCUpdate: v.optional(v.number()), // Track last NPC update to prevent conflicts
    playerCount: v.optional(v.number()), // Current number of active players
    zombieCount: v.optional(v.number()), // Current number of zombies
    gameStartDelay: v.optional(v.number()), // Countdown timer for game start
    // Legacy fields for backward compatibility
    firstZombieSelected: v.optional(v.boolean()),
  }).index("by_gameId", ["gameId"]),
});
