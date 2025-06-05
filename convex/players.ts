import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError } from "convex/values";

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

    // Spawn player at a safe sidewalk location
    const spawnPoints = [
      { x: 150, y: 200 }, { x: 350, y: 200 }, { x: 550, y: 200 }, { x: 750, y: 200 },
      { x: 150, y: 400 }, { x: 350, y: 400 }, { x: 550, y: 400 }, { x: 750, y: 400 },
      { x: 220, y: 100 }, { x: 220, y: 300 }, { x: 220, y: 500 },
      { x: 420, y: 100 }, { x: 420, y: 300 }, { x: 420, y: 500 },
      { x: 620, y: 100 }, { x: 620, y: 300 }, { x: 620, y: 500 },
    ];
    
    const randomSpawn = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
    
    // Create player
    const playerId = await ctx.db.insert("players", {
      username,
      x: randomSpawn.x,
      y: randomSpawn.y,
      health: 100,
      lastActiveTime: Date.now(),
      isZombie: false, // Always spawn as human
      connectionId: connectionId,
    });

    // Join the lobby through game manager
    await ctx.runMutation(internal.gameManager.joinLobby, { playerId });

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

    // Get game state
    const gameState = await ctx.db
      .query("gameState")
      .withIndex("by_gameId", (q) => q.eq("gameId", "main"))
      .unique();

    // Update position and activity time
    await ctx.db.patch(playerId, {
      x,
      y,
      lastActiveTime: Date.now(),
    });

    // Only process infections during "playing" state
    if (gameState?.status !== "playing") {
      return;
    }

    // Check for infections during "playing" state only
    if (player.isZombie === true) {
      // Zombie player - check for infecting humans
      const allPlayers = await ctx.db.query("players").collect();
      const humanPlayers = allPlayers.filter(p => 
        p.isZombie !== true && 
        p._id !== playerId &&
        Date.now() - p.lastActiveTime < 30000 // Only active players
      );
      
      for (const human of humanPlayers) {
        const distance = Math.sqrt(Math.pow(x - human.x, 2) + Math.pow(y - human.y, 2));
        
        // Infection radius of 25 pixels
        if (distance <= 25) {
          await ctx.db.patch(human._id, {
            isZombie: true,
            health: 100, // Zombies have full health
          });
          
          // Update player counts and check win conditions
          await ctx.runMutation(internal.gameManager.updatePlayerCounts, {});
          
          // Balance NPCs when human gets infected
          await ctx.runMutation(internal.npcZombies.balanceNPCs, {});
          break; // Only infect one human per update
        }
      }
    } else {
      // Human player - check for NPC infections
      const npcs = await ctx.db.query("npcZombies").collect();
      
      for (const npc of npcs) {
        const distance = Math.sqrt(Math.pow(x - npc.x, 2) + Math.pow(y - npc.y, 2));
        
        // Infection radius of 20 pixels for NPCs
        if (distance <= 20) {
          await ctx.db.patch(playerId, {
            isZombie: true,
            health: 100, // Zombies have full health
          });
          
          // Update player counts and check win conditions
          await ctx.runMutation(internal.gameManager.updatePlayerCounts, {});
          
          // Balance NPCs when human gets infected
          await ctx.runMutation(internal.npcZombies.balanceNPCs, {});
          break; // Player can only be infected once
        }
      }
    }
  },
});

export const getAllPlayers = query({
  args: {},
  handler: async (ctx) => {
    // Get all players that have been active in the last 30 seconds
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
      
    // Handle each disconnected player through game manager
    for (const player of disconnectedPlayers) {
      await ctx.runMutation(internal.gameManager.leaveLobby, { playerId: player._id });
      await ctx.db.delete(player._id);
    }
    
    // Update player counts
    if (disconnectedPlayers.length > 0) {
      await ctx.runMutation(internal.gameManager.updatePlayerCounts, {});
      
      // Rebalance NPCs if during gameplay
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
    await ctx.runMutation(internal.gameManager.leaveLobby, { playerId });
    await ctx.db.delete(playerId);
  },
});

// Legacy functions for backward compatibility - simplified versions
export const startGame = mutation({
  args: {
    playerId: v.id("players"),
  },
  handler: async (ctx, { playerId }) => {
    const gameState = await ctx.db
      .query("gameState")
      .withIndex("by_gameId", (q) => q.eq("gameId", "main"))
      .unique();

    if (!gameState) {
      throw new ConvexError("Game state not found");
    }

    if (gameState.hostPlayerId !== playerId) {
      throw new ConvexError("Only the host can start the game");
    }

    if (gameState.status !== "lobby") {
      throw new ConvexError("Game is not in lobby state");
    }

    const players = await ctx.db.query("players").collect();
    const activePlayers = players.filter(p => Date.now() - p.lastActiveTime < 30000);

    if (activePlayers.length < 2) {
      throw new ConvexError("Need at least 2 players to start");
    }

    // Start countdown
    const countdownEnd = Date.now() + 10000; // 10 seconds
    await ctx.db.patch(gameState._id, {
      gameStartDelay: countdownEnd,
    });

    // Schedule actual game start
    await ctx.scheduler.runAt(countdownEnd, internal.gameManager.actuallyStartGame, {});

    return { success: true, countdownEnd };
  },
});

export const cancelGameStart = mutation({
  args: {
    playerId: v.id("players"),
  },
  handler: async (ctx, { playerId }) => {
    const gameState = await ctx.db
      .query("gameState")
      .withIndex("by_gameId", (q) => q.eq("gameId", "main"))
      .unique();

    if (!gameState) {
      throw new ConvexError("Game state not found");
    }

    if (gameState.hostPlayerId !== playerId) {
      throw new ConvexError("Only the host can cancel game start");
    }

    if (!gameState.gameStartDelay) {
      throw new ConvexError("No game start to cancel");
    }

    await ctx.db.patch(gameState._id, {
      gameStartDelay: undefined,
    });

    return { success: true };
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

