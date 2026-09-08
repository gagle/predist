import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { PrepareDistContext, PrepareDistPlugin } from '../types';
import { stripDistPrefix } from '../strip-dist-prefix';

interface PackageJson {
  name?: string;
  bin?: string | Record<string, string>;
  [key: string]: unknown;
}

/**
 * `bin` may be a single string (package.json's shorthand for `{ [pkg.name]: value }`) or a map of
 * command name -> path. Either way we only care about the path values here.
 */
function binPaths(pkg: PackageJson): ReadonlyArray<string> {
  if (typeof pkg.bin === 'string') return [pkg.bin];
  if (pkg.bin && typeof pkg.bin === 'object') return Object.values(pkg.bin);
  return [];
}

/**
 * Copies `bin` scripts that live outside `distDir` (e.g. a `./bin/cli.js` shim importing
 * `../dist/cli.js`) into dist at the same relative path, rewriting their own dist-prefixed imports
 * the same way transformPackage rewrites package.json — so `"../dist/cli.js"` becomes `"../cli.js"`,
 * correct once distDir is published as the package root. A bin path already inside distDir (e.g.
 * `"./dist/cli.js"`) is left alone: the build already emitted it there.
 */
function copyExternalBinScripts({ packageDir, distDir, distName }: PrepareDistContext): boolean {
  const pkgPath = resolve(packageDir, 'package.json');
  if (!existsSync(pkgPath)) {
    return false;
  }

  const pkg: PackageJson = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  const distPrefix = `./${distName}/`;
  let applied = false;

  for (const binPath of binPaths(pkg)) {
    if (binPath.startsWith(distPrefix)) {
      continue;
    }

    const sourceFile = resolve(packageDir, binPath);
    if (!existsSync(sourceFile)) {
      console.log(`::warning::bin script "${binPath}" not found, skipping`);
      continue;
    }

    const raw = readFileSync(sourceFile, 'utf-8');
    const rewritten = stripDistPrefix(raw, distName);
    const destFile = resolve(distDir, binPath);
    mkdirSync(dirname(destFile), { recursive: true });
    writeFileSync(destFile, rewritten);
    chmodSync(destFile, 0o755);
    applied = true;
  }

  return applied;
}

export function externalBinPlugin(): PrepareDistPlugin {
  return {
    name: 'external-bin',
    execute: copyExternalBinScripts,
  };
}
