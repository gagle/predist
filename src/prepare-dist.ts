import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PrepareDistReport } from './interfaces/cli.interface';
import type { PrepareDistPlugin } from './types';
import { transformPackage } from './transform-package';
import { copyMetadata } from './copy-metadata';
import { nxConfigPlugin } from './plugins/nx-config';
import { customElementsManifestPlugin } from './plugins/custom-elements-manifest';
import { externalFilesPlugin } from './plugins/external-files';
import { externalBinPlugin } from './plugins/external-bin';

const BUILT_IN_PLUGINS: ReadonlyArray<PrepareDistPlugin> = [
  nxConfigPlugin(),
  customElementsManifestPlugin(),
  externalFilesPlugin(),
  externalBinPlugin(),
];

export interface PrepareDistOptions {
  readonly path?: string;
  readonly dist?: string;
  readonly plugins?: ReadonlyArray<PrepareDistPlugin>;
}

export function prepareDist({
  path = '.',
  dist = 'dist',
  plugins = [],
}: PrepareDistOptions = {}): PrepareDistReport {
  const start = Date.now();
  const packageDir = resolve(path);
  const distDir = resolve(packageDir, dist);

  if (!existsSync(distDir)) {
    throw new Error(`Dist directory does not exist: ${distDir}`);
  }

  const sourcePackageJson = resolve(packageDir, 'package.json');
  if (!existsSync(sourcePackageJson)) {
    throw new Error(`No package.json found in: ${packageDir}`);
  }

  const sourcePackageJsonRaw = readFileSync(sourcePackageJson, 'utf-8');
  const sourcePackageJsonHash = createHash('sha256')
    .update(sourcePackageJsonRaw)
    .digest('hex');

  const transformResult = transformPackage({ packageDir, distDir, distName: dist });
  const metadataCopied = copyMetadata(process.cwd(), distDir);

  const pluginsApplied: Array<string> = [];
  for (const plugin of [...BUILT_IN_PLUGINS, ...plugins]) {
    const result = plugin.execute({ packageDir, distDir, distName: dist });
    if (result !== false) {
      pluginsApplied.push(plugin.name);
    }
  }

  return {
    schemaVersion: 1,
    source: { path: packageDir, packageJsonHash: sourcePackageJsonHash },
    output: {
      distPath: distDir,
      packageJsonHash: transformResult.outputPackageJsonHash,
      sizeBytes: transformResult.outputSizeBytes,
    },
    transforms: {
      strippedFields: transformResult.strippedFields,
      distPrefixStripped: transformResult.distPrefixStripped,
      metadataCopied,
      pluginsApplied,
    },
    versionVerification: null,
    durationMs: Date.now() - start,
  };
}
