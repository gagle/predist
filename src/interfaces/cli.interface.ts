export interface CliOptions {
  readonly path?: string;
  readonly dist?: string;
  readonly tag?: string;
  readonly json?: boolean;
}

export interface VerifyTagReport {
  readonly tag: string;
  readonly version: string;
  readonly packageVersion: string;
  readonly matches: boolean;
}

export interface TransformPackageReport {
  readonly strippedFields: ReadonlyArray<string>;
  readonly distPrefixStripped: number;
  readonly sourcePackageJsonHash: string;
  readonly outputPackageJsonHash: string;
  readonly outputSizeBytes: number;
}

export interface PrepareDistReport {
  readonly schemaVersion: 1;
  readonly source: {
    readonly path: string;
    readonly packageJsonHash: string;
  };
  readonly output: {
    readonly distPath: string;
    readonly packageJsonHash: string;
    readonly sizeBytes: number;
  };
  readonly transforms: {
    readonly strippedFields: ReadonlyArray<string>;
    readonly distPrefixStripped: number;
    readonly metadataCopied: ReadonlyArray<string>;
    readonly pluginsApplied: ReadonlyArray<string>;
  };
  readonly versionVerification: VerifyTagReport | null;
  readonly durationMs: number;
}

export interface Logger {
  readonly log: (message: string) => void;
}

export interface RuntimeLogger extends Logger {
  readonly error: (message: string) => void;
}
