import { parseArgs } from 'node:util';
import { EXIT } from './exit-codes';
import { prepareDist } from './prepare-dist';
import { verifyTag } from './verify-tag';
import type {
  CliOptions,
  PrepareDistReport,
  RuntimeLogger,
} from './interfaces/cli.interface';

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class CliError extends Error {
  public readonly exitCode: number;

  constructor(message: string, exitCode: number) {
    super(message);
    this.name = 'CliError';
    this.exitCode = exitCode;
  }
}

export interface ParseCliArgsResult {
  readonly options: CliOptions;
  readonly helpRequested: boolean;
}

export function parseCliArgs(argv: ReadonlyArray<string>): ParseCliArgsResult {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      path: { type: 'string' },
      dist: { type: 'string' },
      tag: { type: 'string' },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
    allowPositionals: false,
    strict: true,
  });

  return {
    helpRequested: Boolean(values.help),
    options: {
      path: values.path,
      dist: values.dist,
      tag: values.tag,
      json: Boolean(values.json),
    },
  };
}

export function printUsage(logger: { log: (m: string) => void } = console): void {
  logger.log(`prepare-dist — Prepare a dist directory for npm publishing

Usage:
  prepare-dist [--path <dir>] [--dist <name>] [--tag <tag>] [--json]
  prepare-dist --help

Options:
  --path <dir>      package directory (default: ".")
  --dist <name>     dist subdirectory (default: "dist")
  --tag <tag>       git tag to verify against package.json#version
  --json            emit a machine-readable PrepareDistReport
  --help            show this help

When invoked from a GitHub Action, INPUT_PATH / INPUT_DIST / INPUT_TAG
environment variables are translated into the corresponding flags by
the action entry shim.`);
}

export async function runCli(
  argv: ReadonlyArray<string>,
  logger: RuntimeLogger = console,
): Promise<number> {
  let parsed: ParseCliArgsResult;
  try {
    parsed = parseCliArgs(argv);
  } catch (error) {
    const message = errorMessage(error);
    logger.error(`Error: ${message}`);
    logger.error('Run with --help for usage');
    return EXIT.CONFIGURATION_ERROR;
  }

  const { options, helpRequested } = parsed;

  if (helpRequested) {
    printUsage(logger);
    return EXIT.SUCCESS;
  }

  let report: PrepareDistReport;
  try {
    report = prepareDist({ path: options.path, dist: options.dist });
  } catch (error) {
    const message = errorMessage(error);
    if (message.includes('Dist directory does not exist') || message.includes('No package.json found')) {
      logger.error(`Error: ${message}`);
      return EXIT.MISSING_INPUTS;
    }
    logger.error(`Error: ${message}`);
    return EXIT.TRANSFORM_FAILURE;
  }

  if (typeof options.tag === 'string' && options.tag !== '') {
    try {
      const verification = verifyTag({ distDir: report.output.distPath, tag: options.tag });
      report = { ...report, versionVerification: verification };
      if (!verification.matches) {
        if (options.json) {
          logger.log(JSON.stringify(report, null, 2));
        } else {
          logger.error(
            `Error: tag version "${verification.version}" (from "${verification.tag}") does not match package.json version "${verification.packageVersion}"`,
          );
        }
        return EXIT.TAG_MISMATCH;
      }
    } catch (error) {
      const message = errorMessage(error);
      logger.error(`Error: ${message}`);
      return EXIT.TAG_MISMATCH;
    }
  }

  if (options.json) {
    logger.log(JSON.stringify(report, null, 2));
  } else {
    logger.log(formatPrepareDistReportHuman(report));
  }
  return EXIT.SUCCESS;
}

export function formatPrepareDistReportHuman(report: PrepareDistReport): string {
  const lines: Array<string> = [];
  lines.push(`prepare-dist — ${report.output.distPath}`);
  lines.push('');
  lines.push(
    `  source       ${report.source.path} (sha256:${report.source.packageJsonHash.slice(0, 12)}…)`,
  );
  lines.push(
    `  output       ${report.output.sizeBytes} bytes (sha256:${report.output.packageJsonHash.slice(0, 12)}…)`,
  );
  lines.push(`  stripped     ${report.transforms.strippedFields.join(', ') || '(none)'}`);
  lines.push(`  prefix-fixed ${report.transforms.distPrefixStripped} reference(s)`);
  lines.push(`  metadata     ${report.transforms.metadataCopied.join(', ') || '(none)'}`);
  lines.push(`  plugins      ${report.transforms.pluginsApplied.join(', ') || '(none)'}`);
  if (report.versionVerification !== null) {
    const v = report.versionVerification;
    lines.push(
      `  tag-check    ${v.matches ? '✓' : '✗'} tag=${v.tag} pkg=${v.packageVersion}`,
    );
  }
  lines.push(`  duration     ${report.durationMs}ms`);
  return lines.join('\n');
}
