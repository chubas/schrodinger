// Triangular Tile Pattern using WFC
// Based on the original _iso.js implementation

// Configuration
let tileSize = 30;
// let tileX = 10;
// let tileY = 15;
let tileX = 30;
let tileY = 20;
let tileWidth, tileHeight;
let wfc;
let rng;
let TILES = [];
let colors = [
  "yellow",
  "lightblue",
  "green",
];
let preview = false;
let done = false;
// Add variables for step-by-step execution
let wfcGenerator = null;
let stepMode = true;

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
  // let centroid = getCentroid(triangles[i]);
  // fill(0);
  // textAlign(CENTER, CENTER);
  // text(i, ...centroid);
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
        // stroke(colors[types[i]]);
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

  // possibleTilesA = possibleTilesA.slice(0, floor(possibleTilesA.length / 2));
  // possibleTilesB = possibleTilesB.slice(0, floor(possibleTilesB.length / 2));

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

  // Create a class for random using p5.js random lib
  class P5Random {
    constructor() {
      this.proxy = {
        random: () => {
          return random()
        }
      }
    }

    setSeed(seed) {
      console.log(`%cSetting seed: ${seed}`, 'color: green; font-weight: bold;');
      randomSeed(seed);
    }

    random() {
      let r = this.proxy.random();
      // console.log({ r });
      return r;
    }
  }

  rng = new P5Random();
  rng.setSeed(floor(random(1000000)));
  // Create canvas
  createCanvas(tileX * tileWidth, tileY * tileHeight);

  try {
    // Initialize WFC
    const grid = new Schrodinger.SquareGrid(tileX, tileY);
    wfc = new Schrodinger.WFC(TILES, grid, {
      maxRetries: 10,
      // logLevel: Schrodinger.LogLevel.DEBUG,
      random: rng
    });


    wfc.on('collapse', (cell) => {
      // console.log(`Collapsed cell: ${cell.id}: ${cell.choices[0].id} (${cell.choices[0].adjacencies})`);
      // console.log({ cell });
      // for (let c of cell.cells) {
      //   console.log(`${c.coords[0]}, ${c.coords[1]}: ${c.value}`, c.value)
      // }
    });

    // Listen for completion
    wfc.on('complete', () => {
      console.log('WFC completed successfully!');
      done = true;
    });

    wfc.on('error', (error) => {
      console.error('WFC error:', error);
    });
    
    // Initialize the generator but don't run it immediately
    // We'll step through it using the 'C' key
    if (stepMode) {
      wfcGenerator = wfc.execute();
    } else {
      // Start WFC to run to completion
      wfc.start();
    }
    
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
  if (done) return;

  background(200);

  // Draw the current state of the grid
  for (const [cell, coords] of wfc.iterate()) {
    const x = coords[0] * tileWidth;
    const y = coords[1] * tileHeight;

    if (cell.collapsed && cell.choices.length > 0) {
      push();
      translate(x, y);
      cell.choices[0].draw(tileWidth, tileHeight);
      // Draw the tile name in the center of the tile
      // fill(0);
      // textAlign(CENTER, CENTER);
      // text(cell.choices[0].name, tileWidth / 2, tileHeight / 2);
      // console.log(`${coords[0]}, ${coords[1]} | Adjacencies: ${cell.choices[0].adjacencies} --- ${cell.choices[0].id}`);
      pop();
      // Also draw the adjacencies
      // Top Adjacency. Align text top center to be within the cell and touching the top edge
      // fill('red');
      // textAlign(CENTER, TOP);
      // text(cell.choices[0].adjacencies[0], x + tileWidth / 2, y);
      // // Bottom Adjacency. Align text bottom center to be within the cell and touching the bottom edge
      // textAlign(CENTER, BOTTOM);
      // text(cell.choices[0].adjacencies[2], x + tileWidth / 2, y + tileHeight);
      // // Left Adjacency. Align text left center to be within the cell and touching the left edge
      // textAlign(LEFT, CENTER);
      // text(cell.choices[0].adjacencies[3], x, y + tileHeight / 2);
      // // Right Adjacency. Align text right center to be within the cell and touching the right edge
      // textAlign(RIGHT, CENTER);
      // text(cell.choices[0].adjacencies[1], x + tileWidth, y + tileHeight / 2);
      
      
    } else {
      // Draw uncollapsed cells
      // push();
      // translate(x, y);
      // fill(220);
      // stroke(150);
      // rect(0, 0, tileWidth, tileHeight);
      // pop();
      

      // Display the number of choices for the cell
      fill(0);
      textAlign(CENTER, CENTER);
      text(cell.choices.length, x + tileWidth / 2, y + tileHeight / 2);
    }
  }

  // If not done, continue collapsing
  // if (!done && frameCount % 5 === 0) {
  //   try {
  //     wfc.processCollapseQueue();
  //   } catch (e) {
  //     console.error('Error during collapse:', e);
  //     done = true;
  //   }
  // }
  // noLoop();
  // Advance the WFC one step
  if (stepMode) {
    const result = wfcGenerator.next();
    if (result.done) {
      done = true;
      wfcGenerator = null;
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
          // logLevel: Schrodinger.LogLevel.INFO
        });

        done = false;
        resizeCanvas(tileX * tileWidth, tileY * tileHeight);
        
        if (stepMode) {
          wfcGenerator = wfc.execute();
        } else {
          wfc.start();
        }
      } catch (error) {
        console.error('Error initializing WFC:', error);
        preview = true; // Stay in preview mode if there's an error
      }
    }
  } else if (key === 'R' || key === 'r') {
    // Restart WFC
    try {
      const grid = new Schrodinger.SquareGrid(tileX, tileY);
      let seed = floor(random(1000000));
      rng.setSeed(seed);
      wfc = new Schrodinger.WFC(TILES, grid, {
        maxRetries: 10,
        logLevel: Schrodinger.LogLevel.INFO,
        random: rng
      });

      done = false;
      
      if (stepMode) {
        wfcGenerator = wfc.execute();
      } else {
        wfc.start();
      }
    } catch (error) {
      console.error('Error restarting WFC:', error);
    }
  } else if (key === 'C' || key === 'c') {
    // Step through the WFC algorithm
    if (!preview && wfcGenerator) {
      // Take one step in the algorithm
      const result = wfcGenerator.next();
      
      if (result.done) {
        console.log('WFC completed via stepping!');
        done = true;
        wfcGenerator = null;
      } else {
        // Log the step for debugging
        if (result.value) {
          const step = result.value;
          console.log(`Step type: ${step.type}`);
          if (step.type === 'collapse' && step.group) {
            console.log(`Collapsed cells: ${step.group.cells.length}`);
            console.log(`Cause: ${step.group.cause}`);
          } else if (step.type === 'backtrack' && step.group) {
            console.log(`Backtracking from: ${step.group.cells.length} cells`);
          }
        }
      }
    } else if (!preview && !wfcGenerator) {
      // If we're not in step mode yet, initialize it
      try {
        const grid = new Schrodinger.SquareGrid(tileX, tileY);
        wfc = new Schrodinger.WFC(TILES, grid, {
          maxRetries: 10,
          logLevel: Schrodinger.LogLevel.INFO
        });

        done = false;
        stepMode = true;
        wfcGenerator = wfc.execute();
        console.log('Switched to step mode - press C to advance');
      } catch (error) {
        console.error('Error setting up step mode:', error);
      }
    }
  } else if (key === 'D' || key === 'd') {
    // Debug mode - display detailed information about each cell
    if (!preview && wfc) {
      console.log("--- WFC Cell Debug Information ---");
      
      // Iterate through each cell in the grid
      for (const [cell, coords] of wfc.iterate()) {
        // Create a console group with cell coordinates as header
        console.group(`Cell [${coords[0]}, ${coords[1]}] - ${cell.choices.length} choices${cell.collapsed ? " - COLLAPSED" : ""}`);
        
        // Create an array of objects for the table
        const tableData = cell.choices.map(tile => {
          return {
            ID: tile.id,
            Name: tile.name,
            Adjacencies: tile.adjacencies.join(', ')
          };
        });
        
        // Display the table of remaining tiles
        if (tableData.length > 0) {
          console.table(tableData);
        } else {
          console.log("No remaining choices");
        }
        
        console.groupEnd();
      }
      
      console.log("--- End of Debug Information ---");
    }
  }
}