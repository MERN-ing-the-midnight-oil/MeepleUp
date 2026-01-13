/**
 * In-App Logger for TestFlight Testing
 * 
 * Since console.log isn't accessible in TestFlight builds,
 * this provides an in-app logging system that displays logs in the UI.
 */

class InAppLogger {
  constructor() {
    this.logs = [];
    this.maxLogs = 100; // Keep last 100 logs
    this.listeners = new Set();
    this.enabled = true; // Can be toggled
  }

  /**
   * Subscribe to log updates
   */
  subscribe(callback) {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Notify all listeners of log updates
   */
  notify() {
    this.listeners.forEach(callback => {
      try {
        callback([...this.logs]);
      } catch (error) {
        console.error('[InAppLogger] Error in listener:', error);
      }
    });
  }

  /**
   * Add a log entry
   */
  log(level, message, data = null) {
    if (!this.enabled) return;

    const timestamp = new Date().toISOString();
    const logEntry = {
      id: `${timestamp}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp,
      level, // 'info', 'warn', 'error', 'debug'
      message,
      data,
      displayText: this.formatLog(level, message, data),
    };

    this.logs.push(logEntry);
    
    // Keep only last maxLogs entries
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Also log to console in dev mode
    if (__DEV__) {
      const consoleMethod = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
      console[consoleMethod](`[InAppLogger ${level.toUpperCase()}]`, message, data || '');
    }

    this.notify();
  }

  /**
   * Format log entry for display
   */
  formatLog(level, message, data) {
    const time = new Date().toLocaleTimeString();
    const levelEmoji = {
      info: 'ℹ️',
      warn: '⚠️',
      error: '❌',
      debug: '🔍',
    }[level] || '📝';

    let text = `[${time}] ${levelEmoji} ${message}`;
    
    if (data) {
      try {
        const dataStr = typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data);
        // Truncate very long data
        if (dataStr.length > 200) {
          text += `\n${dataStr.substring(0, 200)}...`;
        } else {
          text += `\n${dataStr}`;
        }
      } catch (e) {
        text += `\n[Data stringify error]`;
      }
    }

    return text;
  }

  /**
   * Convenience methods
   */
  info(message, data) {
    this.log('info', message, data);
  }

  warn(message, data) {
    this.log('warn', message, data);
  }

  error(message, data) {
    this.log('error', message, data);
  }

  debug(message, data) {
    this.log('debug', message, data);
  }

  /**
   * Clear all logs
   */
  clear() {
    this.logs = [];
    this.notify();
  }

  /**
   * Get all logs
   */
  getLogs() {
    return [...this.logs];
  }

  /**
   * Get logs filtered by level
   */
  getLogsByLevel(level) {
    return this.logs.filter(log => log.level === level);
  }

  /**
   * Enable/disable logging
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }

  /**
   * Export logs as text (for sharing/debugging)
   */
  exportLogs() {
    return this.logs.map(log => log.displayText).join('\n\n');
  }
}

// Create singleton instance
const logger = new InAppLogger();

export default logger;

