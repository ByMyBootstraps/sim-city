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

// Professional NPC hunting system with pathfinding
export const updateNPCZombies = mutation({
  args: {},
  handler: async (ctx) => {
    const npcs = await ctx.db.query("npcZombies").collect();
    const players = await ctx.db.query("players").collect();
    const humanPlayers = players.filter(p => p.isZombie !== true);
    const now = Date.now();
    
    // Movement constants for hunting behavior
    const MOVEMENT_SPEED = 80; // pixels per second - hunting speed
    const TARGET_RADIUS = 8; // how close to target before picking new one
    const DETECTION_RANGE = 150; // how far NPCs can "see" humans
    const RETARGET_INTERVAL = 2000; // retarget every 2 seconds
    
    // Navigation waypoints for pathfinding around buildings
    const navigationNodes = [
      // Horizontal road nodes
      { x: 50, y: 200 }, { x: 120, y: 200 }, { x: 180, y: 200 }, { x: 260, y: 200 }, 
      { x: 320, y: 200 }, { x: 380, y: 200 }, { x: 460, y: 200 }, { x: 520, y: 200 },
      { x: 580, y: 200 }, { x: 660, y: 200 }, { x: 720, y: 200 }, { x: 780, y: 200 },
      
      { x: 50, y: 400 }, { x: 120, y: 400 }, { x: 180, y: 400 }, { x: 260, y: 400 }, 
      { x: 320, y: 400 }, { x: 380, y: 400 }, { x: 460, y: 400 }, { x: 520, y: 400 },
      { x: 580, y: 400 }, { x: 660, y: 400 }, { x: 720, y: 400 }, { x: 780, y: 400 },
      
      // Vertical road nodes
      { x: 220, y: 30 }, { x: 220, y: 80 }, { x: 220, y: 130 }, { x: 220, y: 170 },
      { x: 220, y: 230 }, { x: 220, y: 280 }, { x: 220, y: 320 }, { x: 220, y: 370 },
      { x: 220, y: 430 }, { x: 220, y: 480 }, { x: 220, y: 530 }, { x: 220, y: 580 },
      
      { x: 420, y: 30 }, { x: 420, y: 80 }, { x: 420, y: 130 }, { x: 420, y: 170 },
      { x: 420, y: 230 }, { x: 420, y: 280 }, { x: 420, y: 320 }, { x: 420, y: 370 },
      { x: 420, y: 430 }, { x: 420, y: 480 }, { x: 420, y: 530 }, { x: 420, y: 580 },
      
      { x: 620, y: 30 }, { x: 620, y: 80 }, { x: 620, y: 130 }, { x: 620, y: 170 },
      { x: 620, y: 230 }, { x: 620, y: 280 }, { x: 620, y: 320 }, { x: 620, y: 370 },
      { x: 620, y: 430 }, { x: 620, y: 480 }, { x: 620, y: 530 }, { x: 620, y: 580 },
      
      // Park and intersection nodes
      { x: 90, y: 340 }, { x: 320, y: 360 }, { x: 520, y: 340 }, { x: 715, y: 350 },
      { x: 220, y: 200 }, { x: 420, y: 200 }, { x: 620, y: 200 }, // Road intersections
      { x: 220, y: 400 }, { x: 420, y: 400 }, { x: 620, y: 400 }, // Road intersections
    ];
    
    // Simple pathfinding: find nearest navigation node to target
    function findPathToTarget(startX: number, startY: number, targetX: number, targetY: number) {
      // Find closest navigation node to current position
      let closestToStart = navigationNodes[0];
      let minDistToStart = Infinity;
      
      // Find closest navigation node to target
      let closestToTarget = navigationNodes[0];
      let minDistToTarget = Infinity;
      
      for (const node of navigationNodes) {
        const distToStart = Math.sqrt(Math.pow(node.x - startX, 2) + Math.pow(node.y - startY, 2));
        const distToTarget = Math.sqrt(Math.pow(node.x - targetX, 2) + Math.pow(node.y - targetY, 2));
        
        if (distToStart < minDistToStart) {
          minDistToStart = distToStart;
          closestToStart = node;
        }
        
        if (distToTarget < minDistToTarget) {
          minDistToTarget = distToTarget;
          closestToTarget = node;
        }
      }
      
      // Simple pathfinding: go to intermediate waypoint if needed
      const directDist = Math.sqrt(Math.pow(targetX - startX, 2) + Math.pow(targetY - startY, 2));
      const waypointDist = Math.sqrt(Math.pow(closestToTarget.x - startX, 2) + Math.pow(closestToTarget.y - startY, 2));
      
      // If waypoint is closer than direct path or we're far from target, use waypoint
      if (waypointDist < directDist * 0.8 || directDist > DETECTION_RANGE) {
        return closestToTarget;
      } else {
        return { x: targetX, y: targetY };
      }
    }
    
    for (const npc of npcs) {
      const deltaTime = Math.min((now - npc.lastMoveTime) / 1000, 0.1);
      
      let newX = npc.x;
      let newY = npc.y;
      let newTargetX = npc.targetX;
      let newTargetY = npc.targetY;
      let newWanderCooldown = npc.wanderCooldown;
      
      // Check if we need to retarget
      const needsRetarget = now >= npc.wanderCooldown;
      
      if (needsRetarget) {
        // Find nearest human player
        let nearestHuman = null;
        let nearestDistance = Infinity;
        
        for (const human of humanPlayers) {
          const distance = Math.sqrt(Math.pow(human.x - npc.x, 2) + Math.pow(human.y - npc.y, 2));
          if (distance < nearestDistance && distance <= DETECTION_RANGE) {
            nearestDistance = distance;
            nearestHuman = human;
          }
        }
        
        if (nearestHuman) {
          // Hunt the nearest human using pathfinding
          const pathTarget = findPathToTarget(npc.x, npc.y, nearestHuman.x, nearestHuman.y);
          newTargetX = pathTarget.x;
          newTargetY = pathTarget.y;
        } else {
          // No humans in range, wander to a random navigation node
          const randomNode = navigationNodes[Math.floor(Math.random() * navigationNodes.length)];
          newTargetX = randomNode.x + (Math.random() - 0.5) * 40;
          newTargetY = randomNode.y + (Math.random() - 0.5) * 40;
        }
        
        // Ensure target is within bounds
        newTargetX = Math.max(25, Math.min(775, newTargetX));
        newTargetY = Math.max(25, Math.min(575, newTargetY));
        
        newWanderCooldown = now + RETARGET_INTERVAL;
      }
      
      // Move towards current target
      const dx = newTargetX - npc.x;
      const dy = newTargetY - npc.y;
      const distanceToTarget = Math.sqrt(dx * dx + dy * dy);
      
      if (distanceToTarget > 0.5) {
        // Normalize direction vector
        const dirX = dx / distanceToTarget;
        const dirY = dy / distanceToTarget;
        
        // Calculate movement for this frame
        const moveDistance = MOVEMENT_SPEED * deltaTime;
        const actualMoveDistance = Math.min(moveDistance, distanceToTarget);
        
        newX = npc.x + dirX * actualMoveDistance;
        newY = npc.y + dirY * actualMoveDistance;
        
        // Keep within game bounds
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