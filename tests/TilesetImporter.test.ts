import { TilesetImporter } from '../src/TilesetImporter';
import { TileDef, TileDefFactory, AdjacencyValue } from '../src/TileDef';
import fs from 'fs';
import path from 'path';
import { matchAdjacencies, matchAdjacencyStrings } from '../src/Adjacencies';
import { parseAdjacencyRule, DirectionalRule, RuleType, Rule } from '../src/AdjacencyGrammar';

// Mock fs module
jest.mock('fs');

// Helper function for safely matching adjacencies that could be either strings or Rule objects
function matchAdj(value: AdjacencyValue, ruleOrString: string | Rule): boolean {
  if (typeof value === 'string') {
    if (typeof ruleOrString === 'string') {
      return matchAdjacencyStrings(value, ruleOrString);
    } else {
      // Parse string value to Rule
      const parsed = parseAdjacencyRule(value);
      if (parsed instanceof Error) {
        return false;
      }
      return matchAdjacencies(parsed, ruleOrString);
    }
  } else {
    // value is already a Rule
    if (typeof ruleOrString === 'string') {
      // Parse the string to a Rule
      const parsed = parseAdjacencyRule(ruleOrString);
      if (parsed instanceof Error) {
        return false;
      }
      return matchAdjacencies(value, parsed);
    } else {
      // Both are Rule objects
      return matchAdjacencies(value, ruleOrString);
    }
  }
}

// Helper function to safely access DirectionalRule properties
function getDirectionalRuleParts(value: AdjacencyValue): { origin: Rule, destination: Rule } | null {
  if (typeof value === 'string') {
    const parsed = parseAdjacencyRule(value);
    if (parsed instanceof Error || parsed.type !== RuleType.Directional) {
      return null;
    }
    return parsed as DirectionalRule;
  } else if (value.type === RuleType.Directional) {
    return value as DirectionalRule;
  }
  return null;
}

describe('TilesetImporter', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('loadFromFile', () => {
    it('should load a tileset from a JSON file', () => {
      // Mock fs.readFileSync to return a valid JSON file
      const mockTilesetJson = JSON.stringify({
        tiles: [
          {
            name: 'grass',
            draw: 'function() { /* draw grass */ }',
            adjacencies: ['grass', 'grass|water', 'grass', 'grass|water']
          },
          {
            name: 'water',
            draw: 'function() { /* draw water */ }',
            adjacencies: ['water|grass', 'water', 'water|grass', 'water']
          }
        ]
      });

      (fs.readFileSync as jest.Mock).mockReturnValue(mockTilesetJson);
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const tileset = TilesetImporter.loadFromFile('tileset.json');

      // Check that we have the right number of tiles
      expect(tileset.length).toBe(2);

      // Check that the tiles have the right properties
      expect(tileset[0].name).toBe('grass');
      expect(tileset[0].draw).toBeDefined();
      expect(tileset[0].adjacencies).toBeDefined();
      expect(tileset[0].adjacencies.length).toBe(4);

      // Check that adjacency parsing worked - we'll test north (index 0) direction
      expect(matchAdj(tileset[0].adjacencies[0], 'grass')).toBe(true);
      
      // East (index 1) checks
      expect(matchAdj(tileset[0].adjacencies[1], 'grass|water')).toBe(true);
      
      // Test with a non-matching rule
      expect(matchAdj(tileset[0].adjacencies[1], 'stone')).toBe(false);
    });

    it('should load and parse complex adjacency rules correctly', () => {
      // Mock fs.readFileSync to return a tileset with complex rules
      const mockTilesetJson = JSON.stringify({
        tiles: [
          {
            name: 'forest',
            draw: 'function() { /* draw forest */ }',
            adjacencies: [
              'forest|mountain',     // north
              '[forest>plain]',      // east
              'forest+river',        // south
              '^desert'              // west
            ]
          },
          {
            name: 'desert',
            draw: 'function() { /* draw desert */ }',
            adjacencies: [
              'desert|oasis',        // north
              'desert+dune|rock',    // east
              '[desert>savanna]',    // south
              '^ocean'               // west
            ]
          }
        ]
      });

      (fs.readFileSync as jest.Mock).mockReturnValue(mockTilesetJson);
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const tileset = TilesetImporter.loadFromFile('tileset.json');

      // Verify tiles were loaded
      expect(tileset.length).toBe(2);
      expect(tileset[0].name).toBe('forest');
      expect(tileset[1].name).toBe('desert');

      // Check adjacencies for forest tile
      const forest = tileset[0];
      expect(forest.adjacencies).toBeDefined();
      expect(forest.adjacencies.length).toBe(4);
      
      // Test choice rule (north - index 0)
      expect(matchAdj(forest.adjacencies[0], 'forest')).toBe(true);
      expect(matchAdj(forest.adjacencies[0], 'mountain')).toBe(true);
      expect(matchAdj(forest.adjacencies[0], 'desert')).toBe(false);
      
      // Test directional rule (east - index 1)
      const directionalRule = getDirectionalRuleParts(forest.adjacencies[1]);
      if (directionalRule) {
        expect(matchAdj(directionalRule.origin, 'forest')).toBe(true);
        expect(matchAdj(directionalRule.destination, 'plain')).toBe(true);
      }
      
      // Test compound rule (south - index 2)
      expect(matchAdj(forest.adjacencies[2], 'forest+river')).toBe(true);
      expect(matchAdj(forest.adjacencies[2], 'forest')).toBe(false);
      
      // Test negated rule (west - index 3)
      expect(matchAdj(forest.adjacencies[3], 'forest')).toBe(true);
      expect(matchAdj(forest.adjacencies[3], 'desert')).toBe(false);

      // Check adjacencies for desert tile
      const desert = tileset[1];
      expect(desert.adjacencies).toBeDefined();
      expect(desert.adjacencies.length).toBe(4);
      
      // Test choice rule (north - index 0)
      expect(matchAdj(desert.adjacencies[0], 'desert')).toBe(true);
      expect(matchAdj(desert.adjacencies[0], 'oasis')).toBe(true);
      
      // Test compound with choice rule (east - index 1)
      expect(matchAdj(desert.adjacencies[1], 'desert+dune')).toBe(true);
      expect(matchAdj(desert.adjacencies[1], 'rock')).toBe(true);
      expect(matchAdj(desert.adjacencies[1], 'desert+rock')).toBe(false);
      
      // Test directional rule (south - index 2)
      const desertDirectionalRule = getDirectionalRuleParts(desert.adjacencies[2]);
      if (desertDirectionalRule) {
        expect(matchAdj(desertDirectionalRule.origin, 'desert')).toBe(true);
        expect(matchAdj(desertDirectionalRule.destination, 'savanna')).toBe(true);
      }
      
      // Test negated rule (west - index 3)
      expect(matchAdj(desert.adjacencies[3], 'mountain')).toBe(true);
      expect(matchAdj(desert.adjacencies[3], 'ocean')).toBe(false);
    });

    it('should throw an error for non-existent file', () => {
      // Mock fs.existsSync to return false
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      expect(() => {
        TilesetImporter.loadFromFile('non-existent.json');
      }).toThrow();

      // Ensure fs.readFileSync is not called
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });

    it('should throw an error for invalid JSON', () => {
      // Mock fs.readFileSync to return invalid JSON
      (fs.readFileSync as jest.Mock).mockReturnValue('{ invalid json }');
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      expect(() => {
        TilesetImporter.loadFromFile('invalid.json');
      }).toThrow();
    });

    it('should throw an error for invalid tile definitions', () => {
      // We don't need to mock defineTile anymore since we check for name in TilesetImporter
      // Instead, we'll just verify that the error is thrown when loading a tileset with invalid tiles
      
      // Mock fs.readFileSync to return a JSON with invalid tile definitions
      const mockTilesetJson = JSON.stringify({
        tiles: [
          {
            // Missing name property
            draw: 'function() {}',
            adjacencies: []
          }
        ]
      });

      (fs.readFileSync as jest.Mock).mockReturnValue(mockTilesetJson);
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      
      // Suppress error logs for cleaner test output
      jest.spyOn(console, 'error').mockImplementation(() => {});
      
      // A missing name will cause an error during tileset loading
      expect(() => {
        TilesetImporter.loadFromFile('invalid-tiles.json');
      }).toThrow('Tile definition must have a name');
      
      // Restore mocks
      (console.error as jest.Mock).mockRestore();
    });
  });

  describe('importFromDirectory', () => {
    it('should import tiles from a directory', () => {
      // Mock implementations for fs functions
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockReturnValue(['tile1.json', 'tile2.json', 'not-a-tile.txt']);
      
      // Mock JSON content for tile files
      (fs.readFileSync as jest.Mock).mockImplementation((filePath) => {
        if (filePath.toString().includes('tile1.json')) {
          return JSON.stringify({
            tiles: [
              {
                name: 'tile1',
                draw: 'function() { /* draw tile1 */ }',
                adjacencies: ['tile1', 'tile2', 'tile1', 'tile2']
              }
            ]
          });
        } else if (filePath.toString().includes('tile2.json')) {
          return JSON.stringify({
            tiles: [
              {
                name: 'tile2',
                draw: 'function() { /* draw tile2 */ }',
                adjacencies: ['tile2', 'tile1', 'tile2', 'tile1']
              }
            ]
          });
        }
        return '{}';
      });

      const tilesets = TilesetImporter.importFromDirectory('tiles');

      // The result should be a record with tileset names as keys
      expect(Object.keys(tilesets).length).toBe(2);
      expect(tilesets.tile1).toBeDefined();
      expect(tilesets.tile2).toBeDefined();
      
      // Check tiles in first tileset
      expect(tilesets.tile1.length).toBe(1);
      expect(tilesets.tile1[0].name).toBe('tile1');
      
      // Check tiles in second tileset
      expect(tilesets.tile2.length).toBe(1);
      expect(tilesets.tile2[0].name).toBe('tile2');
      
      // Check adjacencies for first tile 
      expect(tilesets.tile1[0].adjacencies.length).toBe(4);
      
      const tile1Rule = parseAdjacencyRule('tile1');
      const tile2Rule = parseAdjacencyRule('tile2');
      
      if (!(tile1Rule instanceof Error) && !(tile2Rule instanceof Error)) {
        expect(matchAdj(tilesets.tile1[0].adjacencies[0], tile1Rule)).toBe(true);
        expect(matchAdj(tilesets.tile1[0].adjacencies[1], tile2Rule)).toBe(true);
        
        // Check adjacencies for second tile
        expect(tilesets.tile2[0].adjacencies.length).toBe(4);
        expect(matchAdj(tilesets.tile2[0].adjacencies[0], tile2Rule)).toBe(true);
        expect(matchAdj(tilesets.tile2[0].adjacencies[3], tile1Rule)).toBe(true);
      }
    });

    it('should throw an error if the directory does not exist', () => {
      // Mock fs.existsSync to return false
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      expect(() => {
        TilesetImporter.importFromDirectory('non-existent-dir');
      }).toThrow();
    });
  });
});