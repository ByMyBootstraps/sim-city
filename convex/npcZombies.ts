import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";

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

// Advanced NPC AI with collision detection, smooth movement, and intelligent behavior
export const updateNPCZombies = mutation({
  args: {},
  handler: async (ctx) => {
    // Check game state - only update NPCs during "playing" state
    const gameState = await ctx.db
      .query("gameState")
      .withIndex("by_gameId", (q) => q.eq("gameId", "main"))
      .unique();

    if (gameState?.status !== "playing") {
      return; // Skip NPC updates during lobby
    }

    // Add a small delay to reduce conflicts between rapid calls
    const currentTime = Date.now();
    const lastUpdate = gameState.lastNPCUpdate || 0;
    if (currentTime - lastUpdate < 100) { // Minimum 100ms between updates
      return;
    }

    // Mark the update time to prevent rapid successive calls
    await ctx.db.patch(gameState._id, {
      lastNPCUpdate: currentTime,
    });

    const npcs = await ctx.db.query("npcZombies").collect();
    const players = await ctx.db.query("players").collect();
    const humanPlayers = players.filter(p => p.isZombie !== true);
    const now = Date.now();
    
    // Movement constants for professional behavior
    const HUNTING_SPEED = 90; // pixels per second when chasing humans
    const MEANDER_SPEED = 45; // pixels per second when wandering
    const TARGET_RADIUS = 6; // how close to target before picking new one
    const DETECTION_RANGE = 120; // how far NPCs can "see" humans
    const RETARGET_INTERVAL = 1500; // retarget every 1.5 seconds
    const COLLISION_RADIUS = 12; // collision detection radius for NPCs
    
    // Collision detection function (inline copy from cityLayout.ts)
    function checkCollision(x: number, y: number, radius: number = COLLISION_RADIUS): boolean {
      // Building collision data (copy from cityLayout.ts)
      const buildings = [
        { x: 20, y: 20, width: 150, height: 120 }, // City Hall
        { x: 260, y: 30, width: 100, height: 110 }, // Police Station
        { x: 460, y: 40, width: 110, height: 100 }, // Fire Department
        { x: 660, y: 25, width: 120, height: 115 }, // Hospital
        { x: 30, y: 250, width: 80, height: 90 }, // Apartment A
        { x: 120, y: 260, width: 60, height: 80 }, // House 1
        { x: 260, y: 240, width: 70, height: 100 }, // House 2
        { x: 340, y: 250, width: 40, height: 90 }, // House 3
        { x: 460, y: 240, width: 110, height: 110 }, // Shopping Mall
        { x: 660, y: 250, width: 60, height: 80 }, // Coffee Shop
        { x: 730, y: 260, width: 50, height: 70 }, // Bakery
        { x: 40, y: 450, width: 130, height: 130 }, // Factory
        { x: 260, y: 460, width: 100, height: 110 }, // Warehouse
        { x: 460, y: 450, width: 110, height: 120 }, // Power Plant
        { x: 660, y: 470, width: 120, height: 100 }, // Recycling Center
      ];
      
      for (const building of buildings) {
        if (x - radius < building.x + building.width &&
            x + radius > building.x &&
            y - radius < building.y + building.height &&
            y + radius > building.y) {
          return true;
        }
      }
      return false;
    }
    
    // Smooth meandering waypoints for natural wandering behavior
    const meanderPoints = [
      // Main road patrol points
      { x: 100, y: 190 }, { x: 180, y: 210 }, { x: 280, y: 190 }, { x: 380, y: 210 },
      { x: 480, y: 190 }, { x: 580, y: 210 }, { x: 680, y: 190 }, { x: 750, y: 210 },
      
      { x: 100, y: 390 }, { x: 180, y: 410 }, { x: 280, y: 390 }, { x: 380, y: 410 },
      { x: 480, y: 390 }, { x: 580, y: 410 }, { x: 680, y: 390 }, { x: 750, y: 410 },
      
      // Vertical patrol routes
      { x: 210, y: 50 }, { x: 230, y: 100 }, { x: 210, y: 150 }, { x: 230, y: 250 },
      { x: 210, y: 300 }, { x: 230, y: 350 }, { x: 210, y: 450 }, { x: 230, y: 520 },
      
      { x: 410, y: 50 }, { x: 430, y: 100 }, { x: 410, y: 150 }, { x: 430, y: 250 },
      { x: 410, y: 300 }, { x: 430, y: 350 }, { x: 410, y: 450 }, { x: 430, y: 520 },
      
      { x: 610, y: 50 }, { x: 630, y: 100 }, { x: 610, y: 150 }, { x: 630, y: 250 },
      { x: 610, y: 300 }, { x: 630, y: 350 }, { x: 610, y: 450 }, { x: 630, y: 520 },
      
      // Park and open area points for meandering
      { x: 80, y: 330 }, { x: 110, y: 350 }, { x: 140, y: 330 },
      { x: 300, y: 350 }, { x: 330, y: 370 }, { x: 360, y: 350 },
      { x: 500, y: 330 }, { x: 530, y: 350 }, { x: 560, y: 330 },
      { x: 700, y: 340 }, { x: 730, y: 360 }, { x: 760, y: 340 },
    ];
    
    // Advanced pathfinding with collision avoidance
    function findSafePath(startX: number, startY: number, targetX: number, targetY: number, isHunting: boolean = false) {
      // Try direct path first if no collision
      const steps = 8;
      let directPathClear = true;
      
      for (let i = 1; i <= steps; i++) {
        const testX = startX + (targetX - startX) * (i / steps);
        const testY = startY + (targetY - startY) * (i / steps);
        if (checkCollision(testX, testY)) {
          directPathClear = false;
          break;
        }
      }
      
      if (directPathClear) {
        return { x: targetX, y: targetY };
      }
      
      // If hunting, find closest clear waypoint towards target
      if (isHunting) {
        let bestPoint = meanderPoints[0];
        let bestScore = Infinity;
        
        for (const point of meanderPoints) {
          if (!checkCollision(point.x, point.y)) {
            const distToPoint = Math.sqrt(Math.pow(point.x - startX, 2) + Math.pow(point.y - startY, 2));
            const distToTarget = Math.sqrt(Math.pow(point.x - targetX, 2) + Math.pow(point.y - targetY, 2));
            const score = distToPoint + distToTarget * 0.5; // Prefer points closer to target
            
            if (score < bestScore) {
              bestScore = score;
              bestPoint = point;
            }
          }
        }
        return bestPoint;
      }
      
      // For meandering, just find any nearby safe point
      const nearbyPoints = meanderPoints.filter(point => {
        const dist = Math.sqrt(Math.pow(point.x - startX, 2) + Math.pow(point.y - startY, 2));
        return dist <= 200 && !checkCollision(point.x, point.y);
      });
      
      return nearbyPoints.length > 0 ? 
        nearbyPoints[Math.floor(Math.random() * nearbyPoints.length)] : 
        { x: startX, y: startY }; // Stay in place if no safe points
    }
    
    for (const npc of npcs) {
      const deltaTime = Math.min((now - npc.lastMoveTime) / 1000, 0.1);
      
      let newX = npc.x;
      let newY = npc.y;
      let newTargetX = npc.targetX;
      let newTargetY = npc.targetY;
      let newWanderCooldown = npc.wanderCooldown;
      
      // Find nearest human for detection
      let nearestHuman = null;
      let nearestDistance = Infinity;
      
      for (const human of humanPlayers) {
        const distance = Math.sqrt(Math.pow(human.x - npc.x, 2) + Math.pow(human.y - npc.y, 2));
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestHuman = human;
        }
      }
      
      const isHunting = nearestHuman && nearestDistance <= DETECTION_RANGE;
      const needsRetarget = now >= npc.wanderCooldown || 
                           Math.sqrt(Math.pow(npc.targetX - npc.x, 2) + Math.pow(npc.targetY - npc.y, 2)) < TARGET_RADIUS;
      
      // Determine behavior and target
      if (needsRetarget) {
        if (isHunting && nearestHuman) {
          // Hunt mode: path towards human with collision avoidance
          const pathTarget = findSafePath(npc.x, npc.y, nearestHuman.x, nearestHuman.y, true);
          newTargetX = pathTarget.x;
          newTargetY = pathTarget.y;
          newWanderCooldown = now + RETARGET_INTERVAL;
        } else {
          // Meander mode: smooth wandering with longer intervals
          const meanderTarget = findSafePath(npc.x, npc.y, 
            meanderPoints[Math.floor(Math.random() * meanderPoints.length)].x,
            meanderPoints[Math.floor(Math.random() * meanderPoints.length)].y,
            false);
          newTargetX = meanderTarget.x + (Math.random() - 0.5) * 30; // Add some randomness
          newTargetY = meanderTarget.y + (Math.random() - 0.5) * 30;
          newWanderCooldown = now + RETARGET_INTERVAL * 2; // Longer intervals for meandering
        }
        
        // Ensure target is within bounds and safe
        newTargetX = Math.max(25, Math.min(775, newTargetX));
        newTargetY = Math.max(25, Math.min(575, newTargetY));
        
        // Final safety check for target
        if (checkCollision(newTargetX, newTargetY)) {
          // If target is unsafe, stay near current position
          newTargetX = npc.x + (Math.random() - 0.5) * 40;
          newTargetY = npc.y + (Math.random() - 0.5) * 40;
        }
      }
      
      // Smooth movement towards target
      const dx = newTargetX - npc.x;
      const dy = newTargetY - npc.y;
      const distanceToTarget = Math.sqrt(dx * dx + dy * dy);
      
      if (distanceToTarget > 0.5) {
        // Choose speed based on behavior
        const currentSpeed = isHunting ? HUNTING_SPEED : MEANDER_SPEED;
        
        // Normalize direction vector
        const dirX = dx / distanceToTarget;
        const dirY = dy / distanceToTarget;
        
        // Calculate proposed movement
        const moveDistance = currentSpeed * deltaTime;
        const actualMoveDistance = Math.min(moveDistance, distanceToTarget);
        
        const proposedX = npc.x + dirX * actualMoveDistance;
        const proposedY = npc.y + dirY * actualMoveDistance;
        
        // Check collision for proposed movement
        if (!checkCollision(proposedX, proposedY)) {
          newX = proposedX;
          newY = proposedY;
        } else {
          // Try alternative movements if blocked
          const alternativeAngles = [Math.PI/4, -Math.PI/4, Math.PI/2, -Math.PI/2];
          let foundAlternative = false;
          
          for (const angle of alternativeAngles) {
            const altDirX = Math.cos(Math.atan2(dirY, dirX) + angle);
            const altDirY = Math.sin(Math.atan2(dirY, dirX) + angle);
            const altX = npc.x + altDirX * actualMoveDistance * 0.7;
            const altY = npc.y + altDirY * actualMoveDistance * 0.7;
            
            if (!checkCollision(altX, altY)) {
              newX = altX;
              newY = altY;
              foundAlternative = true;
              break;
            }
          }
          
          // If no alternative found, stay in place
          if (!foundAlternative) {
            newX = npc.x;
            newY = npc.y;
          }
        }
        
        // Keep within game bounds
        newX = Math.max(COLLISION_RADIUS, Math.min(800 - COLLISION_RADIUS, newX));
        newY = Math.max(COLLISION_RADIUS, Math.min(600 - COLLISION_RADIUS, newY));
      }
      
      // Note: NPC infections are handled in updatePlayerPosition to avoid race conditions
      
      // Update NPC with new position and state (with error handling)
      try {
        await ctx.db.patch(npc._id, {
          x: newX,
          y: newY,
          targetX: newTargetX,
          targetY: newTargetY,
          lastMoveTime: now,
          wanderCooldown: newWanderCooldown,
        });
      } catch {
        // NPC might have been deleted by balancing, skip this NPC
        continue;
      }
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
export const clearAllNPCs = internalMutation({
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
    // Check game state - only balance NPCs during "playing" state
    const gameState = await ctx.db
      .query("gameState")
      .withIndex("by_gameId", (q) => q.eq("gameId", "main"))
      .unique();

    if (gameState?.status !== "playing") {
      return { humanCount: 0, targetNPCCount: 0, currentNPCCount: 0 };
    }

    // Get current human count
    const players = await ctx.db.query("players").collect();
    const humanCount = players.filter(p => p.isZombie !== true).length;
    
    // Get current NPC count
    const currentNPCs = await ctx.db.query("npcZombies").collect();
    const targetNPCCount = humanCount * 3;
    
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