// Hexagonal Grid Test using Cubic Coordinates
// Cubic coordinates: (x, y, z) where x + y + z = 0

// Grid parameters
let hexSize = 80;  // Radius from center to vertex
let gridRadius = 6; // How many hexagons from center

// Colors
let hexFillColor;
let hexStrokeColor;
let textColor;

let wfc;
let wfcGenerator;
let done;

let tiles;
let colors = [
    // Pick desaturated colors for visibility
    '#fdffb6', '#ff8fab', '#34a0a4'
]

let drawHexTile = (fillColor) => {
    // Origin will be translated to the center of the hexagon
    return (hexSize) => {
        push();
        fill(fillColor);
        noStroke();
        // Draw a hexagon
        beginShape();
        for (let i = 0; i < 6; i++) {
            const angle = TWO_PI / 6 * i + PI / 6; // Add PI/6 for flat-top orientation
            const hx = cos(angle) * hexSize;
            const hy = sin(angle) * hexSize;
            vertex(hx, hy);
        }
        endShape(CLOSE);
        pop();
    }
}

function setup() {
    // createCanvas(1200, 1200);
    createCanvas(windowWidth, windowHeight);

    // Set colors
    hexFillColor = color(220, 240, 255);
    hexStrokeColor = color(100, 150, 200);
    textColor = color(50, 50, 50);

    tiles = [
        { name: 'A-ALL', adjacencies: ['X', 'X', 'X', 'X', 'X', 'X'], draw: drawHexTile(colors[0]) },
        { name: 'B-ALL', adjacencies: ['X', 'X', 'X', 'X', 'X', 'X'], draw: drawHexTile(colors[1]) },
        { name: 'C-ALL', adjacencies: ['X', 'X', 'X', 'X', 'X', 'X'], draw: drawHexTile(colors[2]) }
    ]

    let grid = new CubicHexagonalGrid(gridRadius);
    wfc = new Schrodinger.WFC(tiles, grid, {
        maxRetries: 10,
        // logLevel: Schrodinger.LogLevel.DEBUG, // Enable DEBUG logging to see exhaustion checks
    });
    wfcGenerator = wfc.execute();
}

function draw() {
    if (done) return;

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
        }

        pop();
    }

    pop(); // Restore coordinate system
    drawHexGrid();

    // Continue WFC generation
    if (wfcGenerator) {
        let result = wfcGenerator.next();
        if (result.done) {
            wfcGenerator = null;
            done = true;
            console.log("WFC completed!");
        }
    }
}

function drawHexGrid() {

    // Move origin to center of canvas
    push();
    translate(width / 2, height / 2);

    // Generate all cubic coordinates within the grid radius
    const hexCoords = generateHexCoordinates(gridRadius);

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

    // Draw hexagon shape
    // fill(hexFillColor);
    stroke(hexStrokeColor);
    strokeWeight(2);

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