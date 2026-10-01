// Escher-esque Marching Composition using WFC
// Balls/ants march through isometric surfaces in 3 different orientations

// Configuration
let tileSize = 60;
let tileX = 10;
let tileY = 15;
let tileWidth, tileHeight;
let wfc;
let rng;
let TILES = [];
let colors = [
  "yellow",
  "lightblue", 
  "green",
];
let generated = false;

// Marching entities
let entities = [];
let entityCount = 30;

// Check if Schrodinger is loaded
if (typeof Schrodinger === 'undefined') {
  console.error('Schrodinger WFC library not loaded. Please check that the library is included correctly.');
}

// Adjacency transformation matrices (from iso.js)
let adjacenciesTransformA = [
  'AAaaaaaa',
  'BBDdbbDd',
  'CCDdccDd'
].map(a => a.split(''));

let adjacenciesTransformB = [
  'aaaaAAaa',
  'bbdDBBdD',
  'ccdDCCdD'
].map(a => a.split(''));

// Entity class for marching balls/ants
class MarchingEntity {

  draw() {
  }

  update() {

  }
}

// Helper function to get tile at grid coordinates
function getTileAt(gridX, gridY) {
  if (!wfc) return null;
  
  for (const [cell, coords] of wfc.iterate()) {
    if (coords[0] === gridX && coords[1] === gridY) {
      return cell;
    }
  }
  return null;
}

// Helper function to get adjacencies based on tile configuration
function getAdjacencies(config, arr, transform) {
  let result = [];
  for (let i = 0; i < arr.length; i += 2) {
    let index1 = config[i];
    let index2 = config[i+1];
    let v1 = arr[index1];
    let v2 = arr[index2];
    let t1 = transform[v1][i];
    let t2 = transform[v2][i+1];
    result.push([t1, t2].join(''));
  }
  return result;
}

// Create Type A tile
function createTileA(types) {
  return {
    name: "A-" + types.join(""),
    adjacencies: getAdjacencies([5, 0, 1, 6, 7, 6, 4, 7], types, adjacenciesTransformA),
    weight: 1,
    draw: function(w, h) {
      let triangles = [
        [[w / 2, 0], [w, 0], [w / 2, h / 3]],
        [[w, 0], [w, h*2 / 3], [w / 2, h / 3]],
        [[w, h*2 / 3], [w / 2, h], [w / 2, h / 3]],
        [[w / 2, h], [0, h*2 / 3], [w / 2, h / 3]],
        [[0, h*2 / 3], [0, 0], [w / 2, h / 3]],
        [[0, 0], [w / 2, 0], [w / 2, h / 3]],
        [[w, h*2 / 3], [w, h], [w / 2, h]],
        [[0, h*2 / 3], [w / 2, h], [0, h]]
      ];

      for (let i = 0; i < types.length; i++) {
        noStroke();
        fill(colors[types[i]]);
        triangle(...triangles[i].flat());
      }
    }
  };
}

// Create Type B tile
function createTileB(types) {
  return {
    name: "B-" + types.join(""),
    adjacencies: getAdjacencies([5, 0, 0, 2, 7, 6, 5, 3], types, adjacenciesTransformB),
    weight: 1,
    draw: function(w, h) {
      let triangles = [
        [[w / 2, 0], [w, 0], [w, h / 3]],
        [[w/2, 0], [w, h/ 3], [w / 2, h*2 / 3]],
        [[w, h/ 3], [w, h], [w / 2, h*2 / 3]],
        [[0, h], [0, h/ 3], [w / 2, h*2 / 3]],
        [[0, h/ 3], [w/2, 0], [w / 2, h*2 / 3]],
        [[0, 0], [w / 2, 0], [0, h / 3]],
        [[w/2, h * 2 / 3], [w, h], [w / 2, h]],
        [[w/2, h * 2 / 3], [0, h], [w/2, h]]
      ];

      for (let i = 0; i < types.length; i++) {
        noStroke();
        fill(colors[types[i]]);
        triangle(...triangles[i].flat());
      }
    }
  };
}

// Generate all valid tile combinations
function iterateOverCombinations(elements, places, fn) {
  for (let i = 0; i < Math.pow(elements.length, places); i++) {
    let c = i.toString(elements.length).padStart(places, '0').split('').map(e => parseInt(e));
    fn(c);
  }
}

// Define the required pairs for valid tiles (from iso.js)
let requiredPairsA = [
  [[0, 5], [2, 3]], // |
  [[0, 1], [2, 6], [3, 4]], // /
  [[1, 2], [4, 5], [3, 7]], //   \
];

let requiredPairsB = [
  [[1, 4], [6, 7]], // |
  [[1, 2], [4, 5], [3, 7]], // /
  [[0, 1], [2, 6], [3, 4]] // \
];

// Generate all possible valid tiles
function generateTiles() {
  let possibleTilesA = [];
  let possibleTilesB = [];

  // Generate Type A tiles
  iterateOverCombinations([0, 1, 2], 8, (arrangement) => {
    let valid = true;
    for (let i = 0; i < 3; i++) {
      for (let pair of requiredPairsA[i]) {
        if (
          (arrangement[pair[0]] === i || arrangement[pair[1]] === i) &&
          arrangement[pair[0]] !== arrangement[pair[1]]
        ) {
          valid = false;
          break;
        }
      }
      if (!valid) break;
    }
    if (valid) {
      possibleTilesA.push(arrangement);
    }
  });

  // Generate Type B tiles
  iterateOverCombinations([0, 1, 2], 8, (arrangement) => {
    let valid = true;
    for (let i = 0; i < 3; i++) {
      for (let pair of requiredPairsB[i]) {
        if (
          (arrangement[pair[0]] === i || arrangement[pair[1]] === i) &&
          arrangement[pair[0]] !== arrangement[pair[1]]
        ) {
          valid = false;
          break;
        }
      }
      if (!valid) break;
    }
    if (valid) {
      possibleTilesB.push(arrangement);
    }
  });

  // Create tile definitions
  for (let t of possibleTilesA) {
    TILES.push(createTileA(t));
  }
  for (let t of possibleTilesB) {
    TILES.push(createTileB(t));
  }

  // Assign IDs to tiles
  for (let i = 0; i < TILES.length; i++) {
    TILES[i].id = i;
  }

  console.log(`Generated ${TILES.length} tiles`);
}

// Random number generator class
class P5Random {
  constructor() {
    this.proxy = {
      random: () => random()
    }
  }

  setSeed(seed) {
    console.log(`Setting seed: ${seed}`);
    randomSeed(seed);
  }

  random() {
    return this.proxy.random();
  }
}

// p5.js setup function
function setup() {
  // Calculate tile dimensions
  tileWidth = tileSize * sqrt(3);
  tileHeight = (tileSize * 3) / 2;

  // Create canvas
  createCanvas(tileX * tileWidth, tileY * tileHeight);

  // Generate tiles
  generateTiles();

  // Setup RNG
  rng = new P5Random();
  rng.setSeed(floor(random(1000000)));

  // Generate WFC pattern
  generateWFCPattern();
  console.log("WFC pattern generated successfully");
  
  // Initialize marching entities
  initializeEntities();
}

function generateWFCPattern() {
  try {
    const grid = new Schrodinger.SquareGrid(tileX, tileY);
    wfc = new Schrodinger.WFC(TILES, grid, {
      random: rng
    });

    // Generate the complete pattern
    wfc.start();
    generated = true;

  } catch (error) {
    console.error('Error generating WFC pattern:', error);
  }
}

function initializeEntities() {
  entities = [];
  // Iterate over all the edges of the grid
  // Top left
  for (let i = 0; i < tileX; i++) {
    let tile = getTileAt(i, 0);
    console.log(tile.value);
  }
  // Top right
  for (let i = 0; i < tileX; i++) {
  }
}

// p5.js draw function
function draw() {
  background(50);
  
  if (!generated || !wfc) return;

  // Draw the WFC generated pattern
  for (const [cell, coords] of wfc.iterate()) {
    const x = coords[0] * tileWidth;
    const y = coords[1] * tileHeight;

    if (cell.collapsed && cell.choices.length > 0) {
      push();
      translate(x, y);
      cell.choices[0].draw(tileWidth, tileHeight);
      pop();
    }
  }
  
  // Update and draw marching entities
  for (let entity of entities) {
    entity.update();
    entity.draw();
  }
}

// Key controls
function keyPressed() {
  if (key === 'R' || key === 'r') {
    // Regenerate pattern
    rng.setSeed(floor(random(1000000)));
    generateWFCPattern();
    initializeEntities();
  } else if (key === ' ') {
    // Toggle entity movement or add more entities
    initializeEntities();
  }
} 