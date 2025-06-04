import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useState, useRef, useEffect, useCallback } from "react";
import { api } from "../../convex/_generated/api";
import { cityLayout, checkCollision, getValidSpawnPoints } from "@/cityLayout";

const playersQueryOptions = convexQuery(api.players.getAllPlayers, {});
const gameStateQueryOptions = convexQuery(api.players.getGameState, {});

export const Route = createFileRoute("/")({
  loader: async ({ context: { queryClient } }) => {
    await Promise.all([
      queryClient.ensureQueryData(playersQueryOptions),
      queryClient.ensureQueryData(gameStateQueryOptions),
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
  const updatePosition = useMutation(api.players.updatePlayerPosition);
  const cleanupDisconnected = useMutation(api.players.cleanupDisconnectedPlayers);
  
  const [keysPressed, setKeysPressed] = useState<Set<string>>(new Set());
  const moveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const currentPlayer = players.find(p => p._id === playerId);
  const otherPlayers = players.filter(p => p._id !== playerId);
  const zombiePlayers = players.filter(p => p.isZombie === true);
  const humanPlayers = players.filter(p => p.isZombie !== true);
  
  // Calculate zombie speed based on zombie count (slower with more zombies)
  const getZombieSpeed = useCallback(() => {
    const zombieCount = zombiePlayers.length;
    const baseSpeed = 6; // Faster than humans (5)
    const speedReduction = Math.max(0, (zombieCount - 1) * 0.8); // Reduce speed by 0.8 per additional zombie
    return Math.max(2, baseSpeed - speedReduction); // Minimum speed of 2
  }, [zombiePlayers.length]);
  
  const getPlayerSpeed = useCallback((isZombie: boolean) => {
    return isZombie ? getZombieSpeed() : 4; // Humans move at speed 4
  }, [getZombieSpeed]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

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

    // Draw all players
    players.forEach(player => {
      const isCurrentPlayer = player._id === playerId;
      
      // Choose color based on zombie status
      if (player.isZombie === true) {
        ctx.fillStyle = isCurrentPlayer ? '#dc2626' : '#ef4444'; // Red for zombies
      } else {
        ctx.fillStyle = isCurrentPlayer ? '#2563eb' : '#3b82f6'; // Blue for humans
      }
      
      ctx.fillRect(player.x - 10, player.y - 10, 20, 20);
      
      // Draw zombie indicator
      if (player.isZombie === true) {
        ctx.fillStyle = '#000000';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🧟', player.x, player.y + 5);
      }
      
      // Draw username above player
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(player.username, player.x, player.y - 15);
      
      // Draw infection radius for zombies
      if (player.isZombie === true) {
        ctx.strokeStyle = '#ff000040';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(player.x, player.y, 25, 0, 2 * Math.PI);
        ctx.stroke();
      }
    });
  }, [players, currentPlayer, otherPlayers]);

  // Smooth movement system
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (['w', 's', 'a', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        setKeysPressed(prev => new Set(prev.add(key)));
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      setKeysPressed(prev => {
        const newSet = new Set(prev);
        newSet.delete(key);
        return newSet;
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Movement loop
  useEffect(() => {
    if (!currentPlayer) return;

    if (keysPressed.size > 0) {
      if (moveIntervalRef.current) {
        clearInterval(moveIntervalRef.current);
      }

      moveIntervalRef.current = setInterval(() => {
        if (!currentPlayer || keysPressed.size === 0) return;

        let deltaX = 0;
        let deltaY = 0;
        const speed = getPlayerSpeed(currentPlayer.isZombie === true);

        // Calculate movement direction
        if (keysPressed.has('w') || keysPressed.has('arrowup')) deltaY -= 1;
        if (keysPressed.has('s') || keysPressed.has('arrowdown')) deltaY += 1;
        if (keysPressed.has('a') || keysPressed.has('arrowleft')) deltaX -= 1;
        if (keysPressed.has('d') || keysPressed.has('arrowright')) deltaX += 1;

        // Normalize diagonal movement
        if (deltaX !== 0 && deltaY !== 0) {
          const magnitude = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
          deltaX = (deltaX / magnitude) * speed;
          deltaY = (deltaY / magnitude) * speed;
        } else {
          deltaX *= speed;
          deltaY *= speed;
        }

        const newX = Math.max(10, Math.min(790, currentPlayer.x + deltaX));
        const newY = Math.max(10, Math.min(590, currentPlayer.y + deltaY));

        // Check for collisions with buildings before moving
        if (!checkCollision(newX, newY)) {
          void updatePosition({ playerId, x: newX, y: newY });
        }
      }, 50); // 20 FPS movement updates
    } else {
      if (moveIntervalRef.current) {
        clearInterval(moveIntervalRef.current);
        moveIntervalRef.current = null;
      }
    }

    return () => {
      if (moveIntervalRef.current) {
        clearInterval(moveIntervalRef.current);
      }
    };
  }, [keysPressed, currentPlayer, playerId, updatePosition, getPlayerSpeed]);

  // Cleanup disconnected players periodically
  useEffect(() => {
    const cleanup = setInterval(() => {
      void cleanupDisconnected();
    }, 10000); // Clean up every 10 seconds

    return () => clearInterval(cleanup);
  }, [cleanupDisconnected]);

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
          🧟 Zombies: {zombiePlayers.length} | 👤 Humans: {humanPlayers.length}
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
        Use WASD or arrow keys to move around the city (supports diagonal movement)
        <br />
        {currentPlayer.isZombie === true ? 
          'Touch humans to infect them. More zombies = slower movement!' : 
          'Avoid zombies to survive. They get slower as their numbers grow.'}
      </div>
    </div>
  );
}
