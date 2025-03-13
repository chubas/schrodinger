#!/usr/bin/env node

/**
 * Script to build the Schrodinger WFC library for browser usage
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Building Schrodinger WFC library for browser usage...');

// Run the build command
try {
  execSync('npx tsup', { stdio: 'inherit' });
  console.log('Build completed successfully!');
} catch (error) {
  console.error('Build failed:', error);
  process.exit(1);
}

// Check if the browser build was created
const globalJsPath = path.join(__dirname, 'dist', 'browser-entry.global.js');
const targetPath = path.join(__dirname, 'dist', 'index.global.js');

if (fs.existsSync(globalJsPath)) {
  // Rename the file to index.global.js
  fs.renameSync(globalJsPath, targetPath);
  console.log(`Renamed ${globalJsPath} to ${targetPath}`);

  // Also rename the map file if it exists
  const mapPath = path.join(__dirname, 'dist', 'browser-entry.global.js.map');
  const targetMapPath = path.join(__dirname, 'dist', 'index.global.js.map');

  if (fs.existsSync(mapPath)) {
    fs.renameSync(mapPath, targetMapPath);
    console.log(`Renamed ${mapPath} to ${targetMapPath}`);
  }

  console.log('Browser build is ready to use!');
} else {
  console.error('Browser build was not created. Check the build output for errors.');
  process.exit(1);
}