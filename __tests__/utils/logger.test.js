/**
 * @jest-environment node
 */
import logger, { LogLevel } from '../../src/utils/logger';

describe('logger', () => {
  describe('LogLevel', () => {
    it('has DEBUG, INFO, WARN, ERROR, NONE', () => {
      expect(LogLevel.DEBUG).toBe(0);
      expect(LogLevel.INFO).toBe(1);
      expect(LogLevel.WARN).toBe(2);
      expect(LogLevel.ERROR).toBe(3);
      expect(LogLevel.NONE).toBe(4);
    });
  });

  describe('logger instance', () => {
    it('has debug, info, warn, error methods', () => {
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
    });

    it('has setEnabled method', () => {
      expect(typeof logger.setEnabled).toBe('function');
    });

    it('calls do not throw', () => {
      expect(() => logger.debug('test')).not.toThrow();
      expect(() => logger.info('test')).not.toThrow();
      expect(() => logger.warn('test')).not.toThrow();
      expect(() => logger.error('test')).not.toThrow();
    });
  });
});
