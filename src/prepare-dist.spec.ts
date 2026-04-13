import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { prepareDist } from './prepare-dist';
import { nxConfigPlugin } from './plugins/nx-config';

describe('prepareDist', () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'prepare-dist-'));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function setupRootPackage(): void {
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
      name: 'rfc-bcp47',
      version: '1.0.0',
      main: './dist/index.cjs',
      module: './dist/index.mjs',
      types: './dist/index.d.mts',
      exports: {
        '.': {
          import: { types: './dist/index.d.mts', default: './dist/index.mjs' },
          require: { types: './dist/index.d.cts', default: './dist/index.cjs' },
        },
      },
      files: ['dist'],
      scripts: { build: 'tsdown', test: 'vitest run' },
      devDependencies: { vitest: '^4.0.0', tsdown: '^0.21.0' },
    }, null, 2));
    mkdirSync(join(tmpDir, 'dist'));
    writeFileSync(join(tmpDir, 'README.md'), '# rfc-bcp47');
    writeFileSync(join(tmpDir, 'LICENSE'), 'MIT');
  }

  function setupWorkspacePackage(): string {
    const pkgDir = join(tmpDir, 'packages/i18n-keygen');
    const distDir = join(pkgDir, 'dist');
    mkdirSync(distDir, { recursive: true });
    mkdirSync(join(pkgDir, 'src/nx'), { recursive: true });

    writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({
      name: 'i18n-keygen',
      version: '2.0.0',
      main: 'dist/index.js',
      types: 'dist/index.d.ts',
      exports: {
        '.': { types: './dist/index.d.ts', default: './dist/index.js' },
        './vite': { types: './dist/vite.d.ts', default: './dist/vite.js' },
      },
      bin: { 'i18n-keygen': './dist/cli.js' },
      scripts: { build: 'tsc' },
      devDependencies: { typescript: '^6.0.0' },
      dependencies: { unplugin: '^3.0.0' },
    }, null, 2));

    writeFileSync(join(pkgDir, 'executors.json'), JSON.stringify({
      executors: {
        keys: {
          implementation: './dist/nx/executor',
          schema: './src/nx/schema.json',
        },
      },
    }, null, 2));

    writeFileSync(join(pkgDir, 'src/nx/schema.json'), JSON.stringify({
      title: 'Generate i18n Keys',
      type: 'object',
      properties: {},
    }, null, 2));

    writeFileSync(join(tmpDir, 'README.md'), '# i18n-keygen');
    writeFileSync(join(tmpDir, 'LICENSE'), 'MIT');

    return pkgDir;
  }

  describe('root package (rfc-bcp47 pattern)', () => {
    it('transforms package.json and copies metadata', () => {
      setupRootPackage();

      prepareDist();

      const pkg = JSON.parse(readFileSync(join(tmpDir, 'dist/package.json'), 'utf-8'));
      expect(pkg.main).toBe('./index.cjs');
      expect(pkg.module).toBe('./index.mjs');
      expect(pkg.types).toBe('./index.d.mts');
      expect(pkg.exports['.']).toEqual({
        import: { types: './index.d.mts', default: './index.mjs' },
        require: { types: './index.d.cts', default: './index.cjs' },
      });
      expect(pkg.scripts).toBeUndefined();
      expect(pkg.devDependencies).toBeUndefined();
      expect(pkg.files).toBeUndefined();
      expect(pkg.name).toBe('rfc-bcp47');
      expect(pkg.version).toBe('1.0.0');
    });

    it('copies README and LICENSE', () => {
      setupRootPackage();

      prepareDist();

      expect(readFileSync(join(tmpDir, 'dist/README.md'), 'utf-8')).toBe('# rfc-bcp47');
      expect(readFileSync(join(tmpDir, 'dist/LICENSE'), 'utf-8')).toBe('MIT');
    });
  });

  describe('workspace package (i18n-keygen pattern)', () => {
    it('transforms package.json paths', () => {
      const pkgDir = setupWorkspacePackage();

      prepareDist({ path: pkgDir, plugins: [nxConfigPlugin()] });

      const pkg = JSON.parse(readFileSync(join(pkgDir, 'dist/package.json'), 'utf-8'));
      expect(pkg.main).toBe('index.js');
      expect(pkg.types).toBe('index.d.ts');
      expect(pkg.exports['.']).toEqual({ types: './index.d.ts', default: './index.js' });
      expect(pkg.exports['./vite']).toEqual({ types: './vite.d.ts', default: './vite.js' });
      expect(pkg.bin).toEqual({ 'i18n-keygen': './cli.js' });
      expect(pkg.dependencies).toEqual({ unplugin: '^3.0.0' });
      expect(pkg.scripts).toBeUndefined();
      expect(pkg.devDependencies).toBeUndefined();
    });

    it('transforms executors.json and copies schema', () => {
      const pkgDir = setupWorkspacePackage();

      prepareDist({ path: pkgDir, plugins: [nxConfigPlugin()] });

      const executors = JSON.parse(readFileSync(join(pkgDir, 'dist/executors.json'), 'utf-8'));
      expect(executors.executors.keys.implementation).toBe('./nx/executor');
      expect(executors.executors.keys.schema).toBe('./nx/schema.json');
      expect(existsSync(join(pkgDir, 'dist/nx/schema.json'))).toBe(true);
    });

    it('copies metadata from repo root', () => {
      const pkgDir = setupWorkspacePackage();

      prepareDist({ path: pkgDir, plugins: [nxConfigPlugin()] });

      expect(readFileSync(join(pkgDir, 'dist/README.md'), 'utf-8')).toBe('# i18n-keygen');
      expect(readFileSync(join(pkgDir, 'dist/LICENSE'), 'utf-8')).toBe('MIT');
    });
  });

  describe('defaults', () => {
    it('uses current directory and dist/ when no options given', () => {
      setupRootPackage();

      prepareDist();

      expect(existsSync(join(tmpDir, 'dist/package.json'))).toBe(true);
    });
  });

  describe('custom dist name', () => {
    it('supports a custom dist directory name', () => {
      writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
        name: 'my-pkg',
        main: './build/index.js',
      }));
      mkdirSync(join(tmpDir, 'build'));

      prepareDist({ dist: 'build' });

      const pkg = JSON.parse(readFileSync(join(tmpDir, 'build/package.json'), 'utf-8'));
      expect(pkg.main).toBe('./index.js');
    });
  });

  describe('validation', () => {
    it('throws when dist directory does not exist', () => {
      writeFileSync(join(tmpDir, 'package.json'), '{}');

      expect(() => prepareDist()).toThrow('Dist directory does not exist');
    });

    it('throws when package.json does not exist', () => {
      mkdirSync(join(tmpDir, 'dist'));

      expect(() => prepareDist()).toThrow('No package.json found');
    });
  });
});
