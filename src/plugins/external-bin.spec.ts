import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { externalBinPlugin } from './external-bin';

describe('externalBinPlugin', () => {
  let tmpDir: string;
  let packageDir: string;
  let distDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'transform-external-bin-'));
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

  function writeBinFile(relativePath: string, content: string): void {
    const fullPath = join(packageDir, relativePath);
    mkdirSync(join(fullPath, '..'), { recursive: true });
    writeFileSync(fullPath, content);
  }

  const plugin = externalBinPlugin();

  describe('no package.json', () => {
    it('does nothing and returns false when package.json is missing', () => {
      const applied = plugin.execute({ packageDir, distDir, distName: 'dist' });

      expect(existsSync(join(distDir, 'bin'))).toBe(false);
      expect(applied).toBe(false);
    });
  });

  describe('no bin field', () => {
    it('does nothing and returns false when package.json has no bin field', () => {
      writePkg({ name: 'pkg' });

      const applied = plugin.execute({ packageDir, distDir, distName: 'dist' });

      expect(existsSync(join(distDir, 'bin'))).toBe(false);
      expect(applied).toBe(false);
    });
  });

  describe('string bin (shorthand)', () => {
    it('copies the external bin script, rewrites its dist-prefixed import, and returns true', () => {
      writePkg({ name: 'cc-daily-usage', bin: './bin/cc-daily-usage.js' });
      writeBinFile(
        'bin/cc-daily-usage.js',
        'import { runCli } from "../dist/cli.js";\nawait runCli(process.argv.slice(2));\n',
      );

      const applied = plugin.execute({ packageDir, distDir, distName: 'dist' });

      const destFile = join(distDir, 'bin/cc-daily-usage.js');
      expect(existsSync(destFile)).toBe(true);
      const content = readFileSync(destFile, 'utf-8');
      expect(content).toContain('from "../cli.js"');
      expect(content).not.toContain('../dist/');
      expect(applied).toBe(true);
    });

    it('makes the copied bin script executable', () => {
      writePkg({ name: 'pkg', bin: './bin/pkg.js' });
      writeBinFile('bin/pkg.js', '#!/usr/bin/env node\n');

      plugin.execute({ packageDir, distDir, distName: 'dist' });

      const mode = statSync(join(distDir, 'bin/pkg.js')).mode;
      expect(mode & 0o777).toBe(0o755);
    });
  });

  describe('object bin (multiple commands)', () => {
    it('copies every external bin entry', () => {
      writePkg({
        name: 'pkg',
        bin: { 'pkg-a': './bin/a.js', 'pkg-b': './bin/b.js' },
      });
      writeBinFile('bin/a.js', 'import "../dist/a-impl.js";\n');
      writeBinFile('bin/b.js', 'import "../dist/b-impl.js";\n');

      plugin.execute({ packageDir, distDir, distName: 'dist' });

      expect(readFileSync(join(distDir, 'bin/a.js'), 'utf-8')).toContain('"../a-impl.js"');
      expect(readFileSync(join(distDir, 'bin/b.js'), 'utf-8')).toContain('"../b-impl.js"');
    });
  });

  describe('bin already inside distDir', () => {
    it('skips it and returns false — the build already emitted it there', () => {
      writePkg({ name: 'pkg', bin: './dist/cli.js' });

      const applied = plugin.execute({ packageDir, distDir, distName: 'dist' });

      expect(existsSync(join(distDir, 'bin'))).toBe(false);
      expect(applied).toBe(false);
    });
  });

  describe('missing bin source file', () => {
    it('logs a warning, skips copy, and returns false when the bin script does not exist', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      writePkg({ name: 'pkg', bin: './bin/missing.js' });

      const applied = plugin.execute({ packageDir, distDir, distName: 'dist' });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('missing.js'));
      expect(existsSync(join(distDir, 'bin/missing.js'))).toBe(false);
      expect(applied).toBe(false);
    });
  });

  describe('plugin interface', () => {
    it('has the correct name', () => {
      expect(plugin.name).toBe('external-bin');
    });
  });
});
