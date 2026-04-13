import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { customElementsManifestPlugin } from './custom-elements-manifest';

describe('customElementsManifestPlugin', () => {
  let tmpDir: string;
  let packageDir: string;
  let distDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'custom-elements-'));
    packageDir = tmpDir;
    distDir = join(tmpDir, 'dist');
    mkdirSync(distDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  const plugin = customElementsManifestPlugin();

  describe('no custom-elements.json', () => {
    it('does nothing when file does not exist', () => {
      plugin.execute({ packageDir, distDir, distName: 'dist' });

      expect(existsSync(join(distDir, 'custom-elements.json'))).toBe(false);
    });
  });

  describe('strips dist prefix', () => {
    it('strips ./dist/ prefix from paths', () => {
      const manifest = {
        schemaVersion: '1.0.0',
        modules: [
          {
            kind: 'javascript-module',
            path: './dist/components/button.js',
          },
        ],
      };
      writeFileSync(join(packageDir, 'custom-elements.json'), JSON.stringify(manifest, null, 2));

      plugin.execute({ packageDir, distDir, distName: 'dist' });

      const result = JSON.parse(readFileSync(join(distDir, 'custom-elements.json'), 'utf-8'));
      expect(result.modules[0].path).toBe('./components/button.js');
    });

    it('strips bare dist/ prefix from paths', () => {
      const manifest = {
        modules: [{ path: 'dist/components/button.js' }],
      };
      writeFileSync(join(packageDir, 'custom-elements.json'), JSON.stringify(manifest));

      plugin.execute({ packageDir, distDir, distName: 'dist' });

      const result = JSON.parse(readFileSync(join(distDir, 'custom-elements.json'), 'utf-8'));
      expect(result.modules[0].path).toBe('components/button.js');
    });
  });

  describe('custom dist name', () => {
    it('strips custom dist directory name', () => {
      const manifest = {
        modules: [{ path: './build/components/button.js' }],
      };
      writeFileSync(join(packageDir, 'custom-elements.json'), JSON.stringify(manifest, null, 2));

      plugin.execute({ packageDir, distDir, distName: 'build' });

      const result = JSON.parse(readFileSync(join(distDir, 'custom-elements.json'), 'utf-8'));
      expect(result.modules[0].path).toBe('./components/button.js');
    });
  });

  describe('preserves content', () => {
    it('preserves paths without dist prefix', () => {
      const manifest = {
        schemaVersion: '1.0.0',
        modules: [{ path: './components/button.js' }],
      };
      writeFileSync(join(packageDir, 'custom-elements.json'), JSON.stringify(manifest, null, 2));

      plugin.execute({ packageDir, distDir, distName: 'dist' });

      const result = JSON.parse(readFileSync(join(distDir, 'custom-elements.json'), 'utf-8'));
      expect(result.modules[0].path).toBe('./components/button.js');
    });
  });

  describe('plugin interface', () => {
    it('has the correct name', () => {
      expect(plugin.name).toBe('custom-elements-manifest');
    });
  });
});
