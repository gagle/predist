# prepare-dist — CLI API Stability Commitment

This document describes the **public contract** of the `prepare-dist`
CLI introduced in v1.1.0. Downstream consumers (notably the
[solo-npm](https://github.com/gagle/solo-npm) marketplace plugin's
`/release` Phase E.0 pre-publish transform) pin to this surface and
rely on it to be stable across patch and minor releases.

The GitHub Action surface (`action.yml` inputs) and library exports
(`prepareDist`, `stripDistPrefix`) are also stable, with the same
backwards-compat guarantees.

---

## Stability levels

| Surface | Stability | Notes |
| --- | --- | --- |
| Exit codes (`EXIT.*` constants) | **Stable** | New codes may be added; existing codes never change meaning |
| `--json` schema (`PrepareDistReport`) | **Evolving additively** | `schemaVersion` bumps on additive changes |
| GitHub Action inputs (`path`, `dist`, `tag`) | **Stable** | New inputs may be added |
| Library exports (`prepareDist`, `stripDistPrefix`, types) | **Stable** | Direct ES module imports for in-process use |
| Human/text CLI output | **Best-effort** | Don't parse it. Use `--json`. |
| Plugin API (`PrepareDistPlugin`) | **Stable** | Plugins remain `(context) => void` |

**Stable** = backwards-compatible across the entire `1.x` line.

**Evolving additively** = the schema only adds new fields. Existing
fields keep their semantics. Consumers should use optional chaining
when reading new fields.

---

## CLI flag reference

| Flag | Type | Description |
| --- | --- | --- |
| `--path <dir>` | string | Package directory (default: `.`) |
| `--dist <name>` | string | Dist subdirectory name (default: `dist`) |
| `--tag <tag>` | string | Git tag to verify against `package.json#version`. Tag may be `v1.2.3` or `<component>-v1.2.3`. |
| `--json` | boolean | Emit a machine-readable `PrepareDistReport` instead of human text |
| `--help` | boolean | Show help message |

---

## Exit codes

`prepare-dist` uses structured exit codes to allow downstream
orchestrators to make deterministic recovery decisions without parsing
stderr.

| Code | Constant | Meaning |
| --- | --- | --- |
| `0` | `EXIT.SUCCESS` | command completed without errors |
| `1` | `EXIT.GENERIC_FAILURE` | catch-all (reserved) |
| `10` | `EXIT.CONFIGURATION_ERROR` | invalid/unknown CLI flags |
| `30` | `EXIT.MISSING_INPUTS` | dist/ directory or package.json not found |
| `40` | `EXIT.TAG_MISMATCH` | `--tag` did not match `package.json#version` |
| `50` | `EXIT.TRANSFORM_FAILURE` | a built-in or custom plugin threw, or the package.json could not be parsed |

Constants are exported from the `prepare-dist` package as `EXIT` and
can be imported in Node consumers:

```ts
import { EXIT, type ExitCode } from 'prepare-dist';
```

The exit-code numeric layout aligns with `npm-trust`'s scheme — the
same offsets (10, 30, 40, 50) carry roughly the same semantic class
(configuration error, missing input, validation failure, runtime
failure). solo-npm orchestration can branch on the same code ranges
across both tools.

---

## JSON schemas

All JSON output starts with `schemaVersion`. New fields are additive;
`schemaVersion` bumps when a field is added.

### `--json` → `PrepareDistReport`

```ts
interface PrepareDistReport {
  schemaVersion: 1;
  source: {
    path: string;             // resolved absolute path
    packageJsonHash: string;  // sha256 hex of input package.json
  };
  output: {
    distPath: string;         // resolved absolute path
    packageJsonHash: string;  // sha256 hex of output package.json
    sizeBytes: number;        // size of output package.json in bytes
  };
  transforms: {
    strippedFields: string[];        // e.g., ["scripts", "devDependencies"]
    distPrefixStripped: number;      // count of paths rewritten (./dist/foo → ./foo)
    metadataCopied: string[];        // ["README.md", "LICENSE"]
    pluginsApplied: string[];        // only plugins that actually changed something, e.g. ["external-bin"]
  };
  versionVerification: {
    tag: string;
    version: string;          // extracted from tag (e.g., v1.2.3 → 1.2.3)
    packageVersion: string;
    matches: boolean;
  } | null;                   // null when --tag was not passed
  durationMs: number;
}
```

---

## Library exports

Importable from the `prepare-dist` package:

```ts
import {
  // existing (stable)
  prepareDist,
  stripDistPrefix,
  // CLI integration
  runCli,
  parseCliArgs,
  formatPrepareDistReportHuman,
  CliError,
  // exit codes
  EXIT,
  // types
  type PrepareDistOptions,
  type PrepareDistContext,
  type PrepareDistPlugin,
  type PrepareDistReport,
  type ExitCode,
  type Logger,
  type RuntimeLogger,
} from 'prepare-dist';
```

---

## Migration notes — 1.1.0

- **`prepareDist()` return type changed** from `void` to
  `PrepareDistReport`. Callers ignoring the return are unaffected.
- **`verifyTag()` no longer throws on version mismatch.** It returns a
  `VerifyTagReport` with `matches: boolean`. It still throws for
  malformed tags (`VerifyTagError`). `verifyTag` was not exported from
  the package's main entry, so this is internal-only.
- **New CLI bin: `prepare-dist`**. Installable via `npm i -D prepare-dist`
  and runnable via `npx prepare-dist` or `pnpm exec prepare-dist`.
  GitHub Action usage is unchanged.
- **`docs/cli-api.md`** (this file) is the new stability contract.

---

## Future work

These items are not in the current major. They may land in a future
minor if there's clear consumer demand.

- **Plugin metadata in the report** — let plugins return a structured
  diff so the report can describe what each plugin actually changed.
- **`--quiet` / `--verbose`** — currently the human formatter has a
  fixed verbosity. A flag toggle would help in CI pipelines.
- **Multiple workspace packages** — currently `--path` targets a
  single package. A future flag could iterate over workspace
  packages and emit a single aggregated report.
- **`--dry-run`** — preview transforms without writing anything to
  the dist directory. Useful for solo-npm's `/release --dry-run`.
