/**
 * @jest-environment node
 */
import theme, { getSpacing, getColor, commonStyles } from '../../src/utils/theme';

describe('theme', () => {
  describe('theme object', () => {
    it('has colors with meepleRed and feltGreen', () => {
      expect(theme.colors.meepleRed).toBe('#c0392b');
      expect(theme.colors.feltGreen).toBe('#3a5f3a');
    });

    it('has spacing object', () => {
      expect(theme.spacing.sm).toBe(8);
      expect(theme.spacing.lg).toBe(16);
    });

    it('has typography with fontSize and fontWeight', () => {
      expect(theme.typography.fontSize.base).toBe(16);
      expect(theme.typography.fontWeight.bold).toBe('700');
    });

    it('has borderRadius', () => {
      expect(theme.borderRadius.md).toBe(10);
    });
  });

  describe('getSpacing', () => {
    it('returns spacing value for valid key', () => {
      expect(getSpacing('sm')).toBe(8);
      expect(getSpacing('xl')).toBe(24);
    });

    it('returns default md when key missing', () => {
      expect(getSpacing('invalid')).toBe(theme.spacing.md);
    });
  });

  describe('getColor', () => {
    it('returns color for simple key', () => {
      expect(getColor('meepleRed')).toBe('#c0392b');
    });

    it('returns dot-notation color when category.key given', () => {
      const result = getColor('colors.meepleRed');
      expect(result).toBe('#c0392b');
    });

    it('returns input when color not found (passthrough)', () => {
      expect(getColor('unknown')).toBe('unknown');
    });
  });

  describe('commonStyles', () => {
    it('has button, card, input styles', () => {
      expect(commonStyles.button).toBeDefined();
      expect(commonStyles.card).toBeDefined();
      expect(commonStyles.input).toBeDefined();
    });

    it('button has padding and borderRadius', () => {
      expect(commonStyles.button.paddingVertical).toBe(theme.spacing.sm);
      expect(commonStyles.button.borderRadius).toBe(theme.borderRadius.md);
    });
  });
});
