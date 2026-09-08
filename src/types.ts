export interface PrepareDistContext {
  readonly packageDir: string;
  readonly distDir: string;
  readonly distName: string;
}

export interface PrepareDistPlugin {
  readonly name: string;
  /** Return `false` to signal the plugin found nothing to do; anything else (including `void`, for
   * backwards compat with existing custom plugins) counts as "applied" in the report. */
  execute(context: PrepareDistContext): boolean | void;
}
