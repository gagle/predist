import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface VerifyTagOptions {
  readonly distDir: string;
  readonly tag: string;
}

export function verifyTag({ distDir, tag }: VerifyTagOptions): void {
  const version = tag.replace(/^.*v(?=\d)/, '');

  if (!/^\d+\.\d+\.\d+/.test(version)) {
    throw new Error(`Could not extract a valid version from tag "${tag}"`);
  }

  const pkg: { version: string } = JSON.parse(readFileSync(resolve(distDir, 'package.json'), 'utf-8'));

  if (pkg.version !== version) {
    throw new Error(
      `Tag version "${version}" (from "${tag}") does not match package.json version "${pkg.version}"`,
    );
  }
}
