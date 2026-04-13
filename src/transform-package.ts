import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PrepareDistContext } from './types';
import { stripDistPrefix } from './strip-dist-prefix';

interface PackageJson {
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
  files?: Array<string>;
  [key: string]: unknown;
}

export function transformPackage({ packageDir, distDir, distName }: PrepareDistContext): void {
  const raw = readFileSync(resolve(packageDir, 'package.json'), 'utf-8');
  const stripped = stripDistPrefix(raw, distName);
  const pkg: PackageJson = JSON.parse(stripped);

  delete pkg.scripts;
  delete pkg.devDependencies;
  delete pkg.files;

  writeFileSync(resolve(distDir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
}
