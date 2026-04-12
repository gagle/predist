import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { PrepareDistContext, PrepareDistPlugin } from '../types';
import { stripDistPrefix } from '../strip-dist-prefix';

const NX_CONFIG_FILES = ['executors.json', 'generators.json'];
const SRC_PREFIX_PATTERN = /^\.\/src\//;

interface SchemaEntry {
  schema?: string;
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
    const config = JSON.parse(stripDistPrefix(raw, distName));
    const entries: Record<string, SchemaEntry> = config.executors || config.generators || {};

    for (const entry of Object.values(entries)) {
      transformSchemaEntry(entry, packageDir, distDir);
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
