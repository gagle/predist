import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const METADATA_FILES = ['README.md', 'LICENSE', 'CHANGELOG.md', 'SECURITY.md'];

export function copyMetadata(packageDir: string, distDir: string): void {
  for (const file of METADATA_FILES) {
    const source = resolve(packageDir, file);
    if (existsSync(source)) {
      copyFileSync(source, resolve(distDir, file));
    }
  }
}
