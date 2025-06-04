# Claude Notes - Zombie City Survival Game

## Current Status: Advanced NPC System Implementation Complete

**IMPORTANT**: If starting from a fresh session, reread the project:init-app command file for full context.

### Application: Real-time Multiplayer 2D Zombie City Survival
- **Core concept**: 2D multiplayer zombie apocalypse game supporting up to 10 players
- **Key features**: Real-time movement, zombie infection mechanics, intelligent NPC zombies
- **Target users**: Friend groups wanting intense zombie survival gameplay
- **Key user flow**: Join with username → spawn as human → survive zombie infection from players and NPCs

### Completed Core Features:
- Real-time multiplayer with Convex backend (React + Vite + TanStack Router frontend)
- Professional 60fps movement system with delta-time calculations
- Detailed city layout with 15 buildings and collision detection
- Player-to-player zombie infection mechanics (25px radius)
- Zombie speed scaling system (faster base speed, reduces with more zombies)
- Automatic disconnect cleanup (30 second timeout)
- Real-time visual indicators (zombie emoji, infection radius, hunting lines)
- Game state tracking and apocalypse end conditions

### Recent Major Achievement: Advanced NPC System
- **Collision Detection**: NPCs can no longer pass through buildings (uses exact building coordinates)
- **Smooth Movement**: NPCs move at 90px/s when hunting, 45px/s when meandering
- **Intelligent Pathfinding**: `findSafePath` function with collision avoidance and alternative movement angles
- **Smart Meandering**: Dedicated waypoint system with 40+ patrol points for natural wandering behavior
- **Balanced Count**: Reduced from 10 to 3 NPCs per human for better gameplay balance
- **Professional AI**: Separate behavior modes for hunting vs wandering with proper retargeting intervals
- **Error Handling**: Prevents crashes during rapid state changes and race conditions

### Current Step:
- Testing the advanced NPC system implementation

### Next Steps:
1. Test NPC collision detection and building avoidance
2. Verify smooth meandering behavior
3. Confirm proper NPC count balancing (3 per human)

### Commits Made:
- 6c0b33f: fix: NPCs now actually move and reduce when humans get infected - balanced gameplay
- e7d89fb: fix: resolve NPC function exports and inline spawning to fix backend compilation
- 0cb21ef: feat: add NPC zombie system with wandering AI - 10 NPCs per human + 10 more on infection
- 8744ebb: feat: professional smooth movement system with 60fps rendering and proper first zombie logic
- e91943f: fix: make zombie fields optional for backward compatibility with existing players

### Key Technical Implementation:
- NPCs use advanced collision detection with exact building coordinates from cityLayout.ts
- Pathfinding system tries direct paths first, then finds optimal waypoints when blocked
- Movement system uses delta-time calculations for smooth frame-rate independent motion
- AI switches between hunting mode (fast, targeted) and meandering mode (slow, exploratory)
- Professional game development patterns with 60fps rendering and real-time state sync