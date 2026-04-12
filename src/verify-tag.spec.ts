import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { verifyTag } from './verify-tag';

describe('verifyTag', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'verify-tag-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeDistPackage(version: string): void {
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ version }, null, 2));
  }

  describe('matching versions', () => {
    it('passes for a simple v-prefixed tag', () => {
      writeDistPackage('1.0.0');

      expect(() => verifyTag({ distDir: tmpDir, tag: 'v1.0.0' })).not.toThrow();
    });

    it('passes for a component-prefixed tag', () => {
      writeDistPackage('2.3.1');

      expect(() => verifyTag({ distDir: tmpDir, tag: 'i18n-keygen-v2.3.1' })).not.toThrow();
    });

    it('passes for a deeply prefixed tag', () => {
      writeDistPackage('0.1.0');

      expect(() => verifyTag({ distDir: tmpDir, tag: 'some-scope-v0.1.0' })).not.toThrow();
    });

    it('passes for a prerelease version', () => {
      writeDistPackage('1.0.0-beta.1');

      expect(() => verifyTag({ distDir: tmpDir, tag: 'v1.0.0-beta.1' })).not.toThrow();
    });
  });

  describe('mismatching versions', () => {
    it('throws when tag version differs from package version', () => {
      writeDistPackage('1.0.0');

      expect(() => verifyTag({ distDir: tmpDir, tag: 'v2.0.0' })).toThrow(
        'Tag version "2.0.0" (from "v2.0.0") does not match package.json version "1.0.0"',
      );
    });

    it('throws with component-prefixed tag on mismatch', () => {
      writeDistPackage('1.0.0');

      expect(() => verifyTag({ distDir: tmpDir, tag: 'my-lib-v3.0.0' })).toThrow(
        'does not match package.json version "1.0.0"',
      );
    });
  });

  describe('invalid tags', () => {
    it('throws for a tag with no version', () => {
      writeDistPackage('1.0.0');

      expect(() => verifyTag({ distDir: tmpDir, tag: 'main' })).toThrow(
        'Could not extract a valid version from tag "main"',
      );
    });

    it('throws for an empty tag', () => {
      writeDistPackage('1.0.0');

      expect(() => verifyTag({ distDir: tmpDir, tag: '' })).toThrow(
        'Could not extract a valid version from tag ""',
      );
    });
  });
});
