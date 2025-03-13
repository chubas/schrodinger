// Triangular Tile Pattern using WFC
// Based on the original _iso.js implementation

// Configuration
let tileSize = 40;
let tileX = 10;
let tileY = 15;
let tileWidth, tileHeight;
let wfc;
let TILES = [];
let colors = [
  "yellow",
  "lightblue",
  "green",
];
let preview = false;
let done = false;

// Check if Schrodinger is loaded
if (typeof Schrodinger === 'undefined') {
  console.error('Schrodinger WFC library not loaded. Please check that the library is included correctly.');
}

// Adjacency transformation matrices
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

// Helper function to get the centroid of a triangle
function getCentroid(triangle) {
  let x = 0;
  let y = 0;
  for (let [px, py] of triangle) {
    x += px;
    y += py;
  }
  x /= 3;
  y /= 3;
  return [x, y];
}

// Debug function to draw triangle indices
function debugTriangle(triangles, i) {
  let centroid = getCentroid(triangles[i]);
  fill(0);
  textAlign(CENTER, CENTER);
  text(i, ...centroid);
}

// Create Type A tile
function createTileA(types) {
  return {
    name: "A-" + types.join(""),
    adjacencies: getAdjacencies([5, 0, 1, 6, 7, 6, 4, 7], types, adjacenciesTransformA),
    weight: 1,
    draw: function(w, h) {
      let triangles = [
        [
          [w / 2, 0],
          [w, 0],
          [w / 2, h / 3],
        ],
        [
          [w, 0],
          [w, h*2 / 3],
          [w / 2, h / 3],
        ],
        [
          [w, h*2 / 3],
          [w / 2, h],
          [w / 2, h / 3],
        ],
        [
          [w / 2, h],
          [0, h*2 / 3],
          [w / 2, h / 3],
        ],
        [
          [0, h*2 / 3],
          [0, 0],
          [w / 2, h / 3],
        ],
        [
          [0, 0],
          [w / 2, 0],
          [w / 2, h / 3],
        ],
        [
          [w, h*2 / 3],
          [w, h],
          [w / 2, h],
        ],
        [
          [0, h*2 / 3],
          [w / 2, h],
          [0, h],
        ],
      ];

      for (let i = 0; i < types.length; i++) {
        noStroke();
        fill(colors[types[i]]);
        triangle(...triangles[i].flat());
        debugTriangle(triangles, i);
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
        [
          [w / 2, 0],
          [w, 0],
          [w, h / 3],
        ],
        [
          [w/2, 0],
          [w, h/ 3],
          [w / 2, h*2 / 3],
        ],
        [
          [w, h/ 3],
          [w, h],
          [w / 2, h*2 / 3],
        ],
        [
          [0, h],
          [0, h/ 3],
          [w / 2, h*2 / 3],
        ],
        [
          [0, h/ 3],
          [w/2, 0],
          [w / 2, h*2 / 3],
        ],
        [
          [0, 0],
          [w / 2, 0],
          [0, h / 3],
        ],
        [
          [w/2, h * 2 / 3],
          [w, h],
          [w / 2, h],
        ],
        [
          [w/2, h * 2 / 3],
          [0, h],
          [w/2, h],
        ],
      ];

      for (let i = 0; i < types.length; i++) {
        noStroke();
        fill(colors[types[i]]);
        triangle(...triangles[i].flat());
        debugTriangle(triangles, i);
      }
    }
  };
}

// Iterate over all possible combinations of elements
function iterateOverCombinations(elements, places, fn) {
  for (let i = 0; i < Math.pow(elements.length, places); i++) {
    let c = i.toString(elements.length).padStart(places, '0').split('').map(e => parseInt(e));
    fn(c);
  }
}

// Define the required pairs for valid tiles
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

  console.log(`Generated ${TILES.length} tiles (${possibleTilesA.length} Type A, ${possibleTilesB.length} Type B)`);
}

// p5.js setup function
function setup() {
  // Calculate tile dimensions
  tileWidth = tileSize * sqrt(3);
  tileHeight = (tileSize * 3) / 2;

  // Generate tiles
  generateTiles();

  if (preview) {
    previewTiles();
    return;
  }

  // Create canvas
  createCanvas(tileX * tileWidth, tileY * tileHeight);

  try {
    // Initialize WFC
    const grid = new Schrodinger.SquareGrid(tileX, tileY);
    wfc = new Schrodinger.WFC(TILES, grid, {
      maxRetries: 10,
      logLevel: Schrodinger.LogLevel.INFO
    });

    // Start WFC
    wfc.start();

    // Listen for completion
    wfc.on('complete', () => {
      console.log('WFC completed successfully!');
      done = true;
    });

    wfc.on('error', (error) => {
      console.error('WFC error:', error);
    });
  } catch (error) {
    console.error('Error initializing WFC:', error);
    // Fall back to preview mode if WFC initialization fails
    preview = true;
    previewTiles();
  }
}

// p5.js draw function
function draw() {
  if (preview) return;

  background(200);

  // Draw the current state of the grid
  for (const [cell, coords] of wfc.iterate()) {
    const x = coords[0] * tileWidth;
    const y = coords[1] * tileHeight;

    if (cell.collapsed && cell.choices.length > 0) {
      push();
      translate(x, y);
      cell.choices[0].draw(tileWidth, tileHeight);
      pop();
    } else {
      // Draw uncollapsed cells
      push();
      translate(x, y);
      fill(220);
      stroke(150);
      rect(0, 0, tileWidth, tileHeight);
      pop();
    }
  }

  // If not done, continue collapsing
  if (!done && frameCount % 5 === 0) {
    try {
      wfc.processCollapseQueue();
    } catch (e) {
      console.error('Error during collapse:', e);
      done = true;
    }
  }
}

// Preview all generated tiles
function previewTiles() {
  console.log("Previewing tiles");
  let nTiles = TILES.length;
  let nCols = min(tileX, nTiles);
  let nRows = ceil(nTiles / nCols);

  resizeCanvas(nCols * tileWidth, nRows * tileHeight);
  background(200);

  for (let i = 0; i < TILES.length; i++) {
    let t = TILES[i];
    let x = (i % nCols) * tileWidth;
    let y = floor(i / nCols) * tileHeight;

    push();
    translate(x, y);
    t.draw(tileWidth, tileHeight);

    // Draw adjacency info
    fill("red");
    textAlign(CENTER);
    text(t.adjacencies[0], tileWidth / 2, 15);
    text(t.adjacencies[2], tileWidth / 2, tileHeight - 8);
    text(t.id, tileWidth/2, tileHeight/2);

    textAlign(RIGHT);
    text(t.adjacencies[1], tileWidth - 5, tileHeight / 2);

    textAlign(LEFT);
    text(t.adjacencies[3], 5, tileHeight / 2);

    noFill();
    stroke("black");
    strokeWeight(3);
    rect(0, 0, tileWidth, tileHeight);
    pop();
  }
}

// Toggle preview mode on 'P' key press
function keyPressed() {
  if (key === 'P' || key === 'p') {
    preview = !preview;
    if (preview) {
      previewTiles();
    } else {
      try {
        // Clear the canvas and create a new WFC
        const grid = new Schrodinger.SquareGrid(tileX, tileY);
        wfc = new Schrodinger.WFC(TILES, grid, {
          maxRetries: 10,
          logLevel: Schrodinger.LogLevel.INFO
        });

        done = false;
        resizeCanvas(tileX * tileWidth, tileY * tileHeight);
        wfc.start();
      } catch (error) {
        console.error('Error initializing WFC:', error);
        preview = true; // Stay in preview mode if there's an error
      }
    }
  } else if (key === 'R' || key === 'r') {
    try {
      // Restart WFC
      const grid = new Schrodinger.SquareGrid(tileX, tileY);
      wfc = new Schrodinger.WFC(TILES, grid, {
        maxRetries: 10,
        logLevel: Schrodinger.LogLevel.INFO
      });

      done = false;
      wfc.start();
    } catch (error) {
      console.error('Error restarting WFC:', error);
    }
  }
}