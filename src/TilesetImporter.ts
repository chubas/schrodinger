import * as fs from 'fs';
import * as path from 'path';
import { TileDef, TileDefFactory, AdjacencyDefinition } from './TileDef.js';

/**
 * Interface for tileset definition files
 */
export interface TilesetDefinition {
  tiles: {
    name: string;
    adjacencies: AdjacencyDefinition;
    weight?: number;
    rotation?: number;
    reflection?: boolean;
    draw?: () => void;
  }[];
}

/**
 * Imports tileset definitions from JSON files
 */
export class TilesetImporter {
  /**
   * Loads a tileset from a JSON file
   * @param filepath Path to the JSON file
   * @returns Array of TileDef objects
   */
  static loadFromFile(filepath: string): TileDef[] {
    const fullPath = path.resolve(filepath);
    
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Tileset file not found: ${fullPath}`);
    }
    
    try {
      const tilesetStr = fs.readFileSync(fullPath, 'utf8');
      const tilesetDefinition = JSON.parse(tilesetStr) as TilesetDefinition;
      
      return tilesetDefinition.tiles.map(tileDef => {
        if (!tileDef.name) {
          throw new Error('Tile definition must have a name');
        }
        
        return TileDefFactory.defineTile(
          tileDef.name,
          tileDef.adjacencies,
          tileDef.draw ?? (() => {}),
          tileDef.weight,
          tileDef.rotation,
          tileDef.reflection
        );
      });
    } catch (e) {
      throw new Error(`Failed to load tileset from ${fullPath}: ${e}`);
    }
  }

  /**
   * Imports all tilesets from a directory
   * @param directoryPath Path to the directory containing tileset JSON files
   * @param filePattern Optional regex pattern to filter files
   * @returns Object mapping tileset names to arrays of TileDef objects
   */
  static importFromDirectory(directoryPath: string, filePattern = /\.json$/): Record<string, TileDef[]> {
    const fullPath = path.resolve(directoryPath);
    
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Directory not found: ${fullPath}`);
    }
    
    const files = fs.readdirSync(fullPath).filter(file => filePattern.test(file));
    
    if (files.length === 0) {
      throw new Error(`No matching files found in directory: ${fullPath}`);
    }
    
    const tilesets: Record<string, TileDef[]> = {};
    
    for (const file of files) {
      const filePath = path.join(fullPath, file);
      const tilesetName = path.basename(file, path.extname(file));
      
      try {
        tilesets[tilesetName] = this.loadFromFile(filePath);
      } catch (e) {
        console.warn(`Failed to import tileset from ${filePath}: ${e}`);
      }
    }
    
    return tilesets;
  }
}