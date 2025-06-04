import { v } from "convex/values";
import { mutation, query, action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

// Spawn NPC zombies
export const spawnNPCZombies = internalMutation({
  args: {
    count: v.number(),
  },
  handler: async (ctx, { count }) => {
    const spawnPoints = [
      { x: 150, y: 200 }, { x: 350, y: 200 }, { x: 550, y: 200 }, { x: 750, y: 200 },
      { x: 150, y: 400 }, { x: 350, y: 400 }, { x: 550, y: 400 }, { x: 750, y: 400 },
      { x: 220, y: 100 }, { x: 220, y: 300 }, { x: 220, y: 500 },
      { x: 420, y: 100 }, { x: 420, y: 300 }, { x: 420, y: 500 },
      { x: 620, y: 100 }, { x: 620, y: 300 }, { x: 620, y: 500 },
    ];

    const npcIds = [];
    
    for (let i = 0; i < count; i++) {
      const spawnPoint = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
      // Add some randomness to spawn positions to avoid clustering
      const x = spawnPoint.x + (Math.random() - 0.5) * 100;
      const y = spawnPoint.y + (Math.random() - 0.5) * 100;
      
      const npcId = await ctx.db.insert("npcZombies", {
        x: Math.max(20, Math.min(780, x)),
        y: Math.max(20, Math.min(580, y)),
        targetX: Math.max(20, Math.min(780, x)),
        targetY: Math.max(20, Math.min(580, y)),
        speed: 80 + Math.random() * 40, // Random speed between 80-120 pixels/sec
        lastMoveTime: Date.now(),
        wanderCooldown: Date.now() + Math.random() * 3000, // Random initial wander delay
      });
      
      npcIds.push(npcId);
    }
    
    return npcIds;
  },
});

// Professional NPC movement system - completely rewritten from scratch
export const updateNPCZombies = mutation({
  args: {},
  handler: async (ctx) => {
    const npcs = await ctx.db.query("npcZombies").collect();
    const now = Date.now();
    
    // Movement constants for professional behavior
    const MOVEMENT_SPEED = 60; // pixels per second - slower than players
    const TARGET_RADIUS = 8; // how close to target before picking new one
    const MIN_WANDER_TIME = 1500; // minimum time before changing direction (ms)
    const MAX_WANDER_TIME = 4000; // maximum time before changing direction (ms)
    
    // Pre-defined waypoints for natural movement
    const waypoints = [
      // Horizontal road waypoints
      { x: 100, y: 200 }, { x: 250, y: 200 }, { x: 350, y: 200 }, { x: 450, y: 200 }, 
      { x: 550, y: 200 }, { x: 650, y: 200 }, { x: 750, y: 200 },
      { x: 100, y: 400 }, { x: 250, y: 400 }, { x: 350, y: 400 }, { x: 450, y: 400 }, 
      { x: 550, y: 400 }, { x: 650, y: 400 }, { x: 750, y: 400 },
      
      // Vertical road waypoints
      { x: 220, y: 50 }, { x: 220, y: 150 }, { x: 220, y: 250 }, { x: 220, y: 350 }, { x: 220, y: 450 }, { x: 220, y: 550 },
      { x: 420, y: 50 }, { x: 420, y: 150 }, { x: 420, y: 250 }, { x: 420, y: 350 }, { x: 420, y: 450 }, { x: 420, y: 550 },
      { x: 620, y: 50 }, { x: 620, y: 150 }, { x: 620, y: 250 }, { x: 620, y: 350 }, { x: 620, y: 450 }, { x: 620, y: 550 },
      
      // Park and open area waypoints
      { x: 90, y: 340 }, { x: 320, y: 360 }, { x: 520, y: 340 }, { x: 715, y: 350 },
    ];
    
    for (const npc of npcs) {
      const deltaTime = Math.min((now - npc.lastMoveTime) / 1000, 0.1); // Cap delta time to prevent large jumps
      
      // Calculate distance to current target
      const dx = npc.targetX - npc.x;
      const dy = npc.targetY - npc.y;
      const distanceToTarget = Math.sqrt(dx * dx + dy * dy);
      
      let newX = npc.x;
      let newY = npc.y;
      let newTargetX = npc.targetX;
      let newTargetY = npc.targetY;
      let newWanderCooldown = npc.wanderCooldown;
      
      // Check if we need a new target
      const needsNewTarget = distanceToTarget < TARGET_RADIUS || now >= npc.wanderCooldown;
      
      if (needsNewTarget) {
        // Pick a new waypoint target
        const target = waypoints[Math.floor(Math.random() * waypoints.length)];
        
        // Add some randomization around the waypoint
        const randomOffset = 30;
        newTargetX = target.x + (Math.random() - 0.5) * randomOffset;
        newTargetY = target.y + (Math.random() - 0.5) * randomOffset;
        
        // Ensure target is within bounds
        newTargetX = Math.max(25, Math.min(775, newTargetX));
        newTargetY = Math.max(25, Math.min(575, newTargetY));
        
        // Set new wander cooldown
        newWanderCooldown = now + MIN_WANDER_TIME + Math.random() * (MAX_WANDER_TIME - MIN_WANDER_TIME);
      }
      
      // Move towards target with smooth interpolation
      if (distanceToTarget > 0.5) {
        // Normalize direction vector
        const dirX = dx / distanceToTarget;
        const dirY = dy / distanceToTarget;
        
        // Calculate movement for this frame
        const moveDistance = MOVEMENT_SPEED * deltaTime;
        const actualMoveDistance = Math.min(moveDistance, distanceToTarget);
        
        newX = npc.x + dirX * actualMoveDistance;
        newY = npc.y + dirY * actualMoveDistance;
        
        // Keep within game bounds with padding
        newX = Math.max(25, Math.min(775, newX));
        newY = Math.max(25, Math.min(575, newY));
      }
      
      // Update NPC with new position and state
      await ctx.db.patch(npc._id, {
        x: newX,
        y: newY,
        targetX: newTargetX,
        targetY: newTargetY,
        lastMoveTime: now,
        wanderCooldown: newWanderCooldown,
      });
    }
  },
});

// Get all NPC zombies
export const getAllNPCZombies = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("npcZombies").collect();
  },
});

// Clean up all NPCs (for testing/reset)
export const clearAllNPCs = mutation({
  args: {},
  handler: async (ctx) => {
    const npcs = await ctx.db.query("npcZombies").collect();
    for (const npc of npcs) {
      await ctx.db.delete(npc._id);
    }
    return npcs.length;
  },
});

// Action to run NPC AI loop
export const runNPCAI = action({
  args: {},
  handler: async (ctx) => {
    await ctx.runMutation(internal.npcZombies.updateNPCZombies, {});
  },
});

// Balance NPCs based on human count
export const balanceNPCs = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Get current human count
    const players = await ctx.db.query("players").collect();
    const humanCount = players.filter(p => p.isZombie !== true).length;
    
    // Get current NPC count
    const currentNPCs = await ctx.db.query("npcZombies").collect();
    const targetNPCCount = humanCount * 10;
    
    if (currentNPCs.length < targetNPCCount) {
      // Spawn more NPCs directly
      const needed = targetNPCCount - currentNPCs.length;
      const spawnPoints = [
        { x: 150, y: 200 }, { x: 350, y: 200 }, { x: 550, y: 200 }, { x: 750, y: 200 },
        { x: 150, y: 400 }, { x: 350, y: 400 }, { x: 550, y: 400 }, { x: 750, y: 400 },
        { x: 220, y: 100 }, { x: 220, y: 300 }, { x: 220, y: 500 },
        { x: 420, y: 100 }, { x: 420, y: 300 }, { x: 420, y: 500 },
        { x: 620, y: 100 }, { x: 620, y: 300 }, { x: 620, y: 500 },
      ];

      for (let i = 0; i < needed; i++) {
        const spawnPoint = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
        const x = spawnPoint.x + (Math.random() - 0.5) * 100;
        const y = spawnPoint.y + (Math.random() - 0.5) * 100;
        
        await ctx.db.insert("npcZombies", {
          x: Math.max(20, Math.min(780, x)),
          y: Math.max(20, Math.min(580, y)),
          targetX: Math.max(20, Math.min(780, x)),
          targetY: Math.max(20, Math.min(580, y)),
          speed: 80 + Math.random() * 40,
          lastMoveTime: Date.now(),
          wanderCooldown: Date.now() + Math.random() * 3000,
        });
      }
    } else if (currentNPCs.length > targetNPCCount) {
      // Remove excess NPCs
      const excess = currentNPCs.length - targetNPCCount;
      for (let i = 0; i < excess; i++) {
        await ctx.db.delete(currentNPCs[i]._id);
      }
    }
    
    return { humanCount, targetNPCCount, currentNPCCount: currentNPCs.length };
  },
});