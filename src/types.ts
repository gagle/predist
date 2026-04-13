export interface PrepareDistContext {
  readonly packageDir: string;
  readonly distDir: string;
  readonly distName: string;
}

export interface PrepareDistPlugin {
  readonly name: string;
  execute(context: PrepareDistContext): void;
}
