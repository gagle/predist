import { describe, it, expect } from 'vitest';
import { stripDistPrefix } from './strip-dist-prefix';

describe('stripDistPrefix', () => {
  describe('dotted prefix (./{dist}/)', () => {
    it('strips ./dist/ prefix', () => {
      expect(stripDistPrefix('"./dist/index.mjs"', 'dist')).toBe('"./index.mjs"');
    });

    it('strips multiple occurrences', () => {
      const input = '"./dist/index.mjs", "./dist/index.cjs"';
      expect(stripDistPrefix(input, 'dist')).toBe('"./index.mjs", "./index.cjs"');
    });
  });

  describe('bare prefix ({dist}/)', () => {
    it('strips bare dist/ prefix', () => {
      expect(stripDistPrefix('"dist/src/index.js"', 'dist')).toBe('"src/index.js"');
    });

    it('strips multiple occurrences', () => {
      const input = '"dist/a.js", "dist/b.js"';
      expect(stripDistPrefix(input, 'dist')).toBe('"a.js", "b.js"');
    });
  });

  describe('mixed prefixes', () => {
    it('strips both dotted and bare prefixes in the same text', () => {
      const input = '"./dist/index.mjs", "dist/types.d.ts"';
      expect(stripDistPrefix(input, 'dist')).toBe('"./index.mjs", "types.d.ts"');
    });
  });

  describe('custom dist name', () => {
    it('strips custom dist directory name', () => {
      expect(stripDistPrefix('"./build/index.js"', 'build')).toBe('"./index.js"');
    });

    it('strips bare custom prefix', () => {
      expect(stripDistPrefix('"build/src/index.js"', 'build')).toBe('"src/index.js"');
    });
  });

  describe('no match', () => {
    it('returns text unchanged when no prefix matches', () => {
      const input = '"./src/index.ts"';
      expect(stripDistPrefix(input, 'dist')).toBe(input);
    });

    it('does not strip partial matches', () => {
      const input = '"./distribution/index.js"';
      expect(stripDistPrefix(input, 'dist')).toBe(input);
    });
  });

  describe('nested paths', () => {
    it('preserves path structure after prefix', () => {
      expect(stripDistPrefix('"./dist/core/generate.js"', 'dist')).toBe('"./core/generate.js"');
    });

    it('handles deeply nested paths', () => {
      expect(stripDistPrefix('"./dist/a/b/c/d.js"', 'dist')).toBe('"./a/b/c/d.js"');
    });
  });
});
