import { resolve } from 'node:path';
import { prepareDist } from './prepare-dist';
import { verifyTag } from './verify-tag';
import { nxConfigPlugin } from './plugins/nx-config';

const path = process.env.INPUT_PATH ?? '.';
const dist = process.env.INPUT_DIST ?? 'dist';
const tag = process.env.INPUT_TAG ?? '';

prepareDist({
  path,
  dist,
  plugins: [nxConfigPlugin()],
});

if (tag) {
  const distDir = resolve(path, dist);
  verifyTag({ distDir, tag });
}
