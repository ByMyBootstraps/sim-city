import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ConvexError } from "convex/values";
import { internal } from "./_generated/api";

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

    // Get current players to determine if this is the first player
    const existingPlayers = await ctx.db.query("players").collect();
    const isFirstPlayer = existingPlayers.length === 0;

    // Get or create game state
    let gameState = await ctx.db
      .query("gameState")
      .withIndex("by_gameId", (q) => q.eq("gameId", "main"))
      .unique();
      
    if (!gameState) {
      const gameStateId = await ctx.db.insert("gameState", {
        gameId: "main",
        status: "lobby",
        firstZombieSelected: false,
        hostPlayerId: undefined, // Will be set below for first player
      });
      
      // Fetch the newly created game state
      gameState = await ctx.db.get(gameStateId);
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
    
    // Players spawn as humans by default - no automatic zombie creation
    const isFirstZombie = false;
    
    const playerId = await ctx.db.insert("players", {
      username,
      x: randomSpawn.x,
      y: randomSpawn.y,
      health: 100,
      lastActiveTime: Date.now(),
      isZombie: isFirstZombie, // Players start as humans in lobby
      connectionId: connectionId,
    });

    // Set first player as host if this is the first player
    if (isFirstPlayer && gameState) {
      await ctx.db.patch(gameState._id, {
        hostPlayerId: playerId,
      });
    }

    // Don't balance NPCs in lobby - only during gameplay
    // await ctx.runMutation(internal.npcZombies.balanceNPCs, {});

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

    // Check game state - only allow infections during "playing" state
    const gameState = await ctx.db
      .query("gameState")
      .withIndex("by_gameId", (q) => q.eq("gameId", "main"))
      .unique();

    // Update position
    await ctx.db.patch(playerId, {
      x,
      y,
      lastActiveTime: Date.now(),
    });

    // Check for infections during "playing" state only
    if (gameState?.status === "playing") {
      // Check for player-to-player zombie infections if this player is a zombie
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
            
            // When a human gets infected, rebalance NPCs (one less human = 10 fewer NPCs needed)
            await ctx.runMutation(internal.npcZombies.balanceNPCs, {});
          }
        }
      }
      
      // Check for NPC-to-player infections (if this player is human)
      if (player.isZombie !== true) {
        const npcs = await ctx.db.query("npcZombies").collect();
        
        for (const npc of npcs) {
          const distance = Math.sqrt(Math.pow(x - npc.x, 2) + Math.pow(y - npc.y, 2));
          
          // Infection radius of 20 pixels for NPCs
          if (distance <= 20) {
            await ctx.db.patch(playerId, {
              isZombie: true,
              health: 100, // Zombies have full health
            });
            
            // When a human gets infected, rebalance NPCs
            await ctx.runMutation(internal.npcZombies.balanceNPCs, {});
            break; // Player can only be infected once
          }
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
    
    // Rebalance NPCs after cleanup - only during gameplay
    if (disconnectedPlayers.length > 0) {
      const gameState = await ctx.db
        .query("gameState")
        .withIndex("by_gameId", (q) => q.eq("gameId", "main"))
        .unique();
      
      if (gameState?.status === "playing") {
        await ctx.runMutation(internal.npcZombies.balanceNPCs, {});
      }
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

export const startGame = mutation({
  args: {
    playerId: v.id("players"),
  },
  handler: async (ctx, { playerId }) => {
    // Get game state
    const gameState = await ctx.db
      .query("gameState")
      .withIndex("by_gameId", (q) => q.eq("gameId", "main"))
      .unique();

    if (!gameState) {
      throw new ConvexError("Game state not found");
    }

    // Check if this player is the host
    if (gameState.hostPlayerId !== playerId) {
      throw new ConvexError("Only the host can start the game");
    }

    // Check if game is in lobby state
    if (gameState.status !== "lobby") {
      throw new ConvexError("Game is not in lobby state");
    }

    // Get all players to make first one a zombie
    const players = await ctx.db.query("players").collect();
    if (players.length === 0) {
      throw new ConvexError("No players found");
    }

    // Make the first player (host) a zombie
    const hostPlayer = players.find(p => p._id === playerId);
    if (hostPlayer) {
      await ctx.db.patch(playerId, {
        isZombie: true,
        health: 100,
      });
    }

    // Update game state to playing
    await ctx.db.patch(gameState._id, {
      status: "playing",
      firstZombieSelected: true,
      roundStartTime: Date.now(),
    });

    // Now that game is playing, balance NPCs for the new zombie
    await ctx.runMutation(internal.npcZombies.balanceNPCs, {});

    return { success: true };
  },
});

// Reset game to lobby state for testing
export const resetGameToLobby = mutation({
  args: {},
  handler: async (ctx) => {
    // Delete all players
    const players = await ctx.db.query("players").collect();
    for (const player of players) {
      await ctx.db.delete(player._id);
    }

    // Delete all NPCs
    const npcs = await ctx.db.query("npcZombies").collect();
    for (const npc of npcs) {
      await ctx.db.delete(npc._id);
    }

    // Reset or delete game state
    const gameState = await ctx.db
      .query("gameState")
      .withIndex("by_gameId", (q) => q.eq("gameId", "main"))
      .unique();

    if (gameState) {
      await ctx.db.delete(gameState._id);
    }

    return { success: true };
  },
});