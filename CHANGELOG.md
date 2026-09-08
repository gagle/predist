# Changelog

## 1.2.0 — Adopt `@cli-capabilities/*` substrate

Internal refactor; **wire format unchanged**. The `CapabilitiesReport` types,
`buildCapabilitiesReport` helper, `parsePackageVersion`, and `readSelfVersion`
now come from the new
[`@cli-capabilities`](https://github.com/gagle/cli-capabilities) monorepo:

- `@cli-capabilities/protocol` — types, JSON Schema, runtime helpers.
- `@cli-capabilities/conventions` — `CORE_EXIT_CODES` shared across the ecosystem.
- `@cli-capabilities/tck` (devDep) — Test Compatibility Kit; `e2e/`
  now includes a TCK self-conformance check.

The `--capabilities --json` output is **byte-identical** to v1.0.0
(modulo the `version` field). A new `e2e/capabilities-wire-format.spec.ts`
snapshot test enforces this against a captured v1.0.0 fixture.

### Breaking

- `engines.node` raised from `>=20` to `>=22` for the JSON import-attribute
  syntax (`with { type: 'json' }`) used by the substrate.

### Internal

- `parsePackageVersion` is no longer re-exported from `src/capabilities.ts` — it
  was an internal helper. If you imported it directly, switch to
  `import { parsePackageVersion } from '@cli-capabilities/protocol'`.
- `CapabilitiesFlag.type` widens from `'boolean' | 'string'` to the protocol's
  `'boolean' | 'string' | 'string-array'`. No prepare-dist flags use the new
  variant; existing consumers reading the union see only the wider type.

## 1.0.0 (2026-04-16)


### Features

* initial commit ([f15d373](https://github.com/gagle/prepare-dist/commit/f15d37380b9e3da9becc32e739cab5d53572fb6e))
