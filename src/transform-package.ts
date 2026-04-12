import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stripDistPrefix } from './strip-dist-prefix';

export function transformPackage({ packageDir, distDir, distName }: { packageDir: string; distDir: string; distName: string }): void {
  const raw = readFileSync(resolve(packageDir, 'package.json'), 'utf-8');
  const stripped = stripDistPrefix(raw, distName);
  const pkg = JSON.parse(stripped);

  delete pkg.scripts;
  delete pkg.devDependencies;
  delete pkg.files;

  writeFileSync(resolve(distDir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
}
