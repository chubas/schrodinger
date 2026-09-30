// The library extends Node's EventEmitter and its browser build leaves the
// "events" module external, so the examples provide it from EventEmitter.js.
// Load EventEmitter.js first, then this file, then dist/index.global.js.
window.events = { EventEmitter: window.EventEmitter };

window.require = function (moduleName) {
  if (moduleName === 'events') {
    return window.events;
  }
  throw new Error(`Module ${moduleName} not found`);
};
