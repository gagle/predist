<p align="center">
  <h1 align="center">prepare-dist</h1>
  <p align="center">GitHub Action that prepares a <code>dist</code> directory for <code>npm publish</code></p>
</p>

---

## The Problem

Publishing an npm package from a `dist` directory requires tedious boilerplate:

- `package.json` paths still reference `dist/` (`"main": "./dist/index.js"`) but inside `dist/` they should be `"./index.js"`
- Dev-only fields (`scripts`, `devDependencies`, `files`) should be stripped
- Metadata files (`README.md`, `LICENSE`, etc.) live at the repo root but need to be in `dist/`

Every repo ends up with a custom `prepare-dist.mjs` script that does the same thing. When the pattern changes, every repo needs updating.

## The Solution

A single reusable action that handles all of it. Zero runtime dependencies -- only Node.js built-ins.

```yaml
- uses: gagle/prepare-dist@v1
```

## Usage

### Root package

A standalone package where `package.json` is at the repo root.

```yaml
- run: pnpm run build

- uses: gagle/prepare-dist@v1
  with:
    tag: ${{ github.ref_name }}

- run: npm publish --provenance --access public
  working-directory: dist
```

### Workspace package

A package nested inside a monorepo (e.g. `packages/my-lib`).

```yaml
- run: pnpm exec nx run my-lib:build

- uses: gagle/prepare-dist@v1
  with:
    path: packages/my-lib
    tag: ${{ github.ref_name }}

- run: npm publish --provenance --access public
  working-directory: packages/my-lib/dist
```

## Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `path` | `.` | Package directory containing `package.json` |
| `dist` | `dist` | Name of the dist subdirectory |
| `tag` | | Git tag to verify against `package.json` version |

## What it does

### Transform `package.json`

Reads `package.json` from the package directory, writes a cleaned copy to `dist/`:

- **Strips dist prefix** -- `./dist/foo` becomes `./foo`, `dist/foo` becomes `foo`
- **Removes dev fields** -- `scripts`, `devDependencies`, and `files` are deleted
- **Preserves everything else** -- `name`, `version`, `dependencies`, `peerDependencies`, `exports`, `bin`, etc.

**Before** (source `package.json`):
```json
{
  "main": "./dist/index.js",
  "exports": {
    ".": { "default": "./dist/index.js" }
  },
  "scripts": { "build": "tsc" },
  "devDependencies": { "typescript": "^6.0.0" }
}
```

**After** (written to `dist/package.json`):
```json
{
  "main": "./index.js",
  "exports": {
    ".": { "default": "./index.js" }
  }
}
```

### Copy metadata files

Copies the following files from the repository root into `dist/`:

- `README.md`
- `LICENSE`
- `CHANGELOG.md`
- `SECURITY.md`
- `NOTICE`

Missing files are silently skipped.

### Verify tag (optional)

When the `tag` input is provided, verifies that the version extracted from the tag matches the `version` field in the dist `package.json`. Supports any tag format:

| Tag | Extracted version |
|-----|-------------------|
| `v1.0.0` | `1.0.0` |
| `my-lib-v2.3.1` | `2.3.1` |
| `v1.0.0-beta.1` | `1.0.0-beta.1` |

If the versions don't match, the action fails with a clear error message. This catches version mismatches between release-please tags and `package.json` before publishing to npm.

## Built-in plugins

The action ships with built-in plugins that auto-detect ecosystem-specific files and transform them for publishing. If the files don't exist, the plugin does nothing -- no configuration needed.

<details>
<summary><strong>Nx</strong></summary>

Auto-detects `executors.json` and `generators.json` in the package directory:

- **Strips dist prefix** from `implementation` paths
- **Copies schema files** from `./src/` to `dist/` with the prefix stripped
- **Writes transformed config** to `dist/`

**Before** (source `executors.json`):
```json
{
  "executors": {
    "keys": {
      "implementation": "./dist/nx/executor",
      "schema": "./src/nx/schema.json"
    }
  }
}
```

**After** (written to `dist/executors.json`):
```json
{
  "executors": {
    "keys": {
      "implementation": "./nx/executor",
      "schema": "./nx/schema.json"
    }
  }
}
```

The schema file at `src/nx/schema.json` is copied to `dist/nx/schema.json`.

</details>

<details>
<summary><strong>Custom Elements Manifest</strong></summary>

Auto-detects `custom-elements.json` in the package directory and strips dist prefixes from all paths. Used by web component libraries ([Lit](https://lit.dev/), [Stencil](https://stenciljs.com/), [Shoelace](https://shoelace.style/), etc.) that follow the [Custom Elements Manifest](https://github.com/webcomponents/custom-elements-manifest) standard.

</details>

## Custom plugins

For ecosystem-specific transforms not covered by the built-in plugins, use the programmatic API. Built-in plugins always run automatically -- `plugins` adds your custom ones on top.

```bash
npm install prepare-dist
```

A plugin implements the `PrepareDistPlugin` interface:

```ts
interface PrepareDistPlugin {
  readonly name: string;
  execute(context: PrepareDistContext): void;
}

interface PrepareDistContext {
  readonly packageDir: string;
  readonly distDir: string;
  readonly distName: string;
}
```

### Example

```ts
// scripts/prepare-dist.mjs
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { prepareDist } from 'prepare-dist';

function buildInfoPlugin() {
  return {
    name: 'build-info',
    execute({ distDir }) {
      writeFileSync(
        resolve(distDir, 'build-info.json'),
        JSON.stringify({ builtAt: new Date().toISOString() }),
      );
    },
  };
}

prepareDist({
  path: 'packages/my-lib',
  plugins: [buildInfoPlugin()],
});
```

```yaml
# In your workflow, use a run step instead of the action
- run: node scripts/prepare-dist.mjs
```

The `stripDistPrefix` utility is exported for convenience -- it replaces `./dist/` and `dist/` prefixes in text, the same transform applied to `package.json`.
