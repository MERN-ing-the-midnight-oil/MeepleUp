/**
 * @jest-environment node
 */
import { wordList1, wordList2, wordList3, wordlist } from '../../src/utils/wordlist';

describe('wordlist', () => {
  it('exports wordList1 as non-empty array', () => {
    expect(Array.isArray(wordList1)).toBe(true);
    expect(wordList1.length).toBeGreaterThan(0);
    expect(wordList1).toContain('clever');
  });

  it('exports wordList2 as non-empty array', () => {
    expect(Array.isArray(wordList2)).toBe(true);
    expect(wordList2.length).toBeGreaterThan(0);
    expect(wordList2).toContain('red');
  });

  it('exports wordList3 as non-empty array', () => {
    expect(Array.isArray(wordList3)).toBe(true);
    expect(wordList3.length).toBeGreaterThan(0);
    expect(wordList3).toContain('dragon');
  });

  it('wordlist is concatenation of all three lists', () => {
    expect(wordlist.length).toBe(wordList1.length + wordList2.length + wordList3.length);
    expect(wordlist).toContain('clever');
    expect(wordlist).toContain('red');
    expect(wordlist).toContain('dragon');
  });
});
