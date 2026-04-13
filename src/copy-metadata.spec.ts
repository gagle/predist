import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { copyMetadata } from './copy-metadata';

describe('copyMetadata', () => {
  let tmpDir: string;
  let distDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'copy-metadata-'));
    distDir = join(tmpDir, 'dist');
    mkdirSync(distDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('all files present', () => {
    it('copies README.md, LICENSE, CHANGELOG.md, SECURITY.md, and NOTICE', () => {
      writeFileSync(join(tmpDir, 'README.md'), '# My Package');
      writeFileSync(join(tmpDir, 'LICENSE'), 'MIT License');
      writeFileSync(join(tmpDir, 'CHANGELOG.md'), '## 1.0.0');
      writeFileSync(join(tmpDir, 'SECURITY.md'), '# Security Policy');
      writeFileSync(join(tmpDir, 'NOTICE'), 'Third-party notices');

      copyMetadata(tmpDir, distDir);

      expect(readFileSync(join(distDir, 'README.md'), 'utf-8')).toBe('# My Package');
      expect(readFileSync(join(distDir, 'LICENSE'), 'utf-8')).toBe('MIT License');
      expect(readFileSync(join(distDir, 'CHANGELOG.md'), 'utf-8')).toBe('## 1.0.0');
      expect(readFileSync(join(distDir, 'SECURITY.md'), 'utf-8')).toBe('# Security Policy');
      expect(readFileSync(join(distDir, 'NOTICE'), 'utf-8')).toBe('Third-party notices');
    });
  });

  describe('partial files', () => {
    it('copies only files that exist', () => {
      writeFileSync(join(tmpDir, 'README.md'), '# My Package');
      writeFileSync(join(tmpDir, 'LICENSE'), 'MIT License');

      copyMetadata(tmpDir, distDir);

      expect(existsSync(join(distDir, 'README.md'))).toBe(true);
      expect(existsSync(join(distDir, 'LICENSE'))).toBe(true);
      expect(existsSync(join(distDir, 'CHANGELOG.md'))).toBe(false);
    });
  });

  describe('no files present', () => {
    it('does nothing when no metadata files exist', () => {
      copyMetadata(tmpDir, distDir);

      expect(existsSync(join(distDir, 'README.md'))).toBe(false);
      expect(existsSync(join(distDir, 'LICENSE'))).toBe(false);
      expect(existsSync(join(distDir, 'CHANGELOG.md'))).toBe(false);
      expect(existsSync(join(distDir, 'SECURITY.md'))).toBe(false);
      expect(existsSync(join(distDir, 'NOTICE'))).toBe(false);
    });
  });
});
