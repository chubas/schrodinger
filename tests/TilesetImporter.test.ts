import { TilesetImporter } from '../src/TilesetImporter';
import { TileDef } from '../src/TileDef';
import * as fs from 'fs';

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}));

describe('TilesetImporter', () => {
  // Reset mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loadFromFile', () => {
    it('should load a tileset from a JSON file', () => {
      // Mock file existence
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      
      // Mock file content
      const mockTileset = {
        tiles: [
          {
            name: 'grass',
            adjacencies: ['A', 'B', 'C', 'D'],
            weight: 1,
            rotation: 0,
            reflection: false
          },
          {
            name: 'water',
            adjacencies: ['E', 'F', 'G', 'H'],
            weight: 2
          }
        ]
      };
      
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockTileset));
      
      // Call the function
      const result = TilesetImporter.loadFromFile('/path/to/tileset.json');
      
      // Verify the result
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('grass');
      expect(result[1].name).toBe('water');
      expect(result[1].weight).toBe(2);
      
      // Verify adjacencies were parsed
      expect(result[0].adjacencies).toHaveLength(4);
      
      // Verify each tile has a draw function
      result.forEach(tile => {
        expect(typeof tile.draw).toBe('function');
      });
    });

    it('should throw an error for a non-existent file', () => {
      // Mock file non-existence
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      
      // Verify error is thrown
      expect(() => {
        TilesetImporter.loadFromFile('/path/to/invalid.json');
      }).toThrow(/not found/);
      
      // Verify fs.readFileSync was not called
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });

    it('should throw an error for invalid JSON', () => {
      // Mock file existence
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      
      // Mock invalid JSON
      (fs.readFileSync as jest.Mock).mockReturnValue('invalid json');
      
      // Verify error is thrown
      expect(() => {
        TilesetImporter.loadFromFile('/path/to/invalid.json');
      }).toThrow(/Failed to load tileset/);
    });

    it('should handle errors during parsing', () => {
      // Mock file existence
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      
      // Mock readFileSync to return invalid JSON
      (fs.readFileSync as jest.Mock).mockReturnValue('{ this is not valid JSON }');
      
      // Verify error is thrown
      expect(() => {
        TilesetImporter.loadFromFile('/path/to/invalid-tile.json');
      }).toThrow(/Failed to load tileset from/);
    });
  });
});