import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { nxConfigPlugin } from './nx-config';

describe('nxConfigPlugin', () => {
  let tmpDir: string;
  let packageDir: string;
  let distDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'transform-nx-'));
    packageDir = tmpDir;
    distDir = join(tmpDir, 'dist');
    mkdirSync(distDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeConfig(name: string, content: Record<string, unknown>): void {
    writeFileSync(join(packageDir, name), JSON.stringify(content, null, 2));
  }

  function writeSchemaFile(relativePath: string): void {
    const fullPath = join(packageDir, relativePath);
    mkdirSync(join(fullPath, '..'), { recursive: true });
    writeFileSync(fullPath, JSON.stringify({ title: 'Test Schema' }));
  }

  function readDistConfig(name: string): Record<string, unknown> {
    return JSON.parse(readFileSync(join(distDir, name), 'utf-8'));
  }

  const plugin = nxConfigPlugin();

  describe('no Nx configs', () => {
    it('does nothing when no executor or generator files exist', () => {
      plugin.execute({ packageDir, distDir, distName: 'dist' });

      expect(existsSync(join(distDir, 'executors.json'))).toBe(false);
      expect(existsSync(join(distDir, 'generators.json'))).toBe(false);
    });
  });

  describe('executors.json', () => {
    it('strips dist prefix from implementation paths', () => {
      writeConfig('executors.json', {
        executors: {
          keys: { implementation: './dist/nx/executor', schema: '' },
        },
      });

      plugin.execute({ packageDir, distDir, distName: 'dist' });

      const result = readDistConfig('executors.json');
      expect((result.executors as Record<string, Record<string, string>>).keys.implementation).toBe('./nx/executor');
    });

    it('copies schema file and strips src/ prefix from path', () => {
      writeSchemaFile('src/nx/schema.json');
      writeConfig('executors.json', {
        executors: {
          keys: {
            implementation: './dist/nx/executor',
            schema: './src/nx/schema.json',
          },
        },
      });

      plugin.execute({ packageDir, distDir, distName: 'dist' });

      const result = readDistConfig('executors.json');
      expect((result.executors as Record<string, Record<string, string>>).keys.schema).toBe('./nx/schema.json');
      expect(existsSync(join(distDir, 'nx/schema.json'))).toBe(true);

      const copied = JSON.parse(readFileSync(join(distDir, 'nx/schema.json'), 'utf-8'));
      expect(copied.title).toBe('Test Schema');
    });

    it('handles multiple executors', () => {
      writeSchemaFile('src/nx/keys-schema.json');
      writeSchemaFile('src/nx/watch-schema.json');
      writeConfig('executors.json', {
        executors: {
          keys: {
            implementation: './dist/nx/keys-executor',
            schema: './src/nx/keys-schema.json',
          },
          watch: {
            implementation: './dist/nx/watch-executor',
            schema: './src/nx/watch-schema.json',
          },
        },
      });

      plugin.execute({ packageDir, distDir, distName: 'dist' });

      const result = readDistConfig('executors.json');
      const executors = result.executors as Record<string, Record<string, string>>;
      expect(executors.keys.schema).toBe('./nx/keys-schema.json');
      expect(executors.watch.schema).toBe('./nx/watch-schema.json');
      expect(existsSync(join(distDir, 'nx/keys-schema.json'))).toBe(true);
      expect(existsSync(join(distDir, 'nx/watch-schema.json'))).toBe(true);
    });
  });

  describe('generators.json', () => {
    it('transforms generator configs the same way', () => {
      writeSchemaFile('src/generators/init/schema.json');
      writeConfig('generators.json', {
        generators: {
          init: {
            implementation: './dist/generators/init/generator',
            schema: './src/generators/init/schema.json',
          },
        },
      });

      plugin.execute({ packageDir, distDir, distName: 'dist' });

      const result = readDistConfig('generators.json');
      const generators = result.generators as Record<string, Record<string, string>>;
      expect(generators.init.implementation).toBe('./generators/init/generator');
      expect(generators.init.schema).toBe('./generators/init/schema.json');
      expect(existsSync(join(distDir, 'generators/init/schema.json'))).toBe(true);
    });
  });

  describe('both configs', () => {
    it('transforms executors and generators when both exist', () => {
      writeConfig('executors.json', {
        executors: { run: { implementation: './dist/nx/run' } },
      });
      writeConfig('generators.json', {
        generators: { init: { implementation: './dist/nx/init' } },
      });

      plugin.execute({ packageDir, distDir, distName: 'dist' });

      expect(existsSync(join(distDir, 'executors.json'))).toBe(true);
      expect(existsSync(join(distDir, 'generators.json'))).toBe(true);
    });
  });

  describe('config without executors or generators key', () => {
    it('copies config with no entries to transform', () => {
      writeConfig('executors.json', { $schema: 'https://example.com' });

      plugin.execute({ packageDir, distDir, distName: 'dist' });

      const result = readDistConfig('executors.json');
      expect(result.$schema).toBe('https://example.com');
    });
  });

  describe('missing schema file', () => {
    it('logs a warning and skips copy when schema file does not exist', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      writeConfig('executors.json', {
        executors: {
          keys: {
            implementation: './dist/nx/executor',
            schema: './src/nx/missing.json',
          },
        },
      });

      plugin.execute({ packageDir, distDir, distName: 'dist' });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('missing.json'),
      );
      expect(existsSync(join(distDir, 'nx/missing.json'))).toBe(false);
    });
  });

  describe('entry without schema', () => {
    it('transforms implementation path without touching schema', () => {
      writeConfig('executors.json', {
        executors: {
          keys: { implementation: './dist/nx/executor' },
        },
      });

      plugin.execute({ packageDir, distDir, distName: 'dist' });

      const result = readDistConfig('executors.json');
      const executors = result.executors as Record<string, Record<string, string | undefined>>;
      expect(executors.keys.implementation).toBe('./nx/executor');
      expect(executors.keys.schema).toBeUndefined();
    });
  });

  describe('schema without src/ prefix', () => {
    it('copies schema file without path transformation', () => {
      writeSchemaFile('schemas/keys.json');
      writeConfig('executors.json', {
        executors: {
          keys: {
            implementation: './dist/nx/executor',
            schema: './schemas/keys.json',
          },
        },
      });

      plugin.execute({ packageDir, distDir, distName: 'dist' });

      const result = readDistConfig('executors.json');
      const executors = result.executors as Record<string, Record<string, string>>;
      expect(executors.keys.schema).toBe('./schemas/keys.json');
      expect(existsSync(join(distDir, 'schemas/keys.json'))).toBe(true);
    });
  });

  describe('output formatting', () => {
    it('writes JSON with 2-space indent and trailing newline', () => {
      writeConfig('executors.json', {
        executors: { keys: { implementation: './dist/nx/executor' } },
      });

      plugin.execute({ packageDir, distDir, distName: 'dist' });

      const raw = readFileSync(join(distDir, 'executors.json'), 'utf-8');
      expect(raw).toMatch(/^\{\n {2}/);
      expect(raw).toMatch(/\n$/);
    });
  });

  describe('plugin interface', () => {
    it('has the correct name', () => {
      expect(plugin.name).toBe('nx-config');
    });
  });
});
