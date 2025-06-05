import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useState, useRef, useEffect, useCallback } from "react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { cityLayout, checkCollision } from "@/cityLayout";

const playersQueryOptions = convexQuery(api.players.getAllPlayers, {});
const gameStateQueryOptions = convexQuery(api.players.getGameState, {});
const npcZombiesQueryOptions = convexQuery(api.npcZombies.getAllNPCZombies, {});

// Movement constants for smooth gameplay
const MOVEMENT_CONSTANTS = {
  HUMAN_SPEED: 200, // pixels per second
  ZOMBIE_BASE_SPEED: 260, // pixels per second (30% faster than humans)
  ZOMBIE_SPEED_REDUCTION: 15, // pixels per second reduction per additional zombie
  MIN_ZOMBIE_SPEED: 120, // minimum zombie speed
  SYNC_RATE: 1000 / 20, // 20 Hz sync rate (50ms)
  FRAME_RATE: 1000 / 60, // 60 FPS for smooth local movement
};

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
  const [localState, setLocalState] = useState<'username' | 'joined'>('username');
  const [username, setUsername] = useState('');
  const [currentPlayerId, setCurrentPlayerId] = useState<Id<"players"> | null>(null);

  if (localState === 'username') {
    return <UsernameForm 
      username={username} 
      setUsername={setUsername}
      onJoin={(playerId) => {
        setCurrentPlayerId(playerId);
        setLocalState('joined');
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
  onJoin: (playerId: Id<"players">) => void;
}) {
  const spawnPlayer = useMutation(api.players.spawnPlayer);
  const [isJoining, setIsJoining] = useState(false);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    
    setIsJoining(true);
    try {
      const connectionId = Math.random().toString(36).substring(7);
      const playerId = await spawnPlayer({ 
        username: username.trim(),
        connectionId 
      });
      onJoin(playerId);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to join game');
      setIsJoining(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-base-200 to-base-300 flex items-center justify-center">
      <div className="card w-full max-w-md bg-base-100 shadow-xl">
        <div className="card-body">
          <div className="text-center mb-6">
            <h1 className="text-4xl font-bold mb-2">🧟 Zombie City</h1>
            <h2 className="text-2xl text-primary">Survival</h2>
            <p className="text-sm opacity-70 mt-4">
              Survive the zombie apocalypse or become the hunter
            </p>
          </div>
          
          <form onSubmit={(e) => void handleJoin(e)} className="space-y-4">
            <div className="form-control">
              <label className="label">
                <span className="label-text font-medium">Choose your survivor name</span>
              </label>
              <input 
                type="text" 
                className="input input-bordered w-full focus:input-primary" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your name..."
                maxLength={20}
                required
                autoFocus
              />
            </div>
            
            <button 
              type="submit" 
              className="btn btn-primary btn-lg w-full"
              disabled={isJoining || !username.trim()}
            >
              {isJoining ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  Joining Game...
                </>
              ) : (
                'Join Game'
              )}
            </button>
          </form>
          
          <div className="text-center mt-6">
            <div className="stats stats-horizontal text-sm">
              <div className="stat">
                <div className="stat-title text-xs">Game Mode</div>
                <div className="stat-value text-sm">Multiplayer</div>
              </div>
              <div className="stat">
                <div className="stat-title text-xs">Max Players</div>
                <div className="stat-value text-sm">20</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GameView({ playerId, username }: { playerId: Id<"players">; username: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { data: players } = useSuspenseQuery(playersQueryOptions);
  const { data: gameState } = useSuspenseQuery(gameStateQueryOptions);
  const { data: npcZombies } = useSuspenseQuery(npcZombiesQueryOptions);
  const updatePosition = useMutation(api.players.updatePlayerPosition);
  const cleanupDisconnected = useMutation(api.players.cleanupDisconnectedPlayers);
  const updateNPCs = useMutation(api.npcZombies.updateNPCZombies);
  const startGame = useMutation(api.players.startGame);
  const cancelGameStart = useMutation(api.players.cancelGameStart);
  
  // Professional movement system state
  const keysRef = useRef<{[key: string]: boolean}>({});
  const lastUpdateRef = useRef<number>(Date.now());
  const gameLoopRef = useRef<number | null>(null);
  const localPositionRef = useRef<{x: number, y: number} | null>(null);
  const lastSyncRef = useRef<number>(0);
  const [isStarting, setIsStarting] = useState(false);
  const npcUpdateInProgressRef = useRef<boolean>(false);
  
  const currentPlayer = players.find(p => p._id === playerId);
  const zombiePlayers = players.filter(p => p.isZombie === true);
  const humanPlayers = players.filter(p => p.isZombie !== true);
  
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
  }, [players, playerId, npcZombies, humanPlayers]);


  // Cleanup disconnected players and run NPC AI periodically
  useEffect(() => {
    const cleanup = setInterval(() => {
      void cleanupDisconnected();
    }, 10000); // Clean up every 10 seconds

    const npcAI = setInterval(() => {
      // Prevent overlapping NPC updates
      if (!npcUpdateInProgressRef.current) {
        npcUpdateInProgressRef.current = true;
        updateNPCs().catch(() => {
          // Ignore NPC update errors during rapid state changes
        }).finally(() => {
          npcUpdateInProgressRef.current = false;
        });
      }
    }, 150); // Run NPC AI every 150ms to reduce conflicts

    return () => {
      clearInterval(cleanup);
      clearInterval(npcAI);
    };
  }, [cleanupDisconnected, updateNPCs]); // Removed humanPlayers dependency

  if (!currentPlayer) {
    return <div className="text-center">Loading...</div>;
  }

  // Debug: Log game state
  console.log('Game State:', gameState);
  console.log('Current Player:', currentPlayer);
  console.log('Players:', players);

  // Handle lobby state
  if (gameState?.status === 'lobby') {
    const isHost = gameState.hostPlayerId === playerId;
    const countdownActive = gameState.gameStartDelay && gameState.gameStartDelay > Date.now();
    const countdownSeconds = countdownActive ? Math.ceil((gameState.gameStartDelay! - Date.now()) / 1000) : 0;

    const handleStartGame = async () => {
      setIsStarting(true);
      try {
        await startGame({ playerId });
        setIsStarting(false);
      } catch (error) {
        alert(error instanceof Error ? error.message : 'Failed to start game');
        setIsStarting(false);
      }
    };

    const handleCancelStart = async () => {
      try {
        await cancelGameStart({ playerId });
      } catch (error) {
        alert(error instanceof Error ? error.message : 'Failed to cancel');
      }
    };

    return (
      <div className="min-h-screen bg-gradient-to-br from-base-200 to-base-300 flex items-center justify-center">
        <div className="card w-full max-w-2xl bg-base-100 shadow-xl">
          <div className="card-body">
            {countdownActive ? (
              <div className="text-center">
                <div className="mb-6">
                  <h1 className="text-5xl font-bold text-primary mb-4">{countdownSeconds}</h1>
                  <h2 className="text-2xl font-semibold mb-2">Game Starting...</h2>
                  <p className="text-lg opacity-70">Get ready for the zombie apocalypse!</p>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-6">
                  {players.map((player) => (
                    <div key={player._id} className={`badge p-3 ${
                      player._id === gameState.hostPlayerId ? 'badge-primary' : 'badge-neutral'
                    }`}>
                      {player.username}
                      {player._id === gameState.hostPlayerId && ' 👑'}
                    </div>
                  ))}
                </div>
                
                {isHost && (
                  <button 
                    className="btn btn-secondary btn-sm"
                    onClick={() => void handleCancelStart()}
                  >
                    Cancel Start
                  </button>
                )}
              </div>
            ) : (
              <div className="text-center">
                <div className="mb-6">
                  <h1 className="text-3xl font-bold mb-2">🧟 Game Lobby</h1>
                  <p className="text-lg opacity-70">Waiting for players...</p>
                </div>

                <div className="stats shadow mb-6">
                  <div className="stat">
                    <div className="stat-title">Players Ready</div>
                    <div className="stat-value text-primary">{players.length}</div>
                    <div className="stat-desc">out of 20 max</div>
                  </div>
                  <div className="stat">
                    <div className="stat-title">Game Status</div>
                    <div className="stat-value text-sm">Lobby</div>
                    <div className="stat-desc">Waiting to start</div>
                  </div>
                </div>
                
                <div className="mb-6">
                  <h3 className="font-semibold mb-3">Connected Players</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {players.map((player) => (
                      <div key={player._id} className={`badge p-3 ${
                        player._id === gameState.hostPlayerId ? 'badge-primary' : 'badge-neutral'
                      }`}>
                        {player.username}
                        {player._id === gameState.hostPlayerId && ' 👑'}
                      </div>
                    ))}
                  </div>
                </div>
                
                {isHost ? (
                  <div className="space-y-4">
                    <div className="alert alert-info">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                      <span>You are the host. Start the game when ready!</span>
                    </div>
                    
                    <button 
                      className="btn btn-primary btn-lg w-full"
                      onClick={() => void handleStartGame()}
                      disabled={isStarting || players.length < 2}
                    >
                      {isStarting ? (
                        <>
                          <span className="loading loading-spinner loading-sm"></span>
                          Starting Game...
                        </>
                      ) : (
                        'Start Game'
                      )}
                    </button>
                    
                    {players.length < 2 && (
                      <div className="alert alert-warning">
                        <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L3.349 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                        <span>Need at least 2 players to start</span>
                      </div>
                    )}
                    
                    <p className="text-xs opacity-60">
                      A random player will become the first zombie when the game starts
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="alert">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                      <span>Waiting for {players.find(p => p._id === gameState.hostPlayerId)?.username || 'host'} to start the game...</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Handle game ended state
  if (gameState?.status === 'ended') {
    const zombies = players.filter(p => p.isZombie === true);
    const humans = players.filter(p => p.isZombie !== true);
    const zombiesWon = humans.length === 0;
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-base-200 to-base-300 flex items-center justify-center">
        <div className="card w-full max-w-2xl bg-base-100 shadow-xl">
          <div className="card-body text-center">
            <div className="mb-6">
              <h1 className="text-4xl font-bold mb-4">
                {zombiesWon ? '🧟 Zombies Win!' : '🏃 Humans Survived!'}
              </h1>
              <p className="text-lg opacity-70">
                {zombiesWon ? 'The infection has spread completely!' : 'Humanity endures against all odds!'}
              </p>
            </div>
            
            <div className="stats shadow mb-6">
              <div className="stat">
                <div className="stat-figure text-error">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="inline-block w-8 h-8 stroke-current"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                </div>
                <div className="stat-title">Zombies</div>
                <div className="stat-value text-error">{zombies.length}</div>
                <div className="stat-desc">Infected players</div>
              </div>
              
              <div className="stat">
                <div className="stat-figure text-success">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="inline-block w-8 h-8 stroke-current"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg>
                </div>
                <div className="stat-title">Survivors</div>
                <div className="stat-value text-success">{humans.length}</div>
                <div className="stat-desc">Remaining humans</div>
              </div>
            </div>
            
            <div className="mb-6">
              <h3 className="font-semibold mb-3">Final Player Status</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {players.map((player) => (
                  <div key={player._id} className={`badge p-3 ${
                    player.isZombie ? 'badge-error' : 'badge-success'
                  }`}>
                    {player.isZombie ? '🧟' : '🏃'} {player.username}
                  </div>
                ))}
              </div>
            </div>
            
            <div className="alert alert-info">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              <span>Returning to lobby in a few seconds...</span>
            </div>
          </div>
        </div>
      </div>
    );
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
