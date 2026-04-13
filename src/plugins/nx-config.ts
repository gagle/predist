import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { PrepareDistContext, PrepareDistPlugin } from '../types';
import { stripDistPrefix } from '../strip-dist-prefix';

const NX_CONFIG_FILES = ['executors.json', 'generators.json'];
const NX_ENTRY_KEYS = ['executors', 'generators'] as const;
const SRC_PREFIX_PATTERN = /^\.\/src\//;

interface SchemaEntry {
  schema?: string;
  [key: string]: unknown;
}

interface NxConfig {
  executors?: Record<string, SchemaEntry>;
  generators?: Record<string, SchemaEntry>;
  [key: string]: unknown;
}

function transformSchemaEntry(entry: SchemaEntry, packageDir: string, distDir: string): void {
  if (!entry.schema) {
    return;
  }

  const sourceFile = resolve(packageDir, entry.schema);
  if (!existsSync(sourceFile)) {
    console.log(`::warning::Schema file "${entry.schema}" not found, skipping`);
    return;
  }

  const strippedPath = entry.schema.replace(SRC_PREFIX_PATTERN, './');
  const destFile = resolve(distDir, strippedPath);
  mkdirSync(dirname(destFile), { recursive: true });
  copyFileSync(sourceFile, destFile);
  entry.schema = strippedPath;
}

function transformNxConfigs({ packageDir, distDir, distName }: PrepareDistContext): void {
  for (const configName of NX_CONFIG_FILES) {
    const configPath = resolve(packageDir, configName);
    if (!existsSync(configPath)) {
      continue;
    }

    const raw = readFileSync(configPath, 'utf-8');
    const config: NxConfig = JSON.parse(stripDistPrefix(raw, distName));

    for (const key of NX_ENTRY_KEYS) {
      const entries = config[key];
      if (!entries) {
        continue;
      }
      for (const entry of Object.values(entries)) {
        transformSchemaEntry(entry, packageDir, distDir);
      }
    }

    writeFileSync(resolve(distDir, configName), JSON.stringify(config, null, 2) + '\n');
  }
}

export function nxConfigPlugin(): PrepareDistPlugin {
  return {
    name: 'nx-config',
    execute: transformNxConfigs,
  };
}
