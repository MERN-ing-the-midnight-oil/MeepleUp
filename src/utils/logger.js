/**
 * Centralized Logging Utility
 * 
 * Provides consistent logging across the application with:
 * - Log levels (DEBUG, INFO, WARN, ERROR)
 * - Environment-based filtering
 * - Optional remote error tracking integration
 * - Consistent formatting
 * 
 * Usage:
 *   import logger from '../utils/logger';
 *   logger.debug('Debug message');
 *   logger.info('Info message');
 *   logger.warn('Warning message');
 *   logger.error('Error message', error);
 */

import { Platform } from 'react-native';

/**
 * Log levels in order of severity
 */
export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4, // Disable all logging
};

/**
 * Get the current log level based on environment
 */
const getLogLevel = () => {
  // In development, show all logs
  if (__DEV__) {
    // Can be overridden by environment variable
    const envLevel = process.env.EXPO_PUBLIC_LOG_LEVEL || process.env.REACT_APP_LOG_LEVEL;
    if (envLevel) {
      const levelMap = {
        DEBUG: LogLevel.DEBUG,
        INFO: LogLevel.INFO,
        WARN: LogLevel.WARN,
        ERROR: LogLevel.ERROR,
        NONE: LogLevel.NONE,
      };
      return levelMap[envLevel.toUpperCase()] ?? LogLevel.DEBUG;
    }
    return LogLevel.DEBUG;
  }
  
  // In production, only show WARN and ERROR
  return LogLevel.WARN;
};

/**
 * Format log message with timestamp and context
 */
const formatMessage = (level, ...args) => {
  const timestamp = new Date().toISOString();
  const levelName = Object.keys(LogLevel).find(key => LogLevel[key] === level) || 'UNKNOWN';
  
  // Format: [TIMESTAMP] [LEVEL] message
  return [`[${timestamp}] [${levelName}]`, ...args];
};

/**
 * Check if logging is enabled for the given level
 */
const shouldLog = (level) => {
  const currentLevel = getLogLevel();
  return level >= currentLevel;
};

/**
 * Send error to remote tracking service (if configured)
 */
const sendToErrorTracking = (error, context = {}) => {
  // Integration with Sentry, LogRocket, etc.
  // This is a placeholder - integrate your error tracking service here
  
  // Example Sentry integration (uncomment when Sentry is installed):
  /*
  if (typeof window !== 'undefined' && window.Sentry) {
    if (error instanceof Error) {
      window.Sentry.captureException(error, {
        contexts: {
          custom: context,
        },
      });
    } else {
      window.Sentry.captureMessage(String(error), {
        level: 'error',
        contexts: {
          custom: context,
        },
      });
    }
  }
  */
  
  // Example LogRocket integration:
  /*
  if (typeof window !== 'undefined' && window.LogRocket) {
    window.LogRocket.captureException(error, {
      tags: context,
    });
  }
  */
};

/**
 * Logger class
 */
class Logger {
  constructor() {
    this.enabled = true;
    this.logLevel = getLogLevel();
  }

  /**
   * Enable or disable logging
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }

  /**
   * Set log level programmatically
   */
  setLogLevel(level) {
    this.logLevel = level;
  }

  /**
   * Debug level logging - detailed information for debugging
   * Only shown in development
   */
  debug(...args) {
    if (!this.enabled || !shouldLog(LogLevel.DEBUG)) {
      return;
    }
    console.log(...formatMessage(LogLevel.DEBUG, ...args));
  }

  /**
   * Info level logging - general informational messages
   * Shown in development, can be shown in production if configured
   */
  info(...args) {
    if (!this.enabled || !shouldLog(LogLevel.INFO)) {
      return;
    }
    console.info(...formatMessage(LogLevel.INFO, ...args));
  }

  /**
   * Warn level logging - warning messages
   * Shown in both development and production
   */
  warn(...args) {
    if (!this.enabled || !shouldLog(LogLevel.WARN)) {
      return;
    }
    console.warn(...formatMessage(LogLevel.WARN, ...args));
  }

  /**
   * Error level logging - error messages
   * Always shown and sent to error tracking service
   */
  error(...args) {
    if (!this.enabled || !shouldLog(LogLevel.ERROR)) {
      return;
    }
    
    const formatted = formatMessage(LogLevel.ERROR, ...args);
    console.error(...formatted);
    
    // Extract error object if present
    const errorObj = args.find(arg => arg instanceof Error);
    const errorMessage = args.find(arg => typeof arg === 'string');
    
    // Send to error tracking service
    if (errorObj || errorMessage) {
      sendToErrorTracking(
        errorObj || new Error(errorMessage || 'Unknown error'),
        {
          platform: Platform.OS,
          args: args.filter(arg => !(arg instanceof Error)),
        }
      );
    }
  }

  /**
   * Group related log messages
   * Useful for grouping related debug logs
   */
  group(label) {
    if (this.enabled && shouldLog(LogLevel.DEBUG)) {
      console.group(label);
    }
  }

  /**
   * End a log group
   */
  groupEnd() {
    if (this.enabled && shouldLog(LogLevel.DEBUG)) {
      console.groupEnd();
    }
  }

  /**
   * Log a table (useful for arrays/objects)
   */
  table(data) {
    if (this.enabled && shouldLog(LogLevel.DEBUG)) {
      console.table(data);
    }
  }

  /**
   * Time a block of code
   */
  time(label) {
    if (this.enabled && shouldLog(LogLevel.DEBUG)) {
      console.time(label);
    }
  }

  /**
   * End timing
   */
  timeEnd(label) {
    if (this.enabled && shouldLog(LogLevel.DEBUG)) {
      console.timeEnd(label);
    }
  }
}

// Export singleton instance
const logger = new Logger();

export default logger;

