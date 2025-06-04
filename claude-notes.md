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
- Fixed OptimisticConcurrencyControlFailure race condition

### Latest Achievement: Race Condition Fix
- **Eliminated Race Condition**: Moved NPC infection logic from updateNPCZombies to updatePlayerPosition
- **Single Source of Truth**: All infections now handled in one mutation to prevent OptimisticConcurrencyControlFailure
- **Maintained Functionality**: Both player-to-player and NPC-to-player infections still work correctly
- **Stable Multiplayer**: No more concurrent write conflicts during gameplay

### Lobby System (Previously Completed):
- **Host-controlled game start**: First player becomes host and can start the game
- **Player waiting room**: Other players can join and wait in lobby
- **Visual lobby UI**: Shows all players, identifies host, displays player count
- **Game state management**: Proper transitions from lobby → playing → ended
- **Host becomes first zombie**: When game starts, host automatically becomes patient zero

### Next Steps:
1. All features complete and working
2. Production deployment ready

### Commits Made:
- a8689aa: fix: prevent game mechanics from running during lobby state
- f921f4c: fix: resolve lobby system issues and add reset functionality
- 5b9fccf: feat: implement lobby system with host-controlled game start
- 7369906: feat: implement advanced NPC AI with collision detection and smooth meandering
- 91eac32: fix: add error handling to prevent NPC crashes during infections and balancing

### Key Technical Implementation:
- NPCs use advanced collision detection with exact building coordinates from cityLayout.ts
- Pathfinding system tries direct paths first, then finds optimal waypoints when blocked
- Movement system uses delta-time calculations for smooth frame-rate independent motion
- AI switches between hunting mode (fast, targeted) and meandering mode (slow, exploratory)
- Professional game development patterns with 60fps rendering and real-time state sync