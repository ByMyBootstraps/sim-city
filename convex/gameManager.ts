import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError } from "convex/values";

// Game constants
const GAME_CONFIG = {
  MIN_PLAYERS_TO_START: 2, // Minimum players needed to start
  MAX_PLAYERS: 20, // Maximum players allowed
  GAME_START_COUNTDOWN: 10000, // 10 seconds countdown before game starts
  GAME_DURATION: 300000, // 5 minutes game duration
  LOBBY_TIMEOUT: 600000, // 10 minutes lobby timeout
} as const;

// Initialize or get the single game instance
export const initializeGame = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Check if game state already exists
    const existing = await ctx.db
      .query("gameState")
      .withIndex("by_gameId", (q) => q.eq("gameId", "main"))
      .unique();

    if (existing) {
      return existing._id;
    }

    // Create new game state
    const gameStateId = await ctx.db.insert("gameState", {
      gameId: "main",
      status: "lobby",
      hostPlayerId: undefined,
      roundStartTime: undefined,
      roundEndTime: undefined,
      lastNPCUpdate: undefined,
      playerCount: 0,
      zombieCount: 0,
      gameStartDelay: undefined,
      firstZombieSelected: false,
    });

    return gameStateId;
  },
});

// Get current game state
export const getGameState = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("gameState")
      .withIndex("by_gameId", (q) => q.eq("gameId", "main"))
      .unique();
  },
});

// Join the lobby (called when a player spawns)
export const joinLobby = internalMutation({
  args: {
    playerId: v.id("players"),
  },
  handler: async (ctx, { playerId }) => {
    // Ensure game state exists
    await ctx.runMutation(internal.gameManager.initializeGame, {});
    
    const gameState = await ctx.db
      .query("gameState")
      .withIndex("by_gameId", (q) => q.eq("gameId", "main"))
      .unique();

    if (!gameState) {
      throw new ConvexError("Failed to initialize game state");
    }

    // Count current active players
    const players = await ctx.db.query("players").collect();
    const activePlayers = players.filter(p => Date.now() - p.lastActiveTime < 30000);

    // Check if lobby is full
    if (activePlayers.length >= GAME_CONFIG.MAX_PLAYERS) {
      throw new ConvexError("Lobby is full");
    }

    // Reset game state to lobby if in ended state
    if (gameState.status === "ended") {
      await ctx.db.patch(gameState._id, {
        status: "lobby",
        hostPlayerId: undefined,
        roundStartTime: undefined,
        roundEndTime: undefined,
        zombieCount: 0,
        gameStartDelay: undefined,
      });
    }

    // Assign host if no host exists
    if (!gameState.hostPlayerId) {
      await ctx.db.patch(gameState._id, {
        hostPlayerId: playerId,
        playerCount: activePlayers.length,
      });
    } else {
      // Just update player count
      await ctx.db.patch(gameState._id, {
        playerCount: activePlayers.length,
      });
    }

    return { success: true, isHost: !gameState.hostPlayerId || gameState.hostPlayerId === playerId };
  },
});

// Leave the lobby/game (called when a player disconnects)
export const leaveLobby = internalMutation({
  args: {
    playerId: v.id("players"),
  },
  handler: async (ctx, { playerId }) => {
    const gameState = await ctx.db
      .query("gameState")
      .withIndex("by_gameId", (q) => q.eq("gameId", "main"))
      .unique();

    if (!gameState) return;

    // Count remaining active players (excluding the one leaving)
    const players = await ctx.db.query("players").collect();
    const remainingPlayers = players.filter(p => 
      p._id !== playerId && Date.now() - p.lastActiveTime < 30000
    );

    // If this was the host, assign new host
    if (gameState.hostPlayerId === playerId && remainingPlayers.length > 0) {
      await ctx.db.patch(gameState._id, {
        hostPlayerId: remainingPlayers[0]._id,
        playerCount: remainingPlayers.length,
      });
    } else if (remainingPlayers.length === 0) {
      // No players left, reset to lobby
      await ctx.db.patch(gameState._id, {
        status: "lobby",
        hostPlayerId: undefined,
        roundStartTime: undefined,
        roundEndTime: undefined,
        playerCount: 0,
        zombieCount: 0,
        gameStartDelay: undefined,
      });
      
      // Clear all NPCs
      await ctx.runMutation(internal.npcZombies.clearAllNPCs, {});
    } else {
      // Just update player count
      await ctx.db.patch(gameState._id, {
        playerCount: remainingPlayers.length,
      });
    }
  },
});

// Start game countdown (host only)
export const startGameCountdown = mutation({
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

    // Check if player is host
    if (gameState.hostPlayerId !== playerId) {
      throw new ConvexError("Only the host can start the game");
    }

    // Check if in lobby
    if (gameState.status !== "lobby") {
      throw new ConvexError("Game is not in lobby state");
    }

    // Count current players
    const players = await ctx.db.query("players").collect();
    const activePlayers = players.filter(p => Date.now() - p.lastActiveTime < 30000);
    
    // Check minimum players
    if (activePlayers.length < GAME_CONFIG.MIN_PLAYERS_TO_START) {
      throw new ConvexError(`Need at least ${GAME_CONFIG.MIN_PLAYERS_TO_START} players to start`);
    }

    // Start countdown
    const countdownEnd = Date.now() + GAME_CONFIG.GAME_START_COUNTDOWN;
    await ctx.db.patch(gameState._id, {
      gameStartDelay: countdownEnd,
    });

    // Schedule actual game start
    await ctx.scheduler.runAt(countdownEnd, internal.gameManager.actuallyStartGame, {});

    return { success: true, countdownEnd };
  },
});

// Actually start the game (scheduled function)
export const actuallyStartGame = internalMutation({
  args: {},
  handler: async (ctx) => {
    const gameState = await ctx.db
      .query("gameState")
      .withIndex("by_gameId", (q) => q.eq("gameId", "main"))
      .unique();

    if (!gameState || gameState.status !== "lobby") {
      return; // Game was cancelled or already started
    }

    // Get all active players
    const players = await ctx.db.query("players").collect();
    const activePlayers = players.filter(p => Date.now() - p.lastActiveTime < 30000);

    if (activePlayers.length < GAME_CONFIG.MIN_PLAYERS_TO_START) {
      // Not enough players, cancel start
      await ctx.db.patch(gameState._id, {
        gameStartDelay: undefined,
      });
      return;
    }

    // Reset all players to human state
    for (const player of activePlayers) {
      await ctx.db.patch(player._id, {
        isZombie: false,
        health: 100,
      });
    }

    // Pick random player to be first zombie
    const randomIndex = Math.floor(Math.random() * activePlayers.length);
    const firstZombie = activePlayers[randomIndex];
    await ctx.db.patch(firstZombie._id, {
      isZombie: true,
      health: 100,
    });

    // Update game state to playing
    const now = Date.now();
    await ctx.db.patch(gameState._id, {
      status: "playing",
      roundStartTime: now,
      roundEndTime: now + GAME_CONFIG.GAME_DURATION,
      playerCount: activePlayers.length,
      zombieCount: 1,
      gameStartDelay: undefined,
    });

    // Balance NPCs for the new game
    await ctx.runMutation(internal.npcZombies.balanceNPCs, {});

    // Schedule game end
    await ctx.scheduler.runAt(now + GAME_CONFIG.GAME_DURATION, internal.gameManager.endGame, {});
  },
});

// End the game (scheduled function or manual)
export const endGame = internalMutation({
  args: {},
  handler: async (ctx) => {
    const gameState = await ctx.db
      .query("gameState")
      .withIndex("by_gameId", (q) => q.eq("gameId", "main"))
      .unique();

    if (!gameState || gameState.status !== "playing") {
      return; // Game not playing
    }

    // Count final stats
    const players = await ctx.db.query("players").collect();
    const activePlayers = players.filter(p => Date.now() - p.lastActiveTime < 30000);
    const zombies = activePlayers.filter(p => p.isZombie === true);

    // Update game state to ended
    await ctx.db.patch(gameState._id, {
      status: "ended",
      roundEndTime: Date.now(),
      zombieCount: zombies.length,
    });

    // Clear all NPCs
    await ctx.runMutation(internal.npcZombies.clearAllNPCs, {});

    // Schedule return to lobby after 10 seconds
    await ctx.scheduler.runAfter(10000, internal.gameManager.returnToLobby, {});
  },
});

// Return to lobby (scheduled function)
export const returnToLobby = internalMutation({
  args: {},
  handler: async (ctx) => {
    const gameState = await ctx.db
      .query("gameState")
      .withIndex("by_gameId", (q) => q.eq("gameId", "main"))
      .unique();

    if (!gameState) return;

    // Get active players
    const players = await ctx.db.query("players").collect();
    const activePlayers = players.filter(p => Date.now() - p.lastActiveTime < 30000);

    // Reset all players to human state
    for (const player of activePlayers) {
      await ctx.db.patch(player._id, {
        isZombie: false,
        health: 100,
      });
    }

    // Return to lobby state
    await ctx.db.patch(gameState._id, {
      status: "lobby",
      roundStartTime: undefined,
      roundEndTime: undefined,
      zombieCount: 0,
      gameStartDelay: undefined,
      playerCount: activePlayers.length,
      // Keep existing host if they're still active
      hostPlayerId: activePlayers.find(p => p._id === gameState.hostPlayerId) 
        ? gameState.hostPlayerId 
        : (activePlayers.length > 0 ? activePlayers[0]._id : undefined),
    });
  },
});

// Update player counts (called periodically)
export const updatePlayerCounts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const gameState = await ctx.db
      .query("gameState")
      .withIndex("by_gameId", (q) => q.eq("gameId", "main"))
      .unique();

    if (!gameState) return;

    // Count active players
    const players = await ctx.db.query("players").collect();
    const activePlayers = players.filter(p => Date.now() - p.lastActiveTime < 30000);
    const zombies = activePlayers.filter(p => p.isZombie === true);

    await ctx.db.patch(gameState._id, {
      playerCount: activePlayers.length,
      zombieCount: zombies.length,
    });

    // Check win conditions during game
    if (gameState.status === "playing") {
      const humans = activePlayers.filter(p => p.isZombie !== true);
      
      // If all humans are infected or no humans left, end game early
      if (humans.length === 0 && activePlayers.length > 0) {
        await ctx.runMutation(internal.gameManager.endGame, {});
      }
    }
  },
});

// Cancel game start (host only)
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