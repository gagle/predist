import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  CliError,
  errorMessage,
  formatPrepareDistReportHuman,
  parseCliArgs,
  printUsage,
  runCli,
} from './cli';
import { EXIT } from './exit-codes';
import type { PrepareDistReport, RuntimeLogger } from './interfaces/cli.interface';

interface CapturingLogger extends RuntimeLogger {
  readonly logs: ReadonlyArray<string>;
  readonly errors: ReadonlyArray<string>;
}

function createLogger(): CapturingLogger {
  const logs: Array<string> = [];
  const errors: Array<string> = [];
  return {
    log: (m) => logs.push(m),
    error: (m) => errors.push(m),
    logs,
    errors,
  };
}

describe('CliError', () => {
  it('captures the exit code', () => {
    const err = new CliError('bad thing', EXIT.CONFIGURATION_ERROR);
    expect(err.exitCode).toBe(EXIT.CONFIGURATION_ERROR);
    expect(err.message).toBe('bad thing');
    expect(err.name).toBe('CliError');
  });
});

describe('errorMessage', () => {
  it('extracts the message from an Error instance', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
  });

  it('coerces a non-Error throw value to a string', () => {
    expect(errorMessage('plain string')).toBe('plain string');
    expect(errorMessage(42)).toBe('42');
    expect(errorMessage(null)).toBe('null');
  });
});

describe('parseCliArgs', () => {
  it('parses --path, --dist, --tag', () => {
    const result = parseCliArgs(['--path', 'pkg', '--dist', 'build', '--tag', 'v1.0.0']);
    expect(result.options.path).toBe('pkg');
    expect(result.options.dist).toBe('build');
    expect(result.options.tag).toBe('v1.0.0');
    expect(result.helpRequested).toBe(false);
  });

  it('parses --json as a boolean', () => {
    const result = parseCliArgs(['--json']);
    expect(result.options.json).toBe(true);
  });

  it('reports helpRequested when --help is passed', () => {
    const result = parseCliArgs(['--help']);
    expect(result.helpRequested).toBe(true);
  });

  it('defaults json to false when omitted', () => {
    const result = parseCliArgs([]);
    expect(result.options.json).toBe(false);
  });
});

describe('printUsage', () => {
  it('writes the prepare-dist banner', () => {
    const logger = createLogger();
    printUsage(logger);
    expect(logger.logs[0]).toContain('prepare-dist');
    expect(logger.logs[0]).toContain('--path');
  });
});

describe('formatPrepareDistReportHuman', () => {
  function sampleReport(): PrepareDistReport {
    return {
      schemaVersion: 1,
      source: { path: '/x', packageJsonHash: 'a'.repeat(64) },
      output: { distPath: '/x/dist', packageJsonHash: 'b'.repeat(64), sizeBytes: 123 },
      transforms: {
        strippedFields: ['scripts', 'devDependencies'],
        distPrefixStripped: 4,
        metadataCopied: ['README.md'],
        pluginsApplied: ['nx-config', 'custom-elements-manifest'],
      },
      versionVerification: null,
      durationMs: 42,
    };
  }

  it('renders all transform fields', () => {
    const text = formatPrepareDistReportHuman(sampleReport());
    expect(text).toContain('/x/dist');
    expect(text).toContain('123 bytes');
    expect(text).toContain('scripts, devDependencies');
    expect(text).toContain('4 reference');
    expect(text).toContain('README.md');
    expect(text).toContain('nx-config');
    expect(text).toContain('42ms');
  });

  it('renders "(none)" placeholders for empty arrays', () => {
    const empty: PrepareDistReport = {
      ...sampleReport(),
      transforms: {
        strippedFields: [],
        distPrefixStripped: 0,
        metadataCopied: [],
        pluginsApplied: [],
      },
    };
    const text = formatPrepareDistReportHuman(empty);
    expect(text.match(/\(none\)/g)?.length).toBe(3);
  });

  it('renders the tag-check line when versionVerification is set', () => {
    const verified: PrepareDistReport = {
      ...sampleReport(),
      versionVerification: {
        tag: 'v1.0.0',
        version: '1.0.0',
        packageVersion: '1.0.0',
        matches: true,
      },
    };
    expect(formatPrepareDistReportHuman(verified)).toContain('tag-check    ✓ tag=v1.0.0 pkg=1.0.0');
  });

  it('renders an ✗ marker when matches is false', () => {
    const verified: PrepareDistReport = {
      ...sampleReport(),
      versionVerification: {
        tag: 'v2.0.0',
        version: '2.0.0',
        packageVersion: '1.0.0',
        matches: false,
      },
    };
    expect(formatPrepareDistReportHuman(verified)).toContain('tag-check    ✗');
  });
});

describe('runCli', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'prepare-dist-cli-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeMinimalPackage(version = '1.0.0'): void {
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'sample', version, main: './dist/index.js' }, null, 2),
    );
    mkdirSync(join(tmpDir, 'dist'));
  }

  it('returns SUCCESS and prints help when --help is passed', async () => {
    const logger = createLogger();
    const code = await runCli(['--help'], logger);
    expect(code).toBe(EXIT.SUCCESS);
    expect(logger.logs[0]).toContain('prepare-dist');
  });

  it('returns CONFIGURATION_ERROR for unknown flags', async () => {
    const logger = createLogger();
    const code = await runCli(['--bogus'], logger);
    expect(code).toBe(EXIT.CONFIGURATION_ERROR);
    expect(logger.errors.some((e) => e.includes('Run with --help'))).toBe(true);
  });

  it('returns MISSING_INPUTS when dist directory is absent', async () => {
    writeFileSync(join(tmpDir, 'package.json'), '{"name":"x"}');
    const logger = createLogger();
    const code = await runCli(['--path', tmpDir], logger);
    expect(code).toBe(EXIT.MISSING_INPUTS);
    expect(logger.errors.some((e) => e.includes('Dist directory'))).toBe(true);
  });

  it('returns MISSING_INPUTS when package.json is absent', async () => {
    mkdirSync(join(tmpDir, 'dist'));
    const logger = createLogger();
    const code = await runCli(['--path', tmpDir], logger);
    expect(code).toBe(EXIT.MISSING_INPUTS);
    expect(logger.errors.some((e) => e.includes('No package.json'))).toBe(true);
  });

  it('returns SUCCESS and emits PrepareDistReport JSON when --json is set', async () => {
    writeMinimalPackage();
    const logger = createLogger();
    const code = await runCli(['--path', tmpDir, '--json'], logger);
    expect(code).toBe(EXIT.SUCCESS);
    const parsed: unknown = JSON.parse(logger.logs[0] ?? '');
    expect(parsed).toMatchObject({ schemaVersion: 1 });
  });

  it('returns SUCCESS and emits human format by default', async () => {
    writeMinimalPackage();
    const logger = createLogger();
    const code = await runCli(['--path', tmpDir], logger);
    expect(code).toBe(EXIT.SUCCESS);
    expect(logger.logs[0]).toContain('prepare-dist —');
  });

  it('returns TAG_MISMATCH when tag does not match package.json version', async () => {
    writeMinimalPackage('1.0.0');
    const logger = createLogger();
    const code = await runCli(['--path', tmpDir, '--tag', 'v2.0.0'], logger);
    expect(code).toBe(EXIT.TAG_MISMATCH);
    expect(logger.errors.some((e) => e.includes('does not match'))).toBe(true);
  });

  it('returns TAG_MISMATCH and emits JSON when --json + bad tag', async () => {
    writeMinimalPackage('1.0.0');
    const logger = createLogger();
    const code = await runCli(['--path', tmpDir, '--tag', 'v2.0.0', '--json'], logger);
    expect(code).toBe(EXIT.TAG_MISMATCH);
    const parsed: unknown = JSON.parse(logger.logs[0] ?? '');
    expect(parsed).toMatchObject({
      versionVerification: { matches: false, version: '2.0.0', packageVersion: '1.0.0' },
    });
  });

  it('returns TAG_MISMATCH when tag is malformed', async () => {
    writeMinimalPackage('1.0.0');
    const logger = createLogger();
    const code = await runCli(['--path', tmpDir, '--tag', 'main'], logger);
    expect(code).toBe(EXIT.TAG_MISMATCH);
    expect(logger.errors.some((e) => e.includes('Could not extract'))).toBe(true);
  });

  it('returns SUCCESS and includes versionVerification when tag matches', async () => {
    writeMinimalPackage('1.0.0');
    const logger = createLogger();
    const code = await runCli(['--path', tmpDir, '--tag', 'v1.0.0', '--json'], logger);
    expect(code).toBe(EXIT.SUCCESS);
    const parsed: { versionVerification: { matches: boolean } } = JSON.parse(logger.logs[0] ?? '');
    expect(parsed.versionVerification.matches).toBe(true);
  });

  it('renders the human tag-check line when --tag matches and --json is omitted', async () => {
    writeMinimalPackage('1.0.0');
    const logger = createLogger();
    const code = await runCli(['--path', tmpDir, '--tag', 'v1.0.0'], logger);
    expect(code).toBe(EXIT.SUCCESS);
    expect(logger.logs[0]).toContain('tag-check    ✓');
  });

  it('returns TRANSFORM_FAILURE when an unrecognised error escapes prepareDist', async () => {
    writeMinimalPackage();
    writeFileSync(join(tmpDir, 'package.json'), 'not-json');
    const logger = createLogger();
    const code = await runCli(['--path', tmpDir], logger);
    expect(code).toBe(EXIT.TRANSFORM_FAILURE);
  });
});
