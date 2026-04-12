import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PrepareDistPlugin } from './types';
import { transformPackage } from './transform-package';
import { copyMetadata } from './copy-metadata';

export function prepareDist({ path = '.', dist = 'dist', plugins = [] }: { path?: string; dist?: string; plugins?: Array<PrepareDistPlugin> } = {}): void {
  const packageDir = resolve(path);
  const distDir = resolve(packageDir, dist);

  if (!existsSync(distDir)) {
    throw new Error(`Dist directory does not exist: ${distDir}`);
  }

  if (!existsSync(resolve(packageDir, 'package.json'))) {
    throw new Error(`No package.json found in: ${packageDir}`);
  }

  transformPackage({ packageDir, distDir, distName: dist });
  copyMetadata(distDir);

  for (const plugin of plugins) {
    plugin.execute({ packageDir, distDir, distName: dist });
  }
}
