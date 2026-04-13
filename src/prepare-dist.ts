import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PrepareDistPlugin } from './types';
import { transformPackage } from './transform-package';
import { copyMetadata } from './copy-metadata';
import { nxConfigPlugin } from './plugins/nx-config';
import { customElementsManifestPlugin } from './plugins/custom-elements-manifest';

const BUILT_IN_PLUGINS: ReadonlyArray<PrepareDistPlugin> = [
  nxConfigPlugin(),
  customElementsManifestPlugin(),
];

export interface PrepareDistOptions {
  readonly path?: string;
  readonly dist?: string;
  readonly plugins?: ReadonlyArray<PrepareDistPlugin>;
}

export function prepareDist({ path = '.', dist = 'dist', plugins = [] }: PrepareDistOptions = {}): void {
  const packageDir = resolve(path);
  const distDir = resolve(packageDir, dist);

  if (!existsSync(distDir)) {
    throw new Error(`Dist directory does not exist: ${distDir}`);
  }

  if (!existsSync(resolve(packageDir, 'package.json'))) {
    throw new Error(`No package.json found in: ${packageDir}`);
  }

  transformPackage({ packageDir, distDir, distName: dist });
  copyMetadata(process.cwd(), distDir);

  for (const plugin of [...BUILT_IN_PLUGINS, ...plugins]) {
    plugin.execute({ packageDir, distDir, distName: dist });
  }
}
