import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PrepareDistContext, PrepareDistPlugin } from '../types';
import { stripDistPrefix } from '../strip-dist-prefix';

function transformCustomElementsManifest({ packageDir, distDir, distName }: PrepareDistContext): void {
  const source = resolve(packageDir, 'custom-elements.json');

  if (!existsSync(source)) {
    return;
  }

  const raw = readFileSync(source, 'utf-8');
  const stripped = stripDistPrefix(raw, distName);

  writeFileSync(resolve(distDir, 'custom-elements.json'), stripped);
}

export function customElementsManifestPlugin(): PrepareDistPlugin {
  return {
    name: 'custom-elements-manifest',
    execute: transformCustomElementsManifest,
  };
}
