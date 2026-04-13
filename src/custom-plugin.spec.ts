import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { prepareDist } from './prepare-dist';
import type { PrepareDistPlugin, PrepareDistContext } from './types';

describe('custom plugins', () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = realpathSync(mkdtempSync(join(tmpdir(), 'custom-plugin-')));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
    mkdirSync(join(tmpDir, 'dist'));
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test-pkg', version: '1.0.0' }));
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('executes a custom plugin that writes a file to distDir', () => {
    function buildInfoPlugin(): PrepareDistPlugin {
      return {
        name: 'build-info',
        execute({ distDir }: PrepareDistContext): void {
          writeFileSync(join(distDir, 'build-info.json'), JSON.stringify({ builtAt: '2026-01-01' }));
        },
      };
    }

    prepareDist({ plugins: [buildInfoPlugin()] });

    const result = JSON.parse(readFileSync(join(tmpDir, 'dist/build-info.json'), 'utf-8'));
    expect(result.builtAt).toBe('2026-01-01');
  });

  it('passes correct context to custom plugins', () => {
    let capturedContext: PrepareDistContext | undefined;

    const spyPlugin: PrepareDistPlugin = {
      name: 'spy',
      execute(context: PrepareDistContext): void {
        capturedContext = context;
      },
    };

    prepareDist({ plugins: [spyPlugin] });

    expect(capturedContext).toBeDefined();
    expect(capturedContext!.packageDir).toBe(tmpDir);
    expect(capturedContext!.distDir).toBe(join(tmpDir, 'dist'));
    expect(capturedContext!.distName).toBe('dist');
  });

  it('executes multiple custom plugins in order', () => {
    const executionOrder: Array<string> = [];

    function orderedPlugin(name: string): PrepareDistPlugin {
      return {
        name,
        execute(): void {
          executionOrder.push(name);
        },
      };
    }

    prepareDist({ plugins: [orderedPlugin('first'), orderedPlugin('second'), orderedPlugin('third')] });

    expect(executionOrder).toEqual(['first', 'second', 'third']);
  });

  it('custom plugin can read the transformed package.json', () => {
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
      name: 'test-pkg',
      version: '2.0.0',
      main: './dist/index.js',
      scripts: { build: 'tsc' },
    }));

    let distPkgVersion: string | undefined;

    const readerPlugin: PrepareDistPlugin = {
      name: 'reader',
      execute({ distDir }: PrepareDistContext): void {
        const pkg = JSON.parse(readFileSync(join(distDir, 'package.json'), 'utf-8'));
        distPkgVersion = pkg.version;
      },
    };

    prepareDist({ plugins: [readerPlugin] });

    expect(distPkgVersion).toBe('2.0.0');
  });

  it('custom plugin receives custom dist name', () => {
    mkdirSync(join(tmpDir, 'build'));
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test-pkg', version: '1.0.0' }));

    let capturedDistName: string | undefined;

    const plugin: PrepareDistPlugin = {
      name: 'check-dist-name',
      execute({ distName }: PrepareDistContext): void {
        capturedDistName = distName;
      },
    };

    prepareDist({ dist: 'build', plugins: [plugin] });

    expect(capturedDistName).toBe('build');
  });
});
