export interface PrepareDistContext {
  packageDir: string;
  distDir: string;
  distName: string;
}

export interface PrepareDistPlugin {
  name: string;
  execute(context: PrepareDistContext): void;
}
