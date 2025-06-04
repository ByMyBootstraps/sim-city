import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useState, useRef, useEffect } from "react";
import { api } from "../../convex/_generated/api";

const playersQueryOptions = convexQuery(api.players.getAllPlayers, {});

export const Route = createFileRoute("/")({
  loader: async ({ context: { queryClient } }) =>
    await queryClient.ensureQueryData(playersQueryOptions),
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
      const playerId = await spawnPlayer({ username: username.trim() });
      onJoin(playerId);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to join game');
      setIsSpawning(false);
    }
  };

  return (
    <div className="text-center">
      <h1 className="mb-8">2D City Explorer</h1>
      
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
  const updatePosition = useMutation(api.players.updatePlayerPosition);
  
  const currentPlayer = players.find(p => p._id === playerId);
  const otherPlayers = players.filter(p => p._id !== playerId);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw simple grid for city feel
    ctx.strokeStyle = '#404040';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 50) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Draw current player (blue)
    if (currentPlayer) {
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(currentPlayer.x - 10, currentPlayer.y - 10, 20, 20);
      
      // Draw username above player
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(currentPlayer.username, currentPlayer.x, currentPlayer.y - 15);
    }

    // Draw other players (red)
    otherPlayers.forEach(player => {
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(player.x - 10, player.y - 10, 20, 20);
      
      // Draw username above player
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(player.username, player.x, player.y - 15);
    });
  }, [players, currentPlayer, otherPlayers]);

  useEffect(() => {
    if (!currentPlayer) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      let newX = currentPlayer.x;
      let newY = currentPlayer.y;
      const speed = 5;

      switch (e.key.toLowerCase()) {
        case 'w':
        case 'arrowup':
          newY = Math.max(10, newY - speed);
          break;
        case 's':
        case 'arrowdown':
          newY = Math.min(590, newY + speed);
          break;
        case 'a':
        case 'arrowleft':
          newX = Math.max(10, newX - speed);
          break;
        case 'd':
        case 'arrowright':
          newX = Math.min(790, newX + speed);
          break;
        default:
          return;
      }

      if (newX !== currentPlayer.x || newY !== currentPlayer.y) {
        void updatePosition({ playerId, x: newX, y: newY });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPlayer, playerId, updatePosition]);

  if (!currentPlayer) {
    return <div className="text-center">Loading...</div>;
  }

  return (
    <div className="not-prose">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold">Playing as: {username}</h2>
        <div className="text-right">
          <div className="text-sm opacity-70">Health</div>
          <div className="flex items-center gap-2">
            <progress 
              className="progress progress-success w-32" 
              value={currentPlayer.health} 
              max={100}
            />
            <span className="text-sm font-mono">{currentPlayer.health}/100</span>
          </div>
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
        Use WASD or arrow keys to move around the city
        <br />
        Players online: {players.length}
      </div>
    </div>
  );
}
