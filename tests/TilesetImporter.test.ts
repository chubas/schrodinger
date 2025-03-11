import fs from 'fs';
import path from 'path';
import { TilesetImporter } from '../src/TilesetImporter';
import { TileDef } from '../src/TileDef';

// Mock fs and path modules
jest.mock('fs');
jest.mock('path');

describe('TilesetImporter', () => {
  // Reset mocks before each test
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('importFromFile', () => {
    it('should import a valid tileset from a JSON file', () => {
      // Mock file content
      const mockTileset = {
        tiles: [
          {
            name: 'grass',
            adjacencies: ['grass', 'grass', 'grass', 'grass']
          },
          {
            name: 'water',
            adjacencies: ['water', 'water', 'water', 'water'],
            weight: 2
          },
          {
            name: 'shore',
            adjacencies: ['grass', 'water', 'grass', 'water'],
            rotation: 90
          }
        ]
      };

      // Mock fs.readFileSync to return our mock tileset
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockTileset));

      // Call the importFromFile method
      const result = TilesetImporter.importFromFile('/path/to/tileset.json');

      // Verify fs.readFileSync was called with the correct arguments
      expect(fs.readFileSync).toHaveBeenCalledWith('/path/to/tileset.json', 'utf8');

      // Verify the result
      expect(result).toHaveLength(3);

      // Check the first tile
      expect(result[0].name).toBe('grass');
      expect(result[0].adjacencies).toHaveLength(4);
      expect(result[0].adjacencies.every(adj => typeof adj === 'string' || Array.isArray(adj))).toBe(true);

      // Check the second tile with weight
      expect(result[1].name).toBe('water');
      expect(result[1].weight).toBe(2);

      // Check the third tile with rotation
      expect(result[2].name).toBe('shore');
      expect(result[2].rotation).toBe(90);
    });

    it('should throw an error for invalid JSON', () => {
      // Mock fs.readFileSync to return invalid JSON
      (fs.readFileSync as jest.Mock).mockReturnValue('invalid json');

      // Expect the importFromFile method to throw an error
      expect(() => {
        TilesetImporter.importFromFile('/path/to/invalid.json');
      }).toThrow('Failed to import tileset: Unexpected token');
    });

    it('should throw an error for missing tiles array', () => {
      // Mock fs.readFileSync to return JSON without tiles array
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({ notTiles: [] }));

      // Expect the importFromFile method to throw an error
      expect(() => {
        TilesetImporter.importFromFile('/path/to/missing-tiles.json');
      }).toThrow('Invalid tileset format: missing or invalid tiles array');
    });

    it('should throw an error for invalid tile definition', () => {
      // Mock fs.readFileSync to return JSON with invalid tile definition
      const mockTileset = {
        tiles: [
          {
            // Missing name
            adjacencies: ['grass', 'grass', 'grass', 'grass']
          }
        ]
      };
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockTileset));

      // Expect the importFromFile method to throw an error
      expect(() => {
        TilesetImporter.importFromFile('/path/to/invalid-tile.json');
      }).toThrow('Invalid tile definition:');
    });
  });

  describe('importFromDirectory', () => {
    it('should import multiple tilesets from a directory', () => {
      // Mock directory contents
      const mockFiles = ['tileset1.json', 'tileset2.json', 'not-a-tileset.txt'];
      (fs.readdirSync as jest.Mock).mockReturnValue(mockFiles);

      // Mock path.join to return the expected file paths
      (path.join as jest.Mock).mockImplementation((dir, file) => `${dir}/${file}`);

      // Mock path.basename and path.extname
      (path.basename as jest.Mock).mockImplementation((file, ext) => {
        if (ext) return file.replace(ext, '');
        return file;
      });
      (path.extname as jest.Mock).mockReturnValue('.json');

      // Mock the importFromFile method
      const mockTileset1 = [{
        name: 'tile1',
        adjacencies: [],
        draw: () => {}
      } as TileDef];

      const mockTileset2 = [{
        name: 'tile2',
        adjacencies: [],
        draw: () => {}
      } as TileDef];

      // Create a spy on the importFromFile method
      const importFromFileSpy = jest.spyOn(TilesetImporter, 'importFromFile')
        .mockImplementation((filePath: string) => {
          if (filePath === '/path/to/tilesets/tileset1.json') {
            return mockTileset1;
          } else if (filePath === '/path/to/tilesets/tileset2.json') {
            return mockTileset2;
          }
          throw new Error('Unexpected file path');
        });

      // Call the importFromDirectory method
      const result = TilesetImporter.importFromDirectory('/path/to/tilesets');

      // Verify fs.readdirSync was called with the correct arguments
      expect(fs.readdirSync).toHaveBeenCalledWith('/path/to/tilesets');

      // Verify importFromFile was called for each JSON file
      expect(importFromFileSpy).toHaveBeenCalledTimes(2);
      expect(importFromFileSpy).toHaveBeenCalledWith('/path/to/tilesets/tileset1.json');
      expect(importFromFileSpy).toHaveBeenCalledWith('/path/to/tilesets/tileset2.json');

      // Verify the result
      expect(result).toEqual({
        tileset1: mockTileset1,
        tileset2: mockTileset2
      });

      // Clean up the spy
      importFromFileSpy.mockRestore();
    });

    it('should throw an error if no matching files are found', () => {
      // Mock empty directory
      (fs.readdirSync as jest.Mock).mockReturnValue([]);

      // Expect the importFromDirectory method to throw an error
      expect(() => {
        TilesetImporter.importFromDirectory('/path/to/empty');
      }).toThrow('No matching files found in directory: /path/to/empty');
    });
  });
});