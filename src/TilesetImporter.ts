import fs from 'fs';
import path from 'path';
import { TileDef, TileDefFactory } from './TileDef';

export interface TilesetDefinition {
  tiles: Array<{
    name: string;
    adjacencies: string[];
    weight?: number;
    rotation?: number;
    reflection?: number;
  }>;
}

export class TilesetImporter {
  /**
   * Imports a tileset from a JSON file
   * @param filePath - Absolute path to the JSON file
   * @returns Array of TileDef objects
   */
  static importFromFile(filePath: string): TileDef[] {
    try {
      // Read and parse the JSON file
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const tilesetDefinition = JSON.parse(fileContent) as TilesetDefinition;

      // Validate the tileset structure
      if (!tilesetDefinition.tiles || !Array.isArray(tilesetDefinition.tiles)) {
        throw new Error('Invalid tileset format: missing or invalid tiles array');
      }

      // Convert each tile definition to a TileDef object
      return tilesetDefinition.tiles.map(tileDef => {
        if (!tileDef.name || !tileDef.adjacencies || !Array.isArray(tileDef.adjacencies)) {
          throw new Error(`Invalid tile definition: ${JSON.stringify(tileDef)}`);
        }

        // Create a complete tile definition with all properties
        return {
          name: tileDef.name,
          adjacencies: tileDef.adjacencies,
          weight: tileDef.weight,
          rotation: tileDef.rotation,
          reflection: tileDef.reflection,
          draw: () => {} // Default empty draw function
        };
      });
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to import tileset: ${error.message}`);
      }
      throw error; // Re-throw the original error to preserve stack trace
    }
  }

  /**
   * Imports multiple tilesets from a directory
   * @param directoryPath - Absolute path to the directory containing JSON files
   * @param filePattern - Optional regex pattern to filter files (defaults to all .json files)
   * @returns Object mapping tileset names (filenames without extension) to arrays of TileDef objects
   */
  static importFromDirectory(directoryPath: string, filePattern = /\.json$/): Record<string, TileDef[]> {
    try {
      const files = fs.readdirSync(directoryPath)
        .filter(file => filePattern.test(file));

      if (files.length === 0) {
        throw new Error(`No matching files found in directory: ${directoryPath}`);
      }

      const tilesets: Record<string, TileDef[]> = {};

      for (const file of files) {
        const filePath = path.join(directoryPath, file);
        const tilesetName = path.basename(file, path.extname(file));
        tilesets[tilesetName] = this.importFromFile(filePath);
      }

      return tilesets;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to import tilesets from directory: ${error.message}`);
      }
      throw error; // Re-throw the original error to preserve stack trace
    }
  }
}