// Hexagonal Grid Test using Cubic Coordinates
// Cubic coordinates: (x, y, z) where x + y + z = 0

// Grid parameters
let hexSize = 40;  // Radius from center to vertex
let gridRadius = 12; // How many hexagons from center
let debug = false;

// Colors
let hexFillColor;
let hexStrokeColor;
let textColor;

let wfc;
let wfcGenerator;
let done;
let chunkSize = 10;

let tiles;
let colors = {
    // 'A': 'yellow',
    // 'B': 'green',
    // 'C': 'lightblue',
    'A': '#FFFFFF',
    'B': '#D9D9D9',
    'C': '#A3A3A3',
}

let generateAdjacencies = (types) => {
    let adjacencies = [];
    adjacencies.push(types[0] === 'A' ? 'A' : 'a');
    adjacencies.push(types[1] === 'C' ? 'C' : 'c');
    adjacencies.push(types[2] === 'B' ? 'B' : 'b');
    adjacencies.push(types[3] === 'A' ? 'A' : 'a');
    adjacencies.push(types[4] === 'C' ? 'C' : 'c');
    adjacencies.push(types[5] === 'B' ? 'B' : 'b');

    return adjacencies;
}

function* allCombinations(array, positions) {
    const n = array.length;
    const indices = Array(positions).fill(0);

    while (true) {
        yield indices.map(i => array[i]);

        // Increment like a base-n number
        let i = positions - 1;
        while (i >= 0) {
            indices[i]++;
            if (indices[i] < n) break;
            indices[i] = 0;
            i--;
        }

        if (i < 0) return; // We're done
    }
}

let animationFrames = 120;
let getAnimationFrame = () => {
    let f = floor(frameCount / animationFrames);
    // Return the animation frame, and the value from 0 to 1 for the current frame
    return {
        frame: f,
        t: frameCount % animationFrames / animationFrames,
    }
}

function setup() {
    // createCanvas(1200, 1200);
    createCanvas(windowWidth, windowHeight);

    // Set colors
    hexFillColor = color(220, 240, 255);
    hexStrokeColor = color(100, 150, 200);
    textColor = color(50, 50, 50);

    // Iterate for all the possible combinations of A, B, C, then filter out the invalid ones
    let tileTypes = [];
    let matchingPairs = {
        'A': [[1, 2], [4, 5]],
        'B': [[0, 1], [3, 4]],
        'C': [[2, 3], [5, 0]],
    }
    for (let combination of allCombinations(['A', 'B', 'C'], 6)) {
        // It's a valid tile as long as the matching pairs are the same if either is the letter
        let isValid = true;
        for (let i = 0; i < 6; i++) {
            let letter = combination[i];
            let constrains = matchingPairs[letter];
            for (let [a, b] of constrains) {
                if ((i === a && combination[b] !== letter) || (i === b && combination[a] !== letter)) {
                    isValid = false;
                    break;
                }
            }
        }
        if (isValid) {
            tileTypes.push(combination.join(''));
        }
    }
    console.log({ tileTypes });

    let tiles = tileTypes.map(t => {
        return {
            name: t,
            adjacencies: generateAdjacencies(t),
            weight: floor(random(10)),
            draw: () => {
                for (let i = 0; i < 6; i++) {
                    let startAngle = -PI / 6 + TAU / 6 * i;
                    let angle = startAngle + TAU / 6;
                    let c = colors[t[i]];
                    fill(c);
                    noStroke();
                    // Draw the triangle from center to the two vertices
                    triangle(
                        0, 0,
                        cos(startAngle) * hexSize, sin(startAngle) * hexSize,
                        cos(angle) * hexSize, sin(angle) * hexSize,
                    );
                }
            }
        }
    })

    console.log(tiles);


    let grid = new CubicHexagonalGrid(gridRadius);

    wfc = new Schrodinger.WFC(tiles, grid, {
        maxRetries: 10,
        // logLevel: Schrodinger.LogLevel.DEBUG, // Enable DEBUG logging to see exhaustion checks
    });
    wfcGenerator = wfc.execute();
}

function iterateOverGrid(callback) {
    let R = gridRadius;
    for (let z = 0; z <= R; z++) { callback(R - z, -R, z, 'bottom-right') } // Y is constant
    for (let x = 0; x <= R; x++) { callback(-x, x - R, R, 'bottom') } // Z is constant
    for (let y = 0; y <= R; y++) { callback(-R, y, R - y, 'bottom-left') } // X is constant
    for (let z = 0; z <= R; z++) { callback(-z, R, z - R, 'top-left') } // Y is constant
    for (let x = 0; x <= R; x++) { callback(x, R - x, -R, 'top') } // Z is constant
    for (let y = 0; y <= R; y++) { callback(R, -y, y - R, 'top-right') } // X is constant
}



let balls = [];
function drawBalls() {
    // Translat to the center of the canvas
    push();
    translate(width / 2, height / 2);
    if (balls.length === 0) {
        // Initialize the balls
        // Iterate over each side of the grid
        iterateOverGrid((x, y, z, dir) => {
            // console.log(x, y, z, dir);
            balls.push({
                x: x,
                y: y,
                z: z,
                dir: dir,
            });
        });
    } else {
        balls.forEach(ball => {
            // Draw a ball centered on the hexagon at the coords
            let pixelPos = cubicToPixel(ball.x, ball.y, ball.z);
            // console.log(pixelPos);
            push();
            noFill();
            stroke(0);
            // circle(pixelPos.x, pixelPos.y, hexSize * 0.5);
            let { frame, t } = getAnimationFrame();
            let r = hexSize * 0.5 * (1 - t);
            circle(pixelPos.x, pixelPos.y, r);

            pop();
        });
    }
    pop();
}

function draw() {

    // Clear background and setup coordinate system
    background(255);
    push();
    translate(width / 2, height / 2); // Center the grid on canvas

    // Draw all cells - either as colored tiles or empty hexes with coordinates
    for (const [cell, coords] of wfc.iterate()) {
        const [x, y, z] = coords;
        const pixelPos = cubicToPixel(x, y, z);

        push();
        translate(pixelPos.x, pixelPos.y);

        if (cell.collapsed && cell.choices.length > 0) {
            cell.choices[0].draw(hexSize);
            if (debug) {
                // Draw cell name at the center
                fill(textColor);
                noStroke();
                textAlign(CENTER, CENTER);
                textSize(12);
                text(cell.choices[0].name, 0, -20);
                // Draw adjacencies near the edge of the hexagon
                for (let i = 0; i < 6; i++) {
                    let angle = TAU / 6 * i;
                    let d = hexSize * 0.7;
                    let x = cos(angle) * d;
                    let y = sin(angle) * d;
                    text(cell.choices[0].adjacencies[i], x, y);
                }
            }
        }

        pop();
    }

    pop(); // Restore coordinate system
    if (debug) {
        drawHexGrid();
    }

    // Continue WFC generation
    if (wfcGenerator) {
        for (let i = 0; i < chunkSize; i++) {
            if (!wfcGenerator) break;
            let result = wfcGenerator.next();
            if (result.done) {
                wfcGenerator = null;
                done = true;
                console.log("WFC completed!");
            }
        }
    }

    if (done) drawBalls();
}

function drawHexGrid() {

    // Move origin to center of canvas
    push();
    translate(width / 2, height / 2);

    // Generate all cubic coordinates within the grid radius
    const hexCoords = generateHexCoordinates(gridRadius);
    stroke('#FF000080');
    strokeWeight(2);

    // Draw each hexagon
    for (const coords of hexCoords) {
        const [x, y, z] = coords;

        // Convert cubic coordinates to pixel position
        const pixelPos = cubicToPixel(x, y, z);

        // Draw the hexagon
        noFill();
        drawHexagon(pixelPos.x, pixelPos.y, coords);
    }

    pop();
}

// Generate all cubic coordinates within a given radius
function generateHexCoordinates(radius) {
    const coords = [];

    for (let x = -radius; x <= radius; x++) {
        const minY = Math.max(-radius, -x - radius);
        const maxY = Math.min(radius, -x + radius);

        for (let y = minY; y <= maxY; y++) {
            const z = -x - y; // Cubic coordinate constraint: x + y + z = 0
            coords.push([x, y, z]);
        }
    }

    return coords;
}

// Convert cubic coordinates to pixel coordinates
function cubicToPixel(x, y, z) {
    // Using flat-top hexagon orientation
    const px = hexSize * (Math.sqrt(3) * x + Math.sqrt(3) / 2 * z);
    const py = hexSize * (3 / 2 * z);

    return { x: px, y: py };
}

// Draw a single hexagon at the given pixel position
function drawHexagon(px, py, coords) {
    push();
    translate(px, py);

    beginShape();
    for (let i = 0; i < 6; i++) {
        const angle = TWO_PI / 6 * i + PI / 6; // Add PI/6 for flat-top orientation
        const hx = cos(angle) * hexSize;
        const hy = sin(angle) * hexSize;
        vertex(hx, hy);
    }
    endShape(CLOSE);

    // Draw coordinate text
    fill(textColor);
    noStroke();
    textAlign(CENTER, CENTER);
    textSize(20);

    const [x, y, z] = coords;
    text(`${x},${y},${z}`, 0, 0);

    pop();
}

// Optional: Add mouse interaction to show coordinates
function mouseMoved() {
    // Convert mouse position to hex coordinates and display info
    const mouseHex = pixelToCubic(mouseX - width / 2, mouseY - height / 2);

    // console.log(`Mouse hex: ${mouseHex.x}, ${mouseHex.y}, ${mouseHex.z}`);
}

// Convert pixel coordinates back to cubic coordinates (for mouse interaction)
function pixelToCubic(px, py) {
    // Convert pixel to cubic coordinates (flat-top orientation)
    const x = (Math.sqrt(3) / 3 * px - 1 / 3 * py) / hexSize;
    const z = (2 / 3 * py) / hexSize;
    const y = -x - z;

    // Round to nearest integer cubic coordinates
    return roundCubic(x, y, z);
}

// Round cubic coordinates to the nearest valid hex
function roundCubic(x, y, z) {
    let rx = Math.round(x);
    let ry = Math.round(y);
    let rz = Math.round(z);

    const xDiff = Math.abs(rx - x);
    const yDiff = Math.abs(ry - y);
    const zDiff = Math.abs(rz - z);

    if (xDiff > yDiff && xDiff > zDiff) {
        rx = -ry - rz;
    } else if (yDiff > zDiff) {
        ry = -rx - rz;
    } else {
        rz = -rx - ry;
    }

    return { x: rx, y: ry, z: rz };
}

// Add keyboard controls for different views
function keyPressed() {
    if (key === 'r' || key === 'R') {
        // Redraw
        drawHexGrid();
    } else if (key === '+' || key === '=') {
        // Increase grid size
        gridRadius = Math.min(gridRadius + 1, 8);
        drawHexGrid();
    } else if (key === '-' || key === '_') {
        // Decrease grid size
        gridRadius = Math.max(gridRadius - 1, 1);
        drawHexGrid();
    }
} 