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

// Update NPC positions and AI
export const updateNPCZombies = mutation({
  args: {},
  handler: async (ctx) => {
    const npcs = await ctx.db.query("npcZombies").collect();
    const now = Date.now();
    
    for (const npc of npcs) {
      const deltaTime = (now - npc.lastMoveTime) / 1000; // Convert to seconds
      let newX = npc.x;
      let newY = npc.y;
      let newTargetX = npc.targetX;
      let newTargetY = npc.targetY;
      let newWanderCooldown = npc.wanderCooldown;
      
      // Check if NPC needs a new target (reached current target or cooldown expired)
      const distanceToTarget = Math.sqrt(
        Math.pow(npc.x - npc.targetX, 2) + Math.pow(npc.y - npc.targetY, 2)
      );
      
      if (distanceToTarget < 5 || now > npc.wanderCooldown) {
        // Pick targets that prefer roads and sidewalks
        const roadTargets = [
          { x: 150, y: 200 }, { x: 350, y: 200 }, { x: 550, y: 200 }, { x: 750, y: 200 },
          { x: 150, y: 400 }, { x: 350, y: 400 }, { x: 550, y: 400 }, { x: 750, y: 400 },
          { x: 220, y: 100 }, { x: 220, y: 300 }, { x: 220, y: 500 },
          { x: 420, y: 100 }, { x: 420, y: 300 }, { x: 420, y: 500 },
          { x: 620, y: 100 }, { x: 620, y: 300 }, { x: 620, y: 500 },
        ];
        
        if (Math.random() < 0.7) {
          // 70% chance to target roads/sidewalks
          const target = roadTargets[Math.floor(Math.random() * roadTargets.length)];
          newTargetX = target.x + (Math.random() - 0.5) * 60;
          newTargetY = target.y + (Math.random() - 0.5) * 60;
        } else {
          // 30% chance for random wandering
          newTargetX = 50 + Math.random() * 700;
          newTargetY = 50 + Math.random() * 500;
        }
        
        newWanderCooldown = now + 2000 + Math.random() * 4000; // 2-6 seconds until next wander
      }
      
      // Move towards target
      if (distanceToTarget > 1) {
        const directionX = (npc.targetX - npc.x) / distanceToTarget;
        const directionY = (npc.targetY - npc.y) / distanceToTarget;
        
        newX = npc.x + directionX * npc.speed * deltaTime;
        newY = npc.y + directionY * npc.speed * deltaTime;
        
        // Keep within bounds
        newX = Math.max(20, Math.min(780, newX));
        newY = Math.max(20, Math.min(580, newY));
      }
      
      // Update NPC position
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