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
    
  gameState: defineTable({
    gameId: v.string(),
    status: v.union(v.literal("waiting"), v.literal("playing"), v.literal("ended")),
    firstZombieSelected: v.boolean(),
    roundStartTime: v.optional(v.number()),
  }).index("by_gameId", ["gameId"]),
});
