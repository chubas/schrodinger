import { DeltaChange } from './WFC.js';

let debugDelta = (delta: DeltaChange<[number, number]>) => {
  console.log('Delta:')
  console.log('Collapsed cell:', delta.collapsedCell.coords);
  console.log('Picked value:', delta.pickedValue.name);
  console.log('Discarded values:');
  for (let { coords, tiles, collapsed } of delta.discardedValues) {
    console.log(coords, ' => ', tiles.map(t => t.name))
  }
}

export { debugDelta };