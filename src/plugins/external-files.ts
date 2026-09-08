import { cpSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PrepareDistContext, PrepareDistPlugin } from '../types';

interface PackageJson {
  files?: Array<string>;
  bin?: string | Record<string, string>;
  [key: string]: unknown;
}

function binPaths(pkg: PackageJson): ReadonlyArray<string> {
  if (typeof pkg.bin === 'string') return [pkg.bin];
  if (pkg.bin && typeof pkg.bin === 'object') return Object.values(pkg.bin);
  return [];
}

/** "./bin/x.js" -> "bin"; "./x.js" -> "x.js" — the first path segment, ignoring a leading "./". */
function topSegment(relPath: string): string {
  // String#split on a non-empty separator always returns at least one element, even for "" — the
  // fallback exists only to satisfy noUncheckedIndexedAccess and is never actually reached.
  /* v8 ignore next */
  return relPath.replace(/^\.\//, '').split('/')[0] ?? relPath;
}

/**
 * Copies `files[]` entries that live outside `distDir` (e.g. a top-level `assets/` directory
 * resolved at runtime via `import.meta.url`, not referenced from package.json's `main`/`exports`/
 * `bin`) verbatim into dist at the same relative path — no content rewriting, unlike `external-bin`.
 * Skips the `distName` entry itself (that's the build output, already in place) and any entry whose
 * top segment matches a `bin` path's top segment, so it never clobbers external-bin's rewritten copy
 * with an unrewritten raw one.
 */
function copyExternalFiles({ packageDir, distDir, distName }: PrepareDistContext): boolean {
  const pkgPath = resolve(packageDir, 'package.json');
  if (!existsSync(pkgPath)) {
    return false;
  }

  const pkg: PackageJson = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  const files = Array.isArray(pkg.files) ? pkg.files : [];
  const binTopSegments = new Set(binPaths(pkg).map(topSegment));
  let applied = false;

  for (const entry of files) {
    if (entry === distName || binTopSegments.has(entry)) {
      continue;
    }

    const source = resolve(packageDir, entry);
    if (!existsSync(source)) {
      console.log(`::warning::files[] entry "${entry}" not found, skipping`);
      continue;
    }

    cpSync(source, resolve(distDir, entry), { recursive: true });
    applied = true;
  }

  return applied;
}

export function externalFilesPlugin(): PrepareDistPlugin {
  return {
    name: 'external-files',
    execute: copyExternalFiles,
  };
}
