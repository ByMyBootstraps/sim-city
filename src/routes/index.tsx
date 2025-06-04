import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useState, useRef, useEffect, useCallback } from "react";
import { api } from "../../convex/_generated/api";
import { cityLayout, checkCollision, getValidSpawnPoints } from "@/cityLayout";

const playersQueryOptions = convexQuery(api.players.getAllPlayers, {});
const gameStateQueryOptions = convexQuery(api.players.getGameState, {});
const npcZombiesQueryOptions = convexQuery(api.npcZombies.getAllNPCZombies, {});

export const Route = createFileRoute("/")({
  loader: async ({ context: { queryClient } }) => {
    await Promise.all([
      queryClient.ensureQueryData(playersQueryOptions),
      queryClient.ensureQueryData(gameStateQueryOptions),
      queryClient.ensureQueryData(npcZombiesQueryOptions),
    ]);
  },
  component: HomePage,
});

function HomePage() {
  const [gameState, setGameState] = useState<'lobby' | 'playing'>('lobby');
  const [username, setUsername] = useState('');
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);

  if (gameState === 'lobby') {
    return <UsernameForm 
      username={username} 
      setUsername={setUsername}
      onJoin={(playerId) => {
        setCurrentPlayerId(playerId);
        setGameState('playing');
      }}
    />;
  }

  return <GameView playerId={currentPlayerId!} username={username} />;
}

function UsernameForm({ 
  username, 
  setUsername, 
  onJoin 
}: { 
  username: string; 
  setUsername: (name: string) => void;
  onJoin: (playerId: string) => void;
}) {
  const spawnPlayer = useMutation(api.players.spawnPlayer);
  const [isSpawning, setIsSpawning] = useState(false);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    
    setIsSpawning(true);
    try {
      const connectionId = Math.random().toString(36).substring(7);
      const playerId = await spawnPlayer({ 
        username: username.trim(),
        connectionId 
      });
      onJoin(playerId);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to join game');
      setIsSpawning(false);
    }
  };

  return (
    <div className="text-center">
      <h1 className="mb-8">🧟 Zombie City Survival</h1>
      <p className="mb-6 text-base-content/70">
        The first player becomes patient zero. Zombies infect humans on contact.<br/>
        Survive as long as you can!
      </p>
      
      <form onSubmit={handleJoin} className="not-prose max-w-md mx-auto">
        <div className="form-control mb-4">
          <label className="label">
            <span className="label-text">Choose your username</span>
          </label>
          <input 
            type="text" 
            className="input input-bordered w-full" 
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter username..."
            maxLength={20}
            required
          />
        </div>
        
        <button 
          type="submit" 
          className="btn btn-primary btn-lg w-full"
          disabled={isSpawning || !username.trim()}
        >
          {isSpawning ? 'Spawning...' : 'Enter City'}
        </button>
      </form>
    </div>
  );
}

function GameView({ playerId, username }: { playerId: string; username: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { data: players } = useSuspenseQuery(playersQueryOptions);
  const { data: gameState } = useSuspenseQuery(gameStateQueryOptions);
  const { data: npcZombies } = useSuspenseQuery(npcZombiesQueryOptions);
  const updatePosition = useMutation(api.players.updatePlayerPosition);
  const cleanupDisconnected = useMutation(api.players.cleanupDisconnectedPlayers);
  const updateNPCs = useMutation(api.npcZombies.updateNPCZombies);
  
  // Professional movement system state
  const keysRef = useRef<{[key: string]: boolean}>({});
  const lastUpdateRef = useRef<number>(Date.now());
  const gameLoopRef = useRef<number | null>(null);
  const localPositionRef = useRef<{x: number, y: number} | null>(null);
  const lastSyncRef = useRef<number>(0);
  
  const currentPlayer = players.find(p => p._id === playerId);
  const otherPlayers = players.filter(p => p._id !== playerId);
  const zombiePlayers = players.filter(p => p.isZombie === true);
  const humanPlayers = players.filter(p => p.isZombie !== true);
  
  // Movement constants for smooth gameplay
  const MOVEMENT_CONSTANTS = {
    HUMAN_SPEED: 200, // pixels per second
    ZOMBIE_BASE_SPEED: 260, // pixels per second (30% faster than humans)
    ZOMBIE_SPEED_REDUCTION: 15, // pixels per second reduction per additional zombie
    MIN_ZOMBIE_SPEED: 120, // minimum zombie speed
    SYNC_RATE: 1000 / 20, // 20 Hz sync rate (50ms)
    FRAME_RATE: 1000 / 60, // 60 FPS for smooth local movement
  };
  
  // Calculate zombie speed based on zombie count
  const getZombieSpeed = useCallback(() => {
    const zombieCount = zombiePlayers.length;
    const speedReduction = Math.max(0, (zombieCount - 1) * MOVEMENT_CONSTANTS.ZOMBIE_SPEED_REDUCTION);
    return Math.max(MOVEMENT_CONSTANTS.MIN_ZOMBIE_SPEED, MOVEMENT_CONSTANTS.ZOMBIE_BASE_SPEED - speedReduction);
  }, [zombiePlayers.length]);
  
  const getPlayerSpeed = useCallback((isZombie: boolean) => {
    return isZombie ? getZombieSpeed() : MOVEMENT_CONSTANTS.HUMAN_SPEED;
  }, [getZombieSpeed]);
  
  // Initialize local position
  useEffect(() => {
    if (currentPlayer && !localPositionRef.current) {
      localPositionRef.current = { x: currentPlayer.x, y: currentPlayer.y };
    }
  }, [currentPlayer]);

  // Professional input handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright'].includes(key)) {
        e.preventDefault();
        keysRef.current[key] = true;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright'].includes(key)) {
        e.preventDefault();
        keysRef.current[key] = false;
      }
    };

    // Handle window focus to prevent stuck keys
    const handleBlur = () => {
      keysRef.current = {};
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  // Professional game loop
  useEffect(() => {
    if (!currentPlayer || !localPositionRef.current) return;

    const gameLoop = () => {
      const now = Date.now();
      const deltaTime = (now - lastUpdateRef.current) / 1000; // Convert to seconds
      lastUpdateRef.current = now;

      // Calculate movement vector
      let moveX = 0;
      let moveY = 0;

      if (keysRef.current['w'] || keysRef.current['arrowup']) moveY -= 1;
      if (keysRef.current['s'] || keysRef.current['arrowdown']) moveY += 1;
      if (keysRef.current['a'] || keysRef.current['arrowleft']) moveX -= 1;
      if (keysRef.current['d'] || keysRef.current['arrowright']) moveX += 1;

      // Normalize diagonal movement for consistent speed
      if (moveX !== 0 && moveY !== 0) {
        const magnitude = Math.sqrt(moveX * moveX + moveY * moveY);
        moveX /= magnitude;
        moveY /= magnitude;
      }

      // Apply movement if there's input
      if (moveX !== 0 || moveY !== 0) {
        const speed = getPlayerSpeed(currentPlayer.isZombie === true);
        const deltaX = moveX * speed * deltaTime;
        const deltaY = moveY * speed * deltaTime;
        
        const newX = Math.max(10, Math.min(790, localPositionRef.current!.x + deltaX));
        const newY = Math.max(10, Math.min(590, localPositionRef.current!.y + deltaY));

        // Check collision before moving
        if (!checkCollision(newX, newY)) {
          localPositionRef.current = { x: newX, y: newY };
        }
      }

      // Sync to server at reduced rate
      if (now - lastSyncRef.current >= MOVEMENT_CONSTANTS.SYNC_RATE) {
        const serverPos = { x: currentPlayer.x, y: currentPlayer.y };
        const localPos = localPositionRef.current!;
        
        // Only sync if position has changed significantly
        const distance = Math.sqrt(
          Math.pow(localPos.x - serverPos.x, 2) + 
          Math.pow(localPos.y - serverPos.y, 2)
        );
        
        if (distance > 1) { // 1 pixel threshold
          void updatePosition({ 
            playerId, 
            x: Math.round(localPos.x), 
            y: Math.round(localPos.y) 
          });
        }
        
        lastSyncRef.current = now;
      }

      gameLoopRef.current = requestAnimationFrame(gameLoop);
    };

    gameLoopRef.current = requestAnimationFrame(gameLoop);

    return () => {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
      }
    };
  }, [currentPlayer, playerId, updatePosition, getPlayerSpeed]);

  // Rendering system
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      // Clear canvas with grass background
      ctx.fillStyle = '#4A5D23';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw city layout
      cityLayout.forEach(obj => {
        ctx.fillStyle = obj.color;
        ctx.fillRect(obj.x, obj.y, obj.width, obj.height);
        
        // Add building names
        if (obj.name && obj.type === 'building') {
          ctx.fillStyle = '#ffffff';
          ctx.font = '10px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(obj.name, obj.x + obj.width / 2, obj.y + obj.height / 2);
        }
      });

      // Draw all players with smooth local position for current player
      players.forEach(player => {
        const isCurrentPlayer = player._id === playerId;
        
        // Use local position for current player for smooth movement
        const renderX = isCurrentPlayer && localPositionRef.current ? 
          localPositionRef.current.x : player.x;
        const renderY = isCurrentPlayer && localPositionRef.current ? 
          localPositionRef.current.y : player.y;
        
        // Choose color based on zombie status
        if (player.isZombie === true) {
          ctx.fillStyle = isCurrentPlayer ? '#dc2626' : '#ef4444'; // Red for zombies
        } else {
          ctx.fillStyle = isCurrentPlayer ? '#2563eb' : '#3b82f6'; // Blue for humans
        }
        
        ctx.fillRect(renderX - 10, renderY - 10, 20, 20);
        
        // Draw zombie indicator
        if (player.isZombie === true) {
          ctx.fillStyle = '#000000';
          ctx.font = '16px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('🧟', renderX, renderY + 5);
        }
        
        // Draw username above player
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(player.username, renderX, renderY - 15);
        
        // Draw infection radius for zombies
        if (player.isZombie === true) {
          ctx.strokeStyle = '#ff000040';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(renderX, renderY, 25, 0, 2 * Math.PI);
          ctx.stroke();
        }
      });

      // Draw NPC zombies (smaller, brown) with hunting behavior
      npcZombies.forEach(npc => {
        // Check if NPC is near any human (hunting behavior)
        const nearestHuman = humanPlayers.reduce((nearest, human) => {
          const distance = Math.sqrt(Math.pow(human.x - npc.x, 2) + Math.pow(human.y - npc.y, 2));
          return !nearest || distance < nearest.distance ? { human, distance } : nearest;
        }, null as { human: any, distance: number } | null);
        
        const isHunting = nearestHuman && nearestHuman.distance <= 150;
        
        // Color changes based on hunting state
        ctx.fillStyle = isHunting ? '#CD853F' : '#8B4513'; // Lighter brown when hunting
        ctx.fillRect(npc.x - 6, npc.y - 6, 12, 12); // Smaller than players
        
        // Draw smaller zombie indicator
        ctx.fillStyle = '#000000';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🧟', npc.x, npc.y + 3);
        
        // Draw hunting indicator (red line to target)
        if (isHunting && nearestHuman) {
          ctx.strokeStyle = '#ff000060';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(npc.x, npc.y);
          ctx.lineTo(nearestHuman.human.x, nearestHuman.human.y);
          ctx.stroke();
        }
        
        // Draw infection radius for NPCs (smaller than player zombies)
        ctx.strokeStyle = '#8B451340';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(npc.x, npc.y, 20, 0, 2 * Math.PI);
        ctx.stroke();
      });

      requestAnimationFrame(render);
    };

    render();
  }, [players, playerId, npcZombies]);


  // Cleanup disconnected players and run NPC AI periodically
  useEffect(() => {
    const cleanup = setInterval(() => {
      void cleanupDisconnected();
    }, 10000); // Clean up every 10 seconds

    const npcAI = setInterval(() => {
      void updateNPCs();
    }, 100); // Run NPC AI every 100ms for smooth movement

    return () => {
      clearInterval(cleanup);
      clearInterval(npcAI);
    };
  }, [cleanupDisconnected, updateNPCs]);

  if (!currentPlayer) {
    return <div className="text-center">Loading...</div>;
  }

  const gameStatus = humanPlayers.length === 0 && zombiePlayers.length > 0 ? 'ended' : 'playing';
  
  return (
    <div className="not-prose">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-lg font-bold">
            Playing as: {username} {currentPlayer.isZombie === true ? '🧟 (ZOMBIE)' : '👤 (HUMAN)'}
          </h2>
          <div className="text-sm opacity-70">
            {currentPlayer.isZombie === true ? 'Infect all humans!' : 'Survive the zombie apocalypse!'}
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm opacity-70">
            {currentPlayer.isZombie === true ? 'Zombie Speed' : 'Health'}
          </div>
          <div className="flex items-center gap-2">
            {currentPlayer.isZombie === true ? (
              <div className="text-sm font-mono">
                Speed: {getPlayerSpeed(true).toFixed(1)} 
                <span className="text-xs opacity-60"> ({zombiePlayers.length} zombies)</span>
              </div>
            ) : (
              <>
                <progress 
                  className="progress progress-success w-32" 
                  value={currentPlayer.health} 
                  max={100}
                />
                <span className="text-sm font-mono">{currentPlayer.health}/100</span>
              </>
            )}
          </div>
        </div>
      </div>

      {gameStatus === 'ended' && (
        <div className="alert alert-error mb-4">
          <span>🧟 APOCALYPSE COMPLETE! All humans have been infected!</span>
        </div>
      )}
      
      <div className="flex justify-between items-center mb-2">
        <div className="text-sm">
          🧟 Player Zombies: {zombiePlayers.length} | 👤 Humans: {humanPlayers.length} | 🧟‍♂️ NPC Zombies: {npcZombies.length}
        </div>
        <div className="text-sm opacity-70">
          Total Players: {players.length}/15
        </div>
      </div>
      
      <div className="border border-base-300 inline-block">
        <canvas 
          ref={canvasRef}
          width={800}
          height={600}
          className="block"
        />
      </div>
      
      <div className="mt-4 text-sm opacity-70 text-center">
        Smooth movement: Hold WASD or arrow keys (diagonal movement supported)
        <br />
        {currentPlayer.isZombie === true ? 
          'Touch humans to infect them. Fewer humans = fewer NPC zombies!' : 
          'Avoid ALL zombies! NPCs and players can both infect you on contact.'}
      </div>
    </div>
  );
}
