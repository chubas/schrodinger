let tileSize = 40
let tileX = 10
let tileY = 15
let cw, ch
let hexWidth, hexHeight
let tileWidth, tileHeight
// function setup2() {
//   hexWidth = tileSize * sqrt(3)
//   hexHeight = tileSize * 2
//   tileWidth = hexWidth
//   tileHeight = (hexHeight * 3) / 4
//   cw = tileWidth * tileX
//   ch = tileHeight * tileY
//   if (debug) {
//     createCanvas(cw + tileWidth / 2, ch + tileSize / 2)
//   } else {
//     createCanvas(cw, ch)
//   }
// }

let debug = false
// function draw2() {
//   background(200)

//   translate(tileWidth / 2, tileSize / 2)
//   // Iterate over the grid rows
//   for (let row = 0; row < tileY; row++) {
//     // Iterate over the grid columns
//     for (let col = 0; col < tileX; col++) {
//       const xOffset = row % 2 === 0 ? tileWidth / 2 : 0
//       const yOffset = tileSize / 2
//       const x = col * tileWidth + xOffset
//       const y = row * tileHeight + yOffset

//       // stroke(0)
//       drawHexagon(x, y, tileSize)
//       // fill('red')
//       // circle(x, y, 10)

//       // Draw coordinates inside the hexagon
//       noStroke()
//       fill(0)
//       textAlign(CENTER, CENTER)
//       text(`(${col}, ${row})`, x, y)
//     }
//   }

//   stroke(0)
//   for (let y = 0; y < ch; y += tileHeight) {
//     for (let x = 0; x < cw; x += tileWidth) {
//       line(0, y, cw, y)
//       line(x, 0, x, ch)
//     }
//   }
// }

// function drawHexagon(x, y, size) {
//   const angle = TWO_PI / 6

//   beginShape()
//   fill("yellow")
//   for (let i = 0; i < 6; i++) {
//     const px = x + size * sin(i * angle)
//     const py = y + size * cos(i * angle)
//     vertex(px, py)
//   }
//   endShape(CLOSE)
// }

let TILES = []
let colors = [
  "yellow",
  "lightblue",
  "green",
]

// 3 types of surfaces: A is top, B is left, C is right
// d means that it can accept either left or right
//
let adjacenciesTransformA = [
  'AAaaaaaa',
  'BBDdbbDd',
  'CCDdccDd'
].map(a => a.split(''))
let adjacenciesTransformB = [
  'aaaaAAaa',
  'bbdDBBdD',
  'ccdDCCdD'
].map(a => a.split(''))
let getAdjacencies = (config, arr, transform) => {
  // Config: 5, 0, 1, 6, 7, 6, 4, 7
  // Arr: 1, 1, 0, 0, 2, 2, 2, 0,
  // Expected: C, B, D, d, a, c, D, a
  let result = []
  for (let i = 0; i < arr.length; i += 2) {
    let index1 = config[i]
    let index2 = config[i+1]
    let v1 = arr[index1]
    let v2 = arr[index2]
    let t1 = transform[v1][i]
    let t2 = transform[v2][i+1]
    // console.log({ index1, v1, t1 })
    result.push([
      t1, t2
    ].join(''))
  }
  return result
}
// console.log(getAdjacencies([
//   5, 0, 1, 6, 7, 6, 4, 7
// ],[
//   1, 1, 0, 0, 2, 2, 2, 0
// ], adjacenciesTransformA))

let T = ['a', 'b', 'c']

let createTileA = (types) => {
  return new TileDef({
    name: "A-" + types.join(""),
    adjacencies: getAdjacencies([5, 0, 1, 6, 7, 6, 4, 7], types, adjacenciesTransformA),
    draw: (w, h, tile) => {
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
      ]
      for (let i = 0; i < types.length; i++) {
        noStroke()
        fill(colors[types[i]])
        triangle(...triangles[i].flat())
        debugTriangle(triangles, i)
      }
    },
  })
}

let debugTriangle = (triangles, i) => {
  let centroid = getCentroid(triangles[i])
  fill(0)
  textAlign(CENTER, CENTER)
  text(i, ...centroid)
}

let getCentroid = (triangle) => {
  let x = 0
  let y = 0
  for (let [px, py] of triangle) {
    x += px
    y += py
  }
  x /= 3
  y /= 3
  return [x, y]
}

let createTileB = (types) => {
  return new TileDef({
    name: "B-" + types.join(""),
    adjacencies: getAdjacencies([5, 0, 0, 2, 7, 6, 5, 3], types, adjacenciesTransformB),
    // adjacencies: [
    //   [T[types[5]], T[types[0]]],
    //   [T[types[0]], T[types[2]].toUpperCase()],
    //   [T[types[7]].toUpperCase(), T[types[6]].toUpperCase()],
    //   [T[types[5]], T[types[3]].toUpperCase()],
    // ].map(a => a.join('')),
    // adjacencies: [[5, 0], [0, 2], [7, 6], [5, 3]].map((arr) =>
    //   arr.map((i) => T[types[i]]).join('')
    // ),
    draw: (w, h, tile) => {
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
      ]
      for (let i = 0; i < types.length; i++) {
        noStroke()
        fill(colors[types[i]])
        triangle(...triangles[i].flat())
        debugTriangle(triangles, i)
      }
    },
  })
}

// Iterates over all possible combinations of elements in a given array
// It uses toString to convert the number to a base N number, where N is the number of elements
let iterateOverCombinations = (elements, places, fn) => {
  for (let i = 0; i < elements.length ** places; i++) {
    let c = i.toString(elements.length).padStart(places, '0').split('').map(e => elements[e])
    fn(c)
  }
  // for (let i = 0; i < Math.pow(elements.length, places); i++) {
  //   let arrangement = []
  //   let num = i

  //   for (let j = 0; j < places; j++) {
  //     const digit = num % elements.length
  //     arrangement.push(elements[digit])
  //     num = Math.floor(num / elements.length)
  //   }
  //   fn(arrangement)
  // }
}

// Color 0 is "top", 1 is "left" and 2 is "right"
// So color 0 should never make vertical lines, 1 never 60deg lines, and 2 never -60deg

// List the pair of tiles that create a "line" inside each tile with their "forbidden" orientation.
// Either they need to be the same, or else this orientation is "forbidden"
let requiredPairsA = [
  [[0, 5], [2, 3]], // |
  [[0, 1], [2, 6], [3, 4]], // /
  [[1, 2], [4, 5], [3, 7]], //   \
]
let requiredPairsB = [
  [[1, 4], [6, 7]], // |
  [[1, 2], [4, 5], [3, 7]], // /
  [[0, 1], [2, 6], [3, 4]] // \
]

let possibleTilesA = []
let possibleTilesB = []

iterateOverCombinations([0, 1, 2], 8, (arrangement) => {
  let valid = true
  // let f = arrangement.join('') == '02211002'
  for (let i = 0; i < 3; i++) {
    for (let pair of requiredPairsA[i]) {
      // if (f) {
      //   console.log(`i: ${i}`)
      //   console.log(`pair: ${pair.join(',')}`)
      //   console.log(`ELEMENTS: ${arrangement[pair[0]]}, ${arrangement[pair[1]]}`)
      //   console.log(`is i?: ${arrangement[pair[0]] === i || arrangement[pair[1]] === i}`)
      //   console.log(`are same? ${arrangement[pair[0]] === arrangement[pair[1]]}`)
      // }
      if (
        (arrangement[pair[0]] === i || arrangement[pair[1]] === i) &&
        arrangement[pair[0]] !== arrangement[pair[1]]) {
        valid = false
        break
      }
    }
  }
  if (valid) {
    possibleTilesA.push(arrangement.join(''))
  }
})
// TODO: This could be done in one pass
iterateOverCombinations([0, 1, 2], 8, (arrangement) => {
  let valid = true
  for (let i = 0; i < 3; i++) {
    for (let pair of requiredPairsB[i]) {
      if ((arrangement[pair[0]] === i || arrangement[pair[1]] === i) && arrangement[pair[0]] !== arrangement[pair[1]]) {
        valid = false
        break
      }
    }
  }
  if (valid) {
    possibleTilesB.push(arrangement.join(''))
  }
})

for (let t of possibleTilesA) {
  TILES.push(createTileA(t.split('')))
}
for (let t of possibleTilesB) {
  TILES.push(createTileB(t.split('')))
}

for (let i = 0; i < TILES.length; i++) {
  TILES[i].id = i
}
console.table(TILES.map((t) => {
  return {
    name: t.name,
    adjacencies: t.adjacencies.join(' '),
    id: t.id
  }
}))
let preview = false

function setup() {
  // randomSeed(101)
  hexWidth = tileSize * sqrt(3)
  hexHeight = tileSize * 2
  tileWidth = hexWidth
  tileHeight = (hexHeight * 3) / 4

  if (preview) {
    previewTiles()
    return
  }
  wfc = new WFC({
    gridX: tileX,
    gridY: tileY,
    possibleTiles: TILES,
    debug: true
  })
  createCanvas(wfc.gridX * tileWidth, wfc.gridY * tileHeight)
}

let done = false
function draw() {
  if (preview) {
    return
  }
  let newTiles = wfc.generate()
  if (newTiles.length === 0) {
    noLoop()
  }
  background(200)
  wfc.draw(tileWidth, tileHeight)
}

function previewTiles() {
  console.log("Previewing tiles")
  let nTiles = TILES.length
  let nCols = tileX
  let nRows = ceil(nTiles / nCols)
  createCanvas((nCols + 1) * tileWidth, (nRows + 1) * tileHeight)
  background(200)
  for (let t of TILES) {
    let i = TILES.indexOf(t)
    let x = (i % nCols) * tileWidth
    let y = floor(i / nCols) * tileHeight
    let w = tileWidth
    let h = tileHeight
    push()
    translate(x, y)
    t.draw(tileWidth, tileHeight)
    fill("red")

    textAlign(CENTER)
    text(t.adjacencies[0], w / 2, 15)
    text(t.adjacencies[2], w / 2, h - 8)
    text(t.id, w/2, h/2)
    textAlign(RIGHT)
    text(t.adjacencies[1], w - 5, h / 2)
    textAlign(LEFT)
    text(t.adjacencies[3], 5, h / 2)


    noFill()
    stroke("black")
    strokeWeight(3)
    rect(0, 0, tileWidth, tileHeight)
    pop()
  }
}

// On press "P", preview the tiles
function keyPressed() {
  if (key === 'P' || key === 'p') {
    preview = !preview
    if (preview) {
      previewTiles()
    } else {
      // Clear the canvas and create a new WFC
      clear()
      wfc = new WFC({
        gridX: tileX,
        gridY: tileY,
        possibleTiles: TILES,
        debug: false
      })
      done = false
      createCanvas(wfc.gridX * tileWidth, wfc.gridY * tileHeight)
    }
  }
}