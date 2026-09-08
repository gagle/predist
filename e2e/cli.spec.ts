import { describe, expect, it, beforeAll, beforeEach, afterEach } from 'vitest';
import { execSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const REPO_ROOT = resolve(__dirname, '..');
const BIN = join(REPO_ROOT, 'bin', 'prepare-dist.js');

interface CliResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

function runCli(args: ReadonlyArray<string>): CliResult {
  const result = spawnSync('node', [BIN, ...args], {
    encoding: 'utf-8',
    cwd: REPO_ROOT,
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    exitCode: result.status ?? -1,
  };
}

describe('CLI e2e', () => {
  beforeAll(() => {
    execSync('pnpm build', { cwd: REPO_ROOT, stdio: 'pipe' });
  });

  describe('--help', () => {
    it('prints usage and exits 0', () => {
      const result = runCli(['--help']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('prepare-dist');
    });
  });

  describe('unknown flag', () => {
    it('exits with CONFIGURATION_ERROR (10)', () => {
      const result = runCli(['--bogus-flag']);
      expect(result.exitCode).toBe(10);
    });
  });

  describe('--path with no dist directory', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), 'prepare-dist-e2e-'));
      writeFileSync(join(tmpDir, 'package.json'), '{"name":"x","version":"1.0.0"}');
    });

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it('exits with MISSING_INPUTS (30)', () => {
      const result = runCli(['--path', tmpDir]);
      expect(result.exitCode).toBe(30);
    });
  });

  describe('--tag mismatch', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), 'prepare-dist-e2e-'));
      writeFileSync(
        join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'sample', version: '1.0.0' }, null, 2),
      );
      mkdirSync(join(tmpDir, 'dist'));
    });

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it('exits with TAG_MISMATCH (40)', () => {
      const result = runCli(['--path', tmpDir, '--tag', 'v9.9.9']);
      expect(result.exitCode).toBe(40);
    });
  });

  describe('happy path with --json', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), 'prepare-dist-e2e-'));
      writeFileSync(
        join(tmpDir, 'package.json'),
        JSON.stringify(
          {
            name: 'sample',
            version: '1.0.0',
            main: './dist/index.js',
            scripts: { build: 'tsc' },
            devDependencies: { typescript: '*' },
          },
          null,
          2,
        ),
      );
      mkdirSync(join(tmpDir, 'dist'));
    });

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it('emits a PrepareDistReport with stripped fields', () => {
      const result = runCli(['--path', tmpDir, '--json']);
      expect(result.exitCode).toBe(0);
      const parsed: { transforms: { strippedFields: string[] } } = JSON.parse(result.stdout);
      expect(parsed.transforms.strippedFields).toEqual(
        expect.arrayContaining(['scripts', 'devDependencies']),
      );
    });
  });
});
