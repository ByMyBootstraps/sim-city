# Claude Notes - Application Initialization

## Current Status: Step 2 - Planning MVP Implementation

**IMPORTANT**: If starting from a fresh session, reread the project:init-app command file for full context.

### Application: Real-time Multiplayer 2D City Game
- **Core concept**: Procedurally generated 2D city where up to 10 friends can run around in real-time
- **MVP features**: Username spawning, health bar, basic movement controls
- **Target users**: Friend groups wanting to explore together
- **Key user flow**: Join with username → spawn in city → move around with WASD/arrows

### Completed:
- Set up task tracking system
- Created claude-notes.md file
- Gathered requirements from user
- Removed template line from CLAUDE.md
- Created detailed city layout with buildings, roads, parks
- Added collision detection for buildings
- Updated schema for zombie mechanics (isZombie, connectionId)
- Implemented zombie infection on contact (25px radius)
- Added automatic disconnect cleanup (30 second timeout)
- First player becomes patient zero automatically
- Zombie speed scaling (faster base speed, slower with more zombies)
- Smooth movement system with diagonal support
- Real-time visual indicators (zombie emoji, infection radius)
- Game state tracking and end conditions

### Current Step:
- Testing zombie apocalypse gameplay

### Next Steps:
1. Start dev servers and test the game
2. Test multiplayer functionality with multiple browser tabs
3. Verify real-time movement sync between players

### Commits Made:
- 5f40893: init: documented requirements and setup for 2D multiplayer city game
- 3a8d214: feat: implement core 2D multiplayer city game with real-time movement
- 5d8a242: fix: remove conflicting users.ts file, backend now working

### Key Context:
- Real-time multiplayer requires Convex subscriptions for player positions
- 2D rendering can use HTML5 Canvas or SVG
- Need player state management (position, health, username)
- Movement will be WASD or arrow keys