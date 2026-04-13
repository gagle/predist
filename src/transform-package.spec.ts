import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { transformPackage } from './transform-package';

describe('transformPackage', () => {
  let tmpDir: string;
  let packageDir: string;
  let distDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'transform-package-'));
    packageDir = tmpDir;
    distDir = join(tmpDir, 'dist');
    mkdirSync(distDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeSourcePackage(pkg: Record<string, unknown>): void {
    writeFileSync(join(packageDir, 'package.json'), JSON.stringify(pkg, null, 2));
  }

  function readDistPackage(): Record<string, unknown> {
    return JSON.parse(readFileSync(join(distDir, 'package.json'), 'utf-8'));
  }

  describe('path stripping', () => {
    it('strips ./dist/ prefix from paths', () => {
      writeSourcePackage({
        name: 'my-pkg',
        main: './dist/index.js',
        types: './dist/index.d.ts',
      });

      transformPackage({ packageDir, distDir, distName: 'dist' });

      const result = readDistPackage();
      expect(result.main).toBe('./index.js');
      expect(result.types).toBe('./index.d.ts');
    });

    it('strips dist/ prefix from exports', () => {
      writeSourcePackage({
        name: 'my-pkg',
        exports: {
          '.': { types: './dist/index.d.ts', default: './dist/index.js' },
          './vite': { types: './dist/vite.d.ts', default: './dist/vite.js' },
        },
      });

      transformPackage({ packageDir, distDir, distName: 'dist' });

      const result = readDistPackage();
      expect((result.exports as Record<string, unknown>)['.']).toEqual({ types: './index.d.ts', default: './index.js' });
      expect((result.exports as Record<string, unknown>)['./vite']).toEqual({ types: './vite.d.ts', default: './vite.js' });
    });

    it('strips bin paths', () => {
      writeSourcePackage({
        name: 'my-pkg',
        bin: { 'my-cli': './dist/cli.js' },
      });

      transformPackage({ packageDir, distDir, distName: 'dist' });

      expect(readDistPackage().bin).toEqual({ 'my-cli': './cli.js' });
    });
  });

  describe('field deletion', () => {
    it('deletes scripts', () => {
      writeSourcePackage({
        name: 'my-pkg',
        scripts: { build: 'tsc', test: 'vitest' },
      });

      transformPackage({ packageDir, distDir, distName: 'dist' });

      expect(readDistPackage().scripts).toBeUndefined();
    });

    it('deletes devDependencies', () => {
      writeSourcePackage({
        name: 'my-pkg',
        devDependencies: { vitest: '^4.0.0' },
      });

      transformPackage({ packageDir, distDir, distName: 'dist' });

      expect(readDistPackage().devDependencies).toBeUndefined();
    });

    it('deletes files', () => {
      writeSourcePackage({
        name: 'my-pkg',
        files: ['dist', '!dist/**/*.map'],
      });

      transformPackage({ packageDir, distDir, distName: 'dist' });

      expect(readDistPackage().files).toBeUndefined();
    });
  });

  describe('preserved fields', () => {
    it('preserves name, version, dependencies, and other fields', () => {
      writeSourcePackage({
        name: 'my-pkg',
        version: '1.2.3',
        description: 'A package',
        dependencies: { lodash: '^4.0.0' },
        peerDependencies: { react: '>=18' },
      });

      transformPackage({ packageDir, distDir, distName: 'dist' });

      const result = readDistPackage();
      expect(result.name).toBe('my-pkg');
      expect(result.version).toBe('1.2.3');
      expect(result.description).toBe('A package');
      expect(result.dependencies).toEqual({ lodash: '^4.0.0' });
      expect(result.peerDependencies).toEqual({ react: '>=18' });
    });
  });

  describe('custom dist name', () => {
    it('strips custom dist directory name', () => {
      distDir = join(tmpDir, 'build');
      mkdirSync(distDir);
      writeSourcePackage({
        name: 'my-pkg',
        main: './build/index.js',
      });

      transformPackage({ packageDir, distDir, distName: 'build' });

      expect(readDistPackage().main).toBe('./index.js');
    });
  });

  describe('output formatting', () => {
    it('writes JSON with 2-space indent and trailing newline', () => {
      writeSourcePackage({ name: 'my-pkg' });

      transformPackage({ packageDir, distDir, distName: 'dist' });

      const raw = readFileSync(join(distDir, 'package.json'), 'utf-8');
      expect(raw).toMatch(/^\{\n {2}"name"/);
      expect(raw).toMatch(/\n$/);
    });
  });
});
