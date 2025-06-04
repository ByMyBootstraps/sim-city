import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ConvexError } from "convex/values";

export const spawnPlayer = mutation({
  args: {
    username: v.string(),
  },
  handler: async (ctx, { username }) => {
    // Check if username is already taken
    const existing = await ctx.db
      .query("players")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();

    if (existing) {
      throw new ConvexError("Username already taken");
    }

    // Spawn player at random position
    const playerId = await ctx.db.insert("players", {
      username,
      x: Math.floor(Math.random() * 800) + 100, // Random x between 100-900
      y: Math.floor(Math.random() * 600) + 100, // Random y between 100-700
      health: 100,
      lastActiveTime: Date.now(),
    });

    return playerId;
  },
});

export const updatePlayerPosition = mutation({
  args: {
    playerId: v.id("players"),
    x: v.number(),
    y: v.number(),
  },
  handler: async (ctx, { playerId, x, y }) => {
    await ctx.db.patch(playerId, {
      x,
      y,
      lastActiveTime: Date.now(),
    });
  },
});

export const getAllPlayers = query({
  args: {},
  handler: async (ctx) => {
    // Get all players that have been active in the last 5 minutes
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    return await ctx.db
      .query("players")
      .withIndex("by_lastActiveTime", (q) => q.gte("lastActiveTime", fiveMinutesAgo))
      .collect();
  },
});

export const getPlayerByUsername = query({
  args: {
    username: v.string(),
  },
  handler: async (ctx, { username }) => {
    return await ctx.db
      .query("players")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
  },
});

export const disconnectPlayer = mutation({
  args: {
    playerId: v.id("players"),
  },
  handler: async (ctx, { playerId }) => {
    await ctx.db.delete(playerId);
  },
});