import { a as parseCliArgs, c as CliOptions, d as RuntimeLogger, f as TransformPackageReport, i as formatPrepareDistReportHuman, l as Logger, p as VerifyTagReport, s as runCli, t as CliError, u as PrepareDistReport } from "./cli.mjs";

//#region src/types.d.ts
interface PrepareDistContext {
  readonly packageDir: string;
  readonly distDir: string;
  readonly distName: string;
}
interface PrepareDistPlugin {
  readonly name: string;
  /** Return `false` to signal the plugin found nothing to do; anything else (including `void`, for
   * backwards compat with existing custom plugins) counts as "applied" in the report. */
  execute(context: PrepareDistContext): boolean | void;
}
//#endregion
//#region src/prepare-dist.d.ts
interface PrepareDistOptions {
  readonly path?: string;
  readonly dist?: string;
  readonly plugins?: ReadonlyArray<PrepareDistPlugin>;
}
declare function prepareDist({
  path,
  dist,
  plugins
}?: PrepareDistOptions): PrepareDistReport;
//#endregion
//#region src/strip-dist-prefix.d.ts
declare function stripDistPrefix(text: string, distName: string): string;
//#endregion
//#region src/exit-codes.d.ts
declare const EXIT: {
  readonly SUCCESS: 0;
  readonly GENERIC_FAILURE: 1;
  readonly CONFIGURATION_ERROR: 10;
  readonly MISSING_INPUTS: 30;
  readonly TAG_MISMATCH: 40;
  readonly TRANSFORM_FAILURE: 50;
};
type ExitCode = (typeof EXIT)[keyof typeof EXIT];
//#endregion
export { CliError, type CliOptions, EXIT, type ExitCode, type Logger, type PrepareDistContext, type PrepareDistOptions, type PrepareDistPlugin, type PrepareDistReport, type RuntimeLogger, type TransformPackageReport, type VerifyTagReport, formatPrepareDistReportHuman, parseCliArgs, prepareDist, runCli, stripDistPrefix };