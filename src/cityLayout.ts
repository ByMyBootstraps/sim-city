export interface CityObject {
  type: 'building' | 'park' | 'road' | 'sidewalk';
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  name?: string;
}

export const CITY_WIDTH = 800;
export const CITY_HEIGHT = 600;

// Hand-designed city layout with streets, buildings, and parks
export const cityLayout: CityObject[] = [
  // Roads (gray)
  { type: 'road', x: 0, y: 180, width: 800, height: 40, color: '#555555' }, // Main horizontal road
  { type: 'road', x: 0, y: 380, width: 800, height: 40, color: '#555555' }, // Second horizontal road
  { type: 'road', x: 200, y: 0, width: 40, height: 600, color: '#555555' }, // Left vertical road
  { type: 'road', x: 400, y: 0, width: 40, height: 600, color: '#555555' }, // Center vertical road
  { type: 'road', x: 600, y: 0, width: 40, height: 600, color: '#555555' }, // Right vertical road

  // Sidewalks (lighter gray)
  { type: 'sidewalk', x: 0, y: 170, width: 800, height: 10, color: '#777777' }, // Top of main road
  { type: 'sidewalk', x: 0, y: 220, width: 800, height: 10, color: '#777777' }, // Bottom of main road
  { type: 'sidewalk', x: 0, y: 370, width: 800, height: 10, color: '#777777' }, // Top of second road
  { type: 'sidewalk', x: 0, y: 420, width: 800, height: 10, color: '#777777' }, // Bottom of second road
  
  { type: 'sidewalk', x: 190, y: 0, width: 10, height: 600, color: '#777777' }, // Left side of left road
  { type: 'sidewalk', x: 240, y: 0, width: 10, height: 600, color: '#777777' }, // Right side of left road
  { type: 'sidewalk', x: 390, y: 0, width: 10, height: 600, color: '#777777' }, // Left side of center road
  { type: 'sidewalk', x: 440, y: 0, width: 10, height: 600, color: '#777777' }, // Right side of center road
  { type: 'sidewalk', x: 590, y: 0, width: 10, height: 600, color: '#777777' }, // Left side of right road
  { type: 'sidewalk', x: 640, y: 0, width: 10, height: 600, color: '#777777' }, // Right side of right road

  // Buildings - Top Row (North District)
  { type: 'building', x: 20, y: 20, width: 150, height: 120, color: '#8B4513', name: 'City Hall' },
  { type: 'building', x: 260, y: 30, width: 100, height: 110, color: '#4169E1', name: 'Police Station' },
  { type: 'building', x: 460, y: 40, width: 110, height: 100, color: '#DC143C', name: 'Fire Department' },
  { type: 'building', x: 660, y: 25, width: 120, height: 115, color: '#32CD32', name: 'Hospital' },

  // Buildings - Middle Row West (Residential District)
  { type: 'building', x: 30, y: 250, width: 80, height: 90, color: '#DDA0DD', name: 'Apartment A' },
  { type: 'building', x: 120, y: 260, width: 60, height: 80, color: '#FFB6C1', name: 'House 1' },
  { type: 'building', x: 260, y: 240, width: 70, height: 100, color: '#FFA07A', name: 'House 2' },
  { type: 'building', x: 340, y: 250, width: 40, height: 90, color: '#98FB98', name: 'House 3' },

  // Buildings - Middle Row East (Commercial District)
  { type: 'building', x: 460, y: 240, width: 110, height: 110, color: '#F0E68C', name: 'Shopping Mall' },
  { type: 'building', x: 660, y: 250, width: 60, height: 80, color: '#DEB887', name: 'Coffee Shop' },
  { type: 'building', x: 730, y: 260, width: 50, height: 70, color: '#F4A460', name: 'Bakery' },

  // Buildings - Bottom Row (Industrial District)
  { type: 'building', x: 40, y: 450, width: 130, height: 130, color: '#696969', name: 'Factory' },
  { type: 'building', x: 260, y: 460, width: 100, height: 110, color: '#708090', name: 'Warehouse' },
  { type: 'building', x: 460, y: 450, width: 110, height: 120, color: '#2F4F4F', name: 'Power Plant' },
  { type: 'building', x: 660, y: 470, width: 120, height: 100, color: '#556B2F', name: 'Recycling Center' },

  // Parks (green spaces)
  { type: 'park', x: 10, y: 320, width: 170, height: 40, color: '#228B22', name: 'Riverside Park' },
  { type: 'park', x: 260, y: 350, width: 120, height: 15, color: '#32CD32', name: 'Central Garden' },
  { type: 'park', x: 450, y: 330, width: 140, height: 35, color: '#90EE90', name: 'Community Park' },
  { type: 'park', x: 650, y: 340, width: 130, height: 25, color: '#00FF00', name: 'Dog Park' },
];

// Check if a position collides with any building
export function checkCollision(x: number, y: number, playerSize: number = 20): boolean {
  const halfSize = playerSize / 2;
  
  return cityLayout.some(obj => {
    if (obj.type !== 'building') return false;
    
    return (
      x - halfSize < obj.x + obj.width &&
      x + halfSize > obj.x &&
      y - halfSize < obj.y + obj.height &&
      y + halfSize > obj.y
    );
  });
}

// Get spawn points that don't collide with buildings (on sidewalks)
export function getValidSpawnPoints(): { x: number; y: number }[] {
  const spawnPoints = [
    // Sidewalk spawn points
    { x: 150, y: 200 }, // Main road sidewalk
    { x: 350, y: 200 },
    { x: 550, y: 200 },
    { x: 750, y: 200 },
    { x: 150, y: 400 }, // Second road sidewalk
    { x: 350, y: 400 },
    { x: 550, y: 400 },
    { x: 750, y: 400 },
    { x: 220, y: 100 }, // Vertical road sidewalks
    { x: 220, y: 300 },
    { x: 220, y: 500 },
    { x: 420, y: 100 },
    { x: 420, y: 300 },
    { x: 420, y: 500 },
    { x: 620, y: 100 },
    { x: 620, y: 300 },
    { x: 620, y: 500 },
  ];
  
  return spawnPoints.filter(point => !checkCollision(point.x, point.y));
}