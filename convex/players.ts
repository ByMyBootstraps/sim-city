import { v } from "convex/values";
import { mutation, query, action } from "./_generated/server";
import { ConvexError } from "convex/values";
import { api, internal } from "./_generated/api";

export const spawnPlayer = mutation({
  args: {
    username: v.string(),
    connectionId: v.string(),
  },
  handler: async (ctx, { username, connectionId }) => {
    // Check if username is already taken
    const existing = await ctx.db
      .query("players")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();

    if (existing) {
      throw new ConvexError("Username already taken");
    }

    // Get or create game state
    let gameState = await ctx.db
      .query("gameState")
      .withIndex("by_gameId", (q) => q.eq("gameId", "main"))
      .unique();
      
    if (!gameState) {
      await ctx.db.insert("gameState", {
        gameId: "main",
        status: "waiting",
        firstZombieSelected: false,
      });
    }

    // Spawn player at a safe sidewalk location
    const spawnPoints = [
      { x: 150, y: 200 }, { x: 350, y: 200 }, { x: 550, y: 200 }, { x: 750, y: 200 },
      { x: 150, y: 400 }, { x: 350, y: 400 }, { x: 550, y: 400 }, { x: 750, y: 400 },
      { x: 220, y: 100 }, { x: 220, y: 300 }, { x: 220, y: 500 },
      { x: 420, y: 100 }, { x: 420, y: 300 }, { x: 420, y: 500 },
      { x: 620, y: 100 }, { x: 620, y: 300 }, { x: 620, y: 500 },
    ];
    
    const randomSpawn = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
    
    // Count current players to determine if this should be the first zombie
    const currentPlayers = await ctx.db.query("players").collect();
    const isFirstPlayer = currentPlayers.length === 0;
    
    const playerId = await ctx.db.insert("players", {
      username,
      x: randomSpawn.x,
      y: randomSpawn.y,
      health: 100,
      lastActiveTime: Date.now(),
      isZombie: isFirstPlayer, // First player becomes zombie
      connectionId: connectionId,
    });

    // Update game state if this was the first zombie
    if (isFirstPlayer && gameState) {
      await ctx.db.patch(gameState._id, {
        firstZombieSelected: true,
        status: "playing",
        roundStartTime: Date.now(),
      });
    }

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
    const player = await ctx.db.get(playerId);
    if (!player) return;

    // Update position
    await ctx.db.patch(playerId, {
      x,
      y,
      lastActiveTime: Date.now(),
    });

    // Check for zombie infections if this player is a zombie
    if (player.isZombie === true) {
      const allPlayers = await ctx.db.query("players").collect();
      const humanPlayers = allPlayers.filter(p => p.isZombie !== true && p._id !== playerId);
      
      for (const human of humanPlayers) {
        const distance = Math.sqrt(Math.pow(x - human.x, 2) + Math.pow(y - human.y, 2));
        
        // Infection radius of 25 pixels
        if (distance <= 25) {
          await ctx.db.patch(human._id, {
            isZombie: true,
            health: 100, // Zombies have full health
          });
        }
      }
    }
  },
});

export const getAllPlayers = query({
  args: {},
  handler: async (ctx) => {
    // Get all players that have been active in the last 30 seconds (for real-time cleanup)
    const thirtySecondsAgo = Date.now() - 30 * 1000;
    return await ctx.db
      .query("players")
      .withIndex("by_lastActiveTime", (q) => q.gte("lastActiveTime", thirtySecondsAgo))
      .collect();
  },
});

export const cleanupDisconnectedPlayers = mutation({
  args: {},
  handler: async (ctx) => {
    // Remove players that haven't been active in the last 30 seconds
    const thirtySecondsAgo = Date.now() - 30 * 1000;
    const disconnectedPlayers = await ctx.db
      .query("players")
      .withIndex("by_lastActiveTime", (q) => q.lt("lastActiveTime", thirtySecondsAgo))
      .collect();
      
    for (const player of disconnectedPlayers) {
      await ctx.db.delete(player._id);
    }
    
    return disconnectedPlayers.length;
  },
});

export const getGameState = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("gameState")
      .withIndex("by_gameId", (q) => q.eq("gameId", "main"))
      .unique();
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