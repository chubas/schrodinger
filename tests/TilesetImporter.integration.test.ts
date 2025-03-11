import path from 'path';
import { TilesetImporter } from '../src/TilesetImporter';

// These tests use the actual file system, not mocks
describe('TilesetImporter Integration Tests', () => {
  describe('importFromFile', () => {
    it('should import a tileset from a real JSON file', () => {
      // Get the absolute path to the fixture file
      const fixturePath = path.resolve(__dirname, 'fixtures/sample-tileset.json');

      // Import the tileset
      const tiles = TilesetImporter.importFromFile(fixturePath);

      // Verify the result
      expect(tiles).toHaveLength(4);

      // Check specific tiles
      expect(tiles[0].name).toBe('grass');
      expect(tiles[1].name).toBe('water');
      expect(tiles[1].weight).toBe(2);
      expect(tiles[2].name).toBe('shore');
      expect(tiles[2].rotation).toBe(90);
      expect(tiles[3].name).toBe('shore-corner');
      expect(tiles[3].reflection).toBe(1);

      // Verify adjacencies were parsed correctly
      expect(tiles[0].adjacencies).toHaveLength(4);
      expect(tiles[2].adjacencies).toHaveLength(4);

      // Verify each tile has a draw function
      tiles.forEach(tile => {
        expect(typeof tile.draw).toBe('function');
      });
    });

    it('should throw an error for a non-existent file', () => {
      const nonExistentPath = path.resolve(__dirname, 'fixtures/non-existent.json');

      expect(() => {
        TilesetImporter.importFromFile(nonExistentPath);
      }).toThrow(/no such file or directory/);
    });
  });

  describe('importFromDirectory', () => {
    it('should import tilesets from a directory', () => {
      // Get the absolute path to the fixtures directory
      const fixturesDir = path.resolve(__dirname, 'fixtures');

      // Import tilesets from the directory
      const tilesets = TilesetImporter.importFromDirectory(fixturesDir);

      // Verify we have the sample tileset
      expect(tilesets).toHaveProperty('sample-tileset');
      expect(tilesets['sample-tileset']).toHaveLength(4);
    });
  });
});