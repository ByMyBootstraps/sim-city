import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  players: defineTable({
    username: v.string(),
    x: v.number(),
    y: v.number(),
    health: v.number(),
    lastActiveTime: v.number(),
  })
    .index("by_username", ["username"])
    .index("by_lastActiveTime", ["lastActiveTime"]),
});
