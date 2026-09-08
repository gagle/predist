import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { externalFilesPlugin } from './external-files';

describe('externalFilesPlugin', () => {
  let tmpDir: string;
  let packageDir: string;
  let distDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'transform-external-files-'));
    packageDir = tmpDir;
    distDir = join(tmpDir, 'dist');
    mkdirSync(distDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function writePkg(content: Record<string, unknown>): void {
    writeFileSync(join(packageDir, 'package.json'), JSON.stringify(content, null, 2));
  }

  const plugin = externalFilesPlugin();

  describe('no package.json', () => {
    it('does nothing and returns false when package.json is missing', () => {
      const applied = plugin.execute({ packageDir, distDir, distName: 'dist' });

      expect(applied).toBe(false);
    });
  });

  describe('no files field', () => {
    it('does nothing and returns false when package.json has no files array', () => {
      writePkg({ name: 'pkg' });

      const applied = plugin.execute({ packageDir, distDir, distName: 'dist' });

      expect(applied).toBe(false);
    });
  });

  describe('directory entry', () => {
    it('copies a directory entry recursively and returns true', () => {
      mkdirSync(join(packageDir, 'assets'));
      writeFileSync(join(packageDir, 'assets', 'statusline.sh'), '#!/usr/bin/env bash\n');
      writePkg({ name: 'pkg', files: ['dist', 'assets'] });

      const applied = plugin.execute({ packageDir, distDir, distName: 'dist' });

      const copied = join(distDir, 'assets', 'statusline.sh');
      expect(existsSync(copied)).toBe(true);
      expect(readFileSync(copied, 'utf-8')).toBe('#!/usr/bin/env bash\n');
      expect(applied).toBe(true);
    });
  });

  describe('file entry', () => {
    it('copies a plain file entry and returns true', () => {
      writeFileSync(join(packageDir, 'NOTICE.txt'), 'hello\n');
      writePkg({ name: 'pkg', files: ['NOTICE.txt'] });

      const applied = plugin.execute({ packageDir, distDir, distName: 'dist' });

      expect(readFileSync(join(distDir, 'NOTICE.txt'), 'utf-8')).toBe('hello\n');
      expect(applied).toBe(true);
    });
  });

  describe('distName entry', () => {
    it('skips the distName entry itself and returns false when nothing else applies', () => {
      writePkg({ name: 'pkg', files: ['dist'] });

      const applied = plugin.execute({ packageDir, distDir, distName: 'dist' });

      expect(applied).toBe(false);
    });
  });

  describe('entry overlapping a bin path', () => {
    it('skips a files[] entry whose top segment matches a bin path (string bin)', () => {
      mkdirSync(join(packageDir, 'bin'));
      writeFileSync(join(packageDir, 'bin', 'cli.js'), 'unrewritten\n');
      writePkg({ name: 'pkg', bin: './bin/cli.js', files: ['dist', 'bin'] });

      const applied = plugin.execute({ packageDir, distDir, distName: 'dist' });

      expect(existsSync(join(distDir, 'bin'))).toBe(false);
      expect(applied).toBe(false);
    });

    it('skips a files[] entry whose top segment matches a bin path (object bin)', () => {
      mkdirSync(join(packageDir, 'bin'));
      writeFileSync(join(packageDir, 'bin', 'cli.js'), 'unrewritten\n');
      writePkg({ name: 'pkg', bin: { 'pkg-cli': './bin/cli.js' }, files: ['dist', 'bin'] });

      const applied = plugin.execute({ packageDir, distDir, distName: 'dist' });

      expect(existsSync(join(distDir, 'bin'))).toBe(false);
      expect(applied).toBe(false);
    });
  });

  describe('missing files[] entry', () => {
    it('logs a warning, skips it, and returns false when the entry does not exist', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      writePkg({ name: 'pkg', files: ['missing-dir'] });

      const applied = plugin.execute({ packageDir, distDir, distName: 'dist' });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('missing-dir'));
      expect(existsSync(join(distDir, 'missing-dir'))).toBe(false);
      expect(applied).toBe(false);
    });
  });

  describe('multiple entries', () => {
    it('copies every valid entry and skips the rest', () => {
      mkdirSync(join(packageDir, 'assets'));
      writeFileSync(join(packageDir, 'assets', 'a.txt'), 'a\n');
      writeFileSync(join(packageDir, 'README.md'), '# pkg\n');
      writePkg({ name: 'pkg', files: ['dist', 'assets', 'README.md', 'missing.txt'] });

      const applied = plugin.execute({ packageDir, distDir, distName: 'dist' });

      expect(existsSync(join(distDir, 'assets', 'a.txt'))).toBe(true);
      expect(existsSync(join(distDir, 'README.md'))).toBe(true);
      expect(existsSync(join(distDir, 'missing.txt'))).toBe(false);
      expect(applied).toBe(true);
    });
  });

  describe('plugin interface', () => {
    it('has the correct name', () => {
      expect(plugin.name).toBe('external-files');
    });
  });
});
