/**
 * A simple EventEmitter implementation for browser environments
 * This can be used as a drop-in replacement for the Node.js events module
 */
class EventEmitter {
  constructor() {
    this._events = {};
  }

  /**
   * Add a listener for the specified event
   * @param {string} event - The event name
   * @param {Function} listener - The callback function
   * @returns {EventEmitter} - Returns this for chaining
   */
  on(event, listener) {
    if (!this._events[event]) {
      this._events[event] = [];
    }
    this._events[event].push(listener);
    return this;
  }

  /**
   * Add a one-time listener for the specified event
   * @param {string} event - The event name
   * @param {Function} listener - The callback function
   * @returns {EventEmitter} - Returns this for chaining
   */
  once(event, listener) {
    const onceWrapper = (...args) => {
      this.off(event, onceWrapper);
      listener.apply(this, args);
    };
    onceWrapper.listener = listener;
    this.on(event, onceWrapper);
    return this;
  }

  /**
   * Remove a listener for the specified event
   * @param {string} event - The event name
   * @param {Function} listener - The callback function
   * @returns {EventEmitter} - Returns this for chaining
   */
  off(event, listener) {
    if (!this._events[event]) return this;

    const idx = this._events[event].findIndex(l =>
      l === listener || (l.listener && l.listener === listener)
    );

    if (idx !== -1) {
      this._events[event].splice(idx, 1);
    }

    return this;
  }

  /**
   * Remove all listeners, or those for the specified event
   * @param {string} [event] - The event name (optional)
   * @returns {EventEmitter} - Returns this for chaining
   */
  removeAllListeners(event) {
    if (event) {
      this._events[event] = [];
    } else {
      this._events = {};
    }
    return this;
  }

  /**
   * Emit an event with the provided arguments
   * @param {string} event - The event name
   * @param {...any} args - Arguments to pass to the listeners
   * @returns {boolean} - Returns true if the event had listeners, false otherwise
   */
  emit(event, ...args) {
    if (!this._events[event]) return false;

    const listeners = [...this._events[event]];
    for (const listener of listeners) {
      listener.apply(this, args);
    }

    return listeners.length > 0;
  }

  /**
   * Get the number of listeners for the specified event
   * @param {string} event - The event name
   * @returns {number} - The number of listeners
   */
  listenerCount(event) {
    return this._events[event] ? this._events[event].length : 0;
  }

  /**
   * Get the listeners for the specified event
   * @param {string} event - The event name
   * @returns {Function[]} - Array of listeners
   */
  listeners(event) {
    return this._events[event] ? [...this._events[event]] : [];
  }
}

// If we're in a browser environment, add to window
if (typeof window !== 'undefined') {
  window.EventEmitter = EventEmitter;

  // Create a mock events module for compatibility
  if (typeof window.events === 'undefined') {
    window.events = { EventEmitter };
  }
}

// Export for module environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EventEmitter };
}