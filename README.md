<p align="center">
  <h1 align="center">prepare-dist-action</h1>
  <p align="center">GitHub Action that prepares a <code>dist</code> directory for <code>npm publish</code></p>
</p>

---

## The Problem

Publishing an npm package from a `dist` directory requires tedious boilerplate:

- `package.json` paths still reference `dist/` (`"main": "./dist/index.js"`) but inside `dist/` they should be `"./index.js"`
- Dev-only fields (`scripts`, `devDependencies`, `files`) should be stripped
- Metadata files (`README.md`, `LICENSE`) live at the repo root but need to be in `dist/`
- Nx packages need `executors.json` / `generators.json` transformed and schema files copied

Every repo ends up with a custom `prepare-dist.mjs` script that does the same thing. When the pattern changes, every repo needs updating.

## The Solution

A single reusable action that handles all of it. Zero runtime dependencies — only Node.js built-ins.

```yaml
- uses: gagle/prepare-dist-action@v1
```

## Usage

### Root package

A standalone package where `package.json` is at the repo root.

```yaml
- run: pnpm run build

- uses: gagle/prepare-dist-action@v1
  with:
    tag: ${{ github.ref_name }}

- run: npm publish --provenance --access public
  working-directory: dist
```

### Workspace package

A package nested inside a monorepo (e.g. `packages/my-lib`).

```yaml
- run: pnpm exec nx run my-lib:build

- uses: gagle/prepare-dist-action@v1
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

### 1. Transforms `package.json`

Reads `package.json` from the package directory, writes a cleaned copy to `dist/`:

- **Strips dist prefix** — all `./dist/` and `dist/` occurrences in paths become `./` and `` respectively
- **Removes dev fields** — `scripts`, `devDependencies`, and `files` are deleted
- **Preserves everything else** — `name`, `version`, `dependencies`, `peerDependencies`, `exports`, `bin`, etc.

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

### 2. Handles Nx configs

Auto-detects `executors.json` and `generators.json` in the package directory:

- **Strips dist prefix** from `implementation` paths
- **Copies schema files** — resolves `./src/` prefixed schemas, copies them to `dist/` with the prefix stripped
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

### 3. Copies metadata

Copies `README.md`, `LICENSE`, and `CHANGELOG.md` from the repository root into `dist/`. Missing files are silently skipped.

### 4. Verifies tag (optional)

When the `tag` input is provided, verifies that the version extracted from the tag matches the `version` field in the dist `package.json`. Supports any tag format:

| Tag | Extracted version |
|-----|-------------------|
| `v1.0.0` | `1.0.0` |
| `my-lib-v2.3.1` | `2.3.1` |
| `v1.0.0-beta.1` | `1.0.0-beta.1` |

If the versions don't match, the action fails with a clear error message. This catches version mismatches between release-please tags and `package.json` before publishing to npm.
