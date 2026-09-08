import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
//#region src/exit-codes.ts
const EXIT = {
	SUCCESS: 0,
	GENERIC_FAILURE: 1,
	CONFIGURATION_ERROR: 10,
	MISSING_INPUTS: 30,
	TAG_MISMATCH: 40,
	TRANSFORM_FAILURE: 50
};
//#endregion
//#region src/strip-dist-prefix.ts
function stripDistPrefix(text, distName) {
	return text.replaceAll(`./${distName}/`, "./").replaceAll(`"${distName}/`, "\"");
}
function stripDistPrefixWithCount(text, distName) {
	const dotPattern = `./${distName}/`;
	const quotePattern = `"${distName}/`;
	const dotCount = countOccurrences(text, dotPattern);
	const quoteCount = countOccurrences(text, quotePattern);
	return {
		text: text.replaceAll(dotPattern, "./").replaceAll(quotePattern, "\""),
		replacedCount: dotCount + quoteCount
	};
}
function countOccurrences(haystack, needle) {
	let count = 0;
	let position = 0;
	while ((position = haystack.indexOf(needle, position)) !== -1) {
		count++;
		position += needle.length;
	}
	return count;
}
//#endregion
//#region src/transform-package.ts
const REMOVABLE_FIELDS = [
	"scripts",
	"devDependencies",
	"files"
];
function transformPackage({ packageDir, distDir, distName }) {
	const raw = readFileSync(resolve(packageDir, "package.json"), "utf-8");
	const sourcePackageJsonHash = sha256(raw);
	const { text: stripped, replacedCount } = stripDistPrefixWithCount(raw, distName);
	const pkg = JSON.parse(stripped);
	const strippedFields = [];
	for (const field of REMOVABLE_FIELDS) if (field in pkg) {
		strippedFields.push(field);
		delete pkg[field];
	}
	const output = JSON.stringify(pkg, null, 2) + "\n";
	writeFileSync(resolve(distDir, "package.json"), output);
	return {
		strippedFields,
		distPrefixStripped: replacedCount,
		sourcePackageJsonHash,
		outputPackageJsonHash: sha256(output),
		outputSizeBytes: Buffer.byteLength(output, "utf-8")
	};
}
function sha256(content) {
	return createHash("sha256").update(content).digest("hex");
}
//#endregion
//#region src/copy-metadata.ts
const METADATA_FILES = [
	"README.md",
	"LICENSE",
	"CHANGELOG.md",
	"SECURITY.md",
	"NOTICE"
];
function copyMetadata(packageDir, distDir) {
	const copied = [];
	for (const file of METADATA_FILES) {
		const source = resolve(packageDir, file);
		if (existsSync(source)) {
			copyFileSync(source, resolve(distDir, file));
			copied.push(file);
		}
	}
	return copied;
}
//#endregion
//#region src/plugins/nx-config.ts
const NX_CONFIG_FILES = ["executors.json", "generators.json"];
const NX_ENTRY_KEYS = ["executors", "generators"];
const SRC_PREFIX_PATTERN = /^\.\/src\//;
function transformSchemaEntry(entry, packageDir, distDir) {
	if (!entry.schema) return;
	const sourceFile = resolve(packageDir, entry.schema);
	if (!existsSync(sourceFile)) {
		console.log(`::warning::Schema file "${entry.schema}" not found, skipping`);
		return;
	}
	const strippedPath = entry.schema.replace(SRC_PREFIX_PATTERN, "./");
	const destFile = resolve(distDir, strippedPath);
	mkdirSync(dirname(destFile), { recursive: true });
	copyFileSync(sourceFile, destFile);
	entry.schema = strippedPath;
}
function transformNxConfigs({ packageDir, distDir, distName }) {
	let applied = false;
	for (const configName of NX_CONFIG_FILES) {
		const configPath = resolve(packageDir, configName);
		if (!existsSync(configPath)) continue;
		const raw = readFileSync(configPath, "utf-8");
		const config = JSON.parse(stripDistPrefix(raw, distName));
		for (const key of NX_ENTRY_KEYS) {
			const entries = config[key];
			if (!entries) continue;
			for (const entry of Object.values(entries)) transformSchemaEntry(entry, packageDir, distDir);
		}
		writeFileSync(resolve(distDir, configName), JSON.stringify(config, null, 2) + "\n");
		applied = true;
	}
	return applied;
}
function nxConfigPlugin() {
	return {
		name: "nx-config",
		execute: transformNxConfigs
	};
}
//#endregion
//#region src/plugins/custom-elements-manifest.ts
function transformCustomElementsManifest({ packageDir, distDir, distName }) {
	const source = resolve(packageDir, "custom-elements.json");
	if (!existsSync(source)) return false;
	const stripped = stripDistPrefix(readFileSync(source, "utf-8"), distName);
	writeFileSync(resolve(distDir, "custom-elements.json"), stripped);
	return true;
}
function customElementsManifestPlugin() {
	return {
		name: "custom-elements-manifest",
		execute: transformCustomElementsManifest
	};
}
//#endregion
//#region src/plugins/external-files.ts
function binPaths$1(pkg) {
	if (typeof pkg.bin === "string") return [pkg.bin];
	if (pkg.bin && typeof pkg.bin === "object") return Object.values(pkg.bin);
	return [];
}
/** "./bin/x.js" -> "bin"; "./x.js" -> "x.js" — the first path segment, ignoring a leading "./". */
function topSegment(relPath) {
	/* v8 ignore next */
	return relPath.replace(/^\.\//, "").split("/")[0] ?? relPath;
}
/**
* Copies `files[]` entries that live outside `distDir` (e.g. a top-level `assets/` directory
* resolved at runtime via `import.meta.url`, not referenced from package.json's `main`/`exports`/
* `bin`) verbatim into dist at the same relative path — no content rewriting, unlike `external-bin`.
* Skips the `distName` entry itself (that's the build output, already in place) and any entry whose
* top segment matches a `bin` path's top segment, so it never clobbers external-bin's rewritten copy
* with an unrewritten raw one.
*/
function copyExternalFiles({ packageDir, distDir, distName }) {
	const pkgPath = resolve(packageDir, "package.json");
	if (!existsSync(pkgPath)) return false;
	const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
	const files = Array.isArray(pkg.files) ? pkg.files : [];
	const binTopSegments = new Set(binPaths$1(pkg).map(topSegment));
	let applied = false;
	for (const entry of files) {
		if (entry === distName || binTopSegments.has(entry)) continue;
		const source = resolve(packageDir, entry);
		if (!existsSync(source)) {
			console.log(`::warning::files[] entry "${entry}" not found, skipping`);
			continue;
		}
		cpSync(source, resolve(distDir, entry), { recursive: true });
		applied = true;
	}
	return applied;
}
function externalFilesPlugin() {
	return {
		name: "external-files",
		execute: copyExternalFiles
	};
}
//#endregion
//#region src/plugins/external-bin.ts
/**
* `bin` may be a single string (package.json's shorthand for `{ [pkg.name]: value }`) or a map of
* command name -> path. Either way we only care about the path values here.
*/
function binPaths(pkg) {
	if (typeof pkg.bin === "string") return [pkg.bin];
	if (pkg.bin && typeof pkg.bin === "object") return Object.values(pkg.bin);
	return [];
}
/**
* Copies `bin` scripts that live outside `distDir` (e.g. a `./bin/cli.js` shim importing
* `../dist/cli.js`) into dist at the same relative path, rewriting their own dist-prefixed imports
* the same way transformPackage rewrites package.json — so `"../dist/cli.js"` becomes `"../cli.js"`,
* correct once distDir is published as the package root. A bin path already inside distDir (e.g.
* `"./dist/cli.js"`) is left alone: the build already emitted it there.
*/
function copyExternalBinScripts({ packageDir, distDir, distName }) {
	const pkgPath = resolve(packageDir, "package.json");
	if (!existsSync(pkgPath)) return false;
	const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
	const distPrefix = `./${distName}/`;
	let applied = false;
	for (const binPath of binPaths(pkg)) {
		if (binPath.startsWith(distPrefix)) continue;
		const sourceFile = resolve(packageDir, binPath);
		if (!existsSync(sourceFile)) {
			console.log(`::warning::bin script "${binPath}" not found, skipping`);
			continue;
		}
		const rewritten = stripDistPrefix(readFileSync(sourceFile, "utf-8"), distName);
		const destFile = resolve(distDir, binPath);
		mkdirSync(dirname(destFile), { recursive: true });
		writeFileSync(destFile, rewritten);
		chmodSync(destFile, 493);
		applied = true;
	}
	return applied;
}
function externalBinPlugin() {
	return {
		name: "external-bin",
		execute: copyExternalBinScripts
	};
}
//#endregion
//#region src/prepare-dist.ts
const BUILT_IN_PLUGINS = [
	nxConfigPlugin(),
	customElementsManifestPlugin(),
	externalFilesPlugin(),
	externalBinPlugin()
];
function prepareDist({ path = ".", dist = "dist", plugins = [] } = {}) {
	const start = Date.now();
	const packageDir = resolve(path);
	const distDir = resolve(packageDir, dist);
	if (!existsSync(distDir)) throw new Error(`Dist directory does not exist: ${distDir}`);
	const sourcePackageJson = resolve(packageDir, "package.json");
	if (!existsSync(sourcePackageJson)) throw new Error(`No package.json found in: ${packageDir}`);
	const sourcePackageJsonRaw = readFileSync(sourcePackageJson, "utf-8");
	const sourcePackageJsonHash = createHash("sha256").update(sourcePackageJsonRaw).digest("hex");
	const transformResult = transformPackage({
		packageDir,
		distDir,
		distName: dist
	});
	const metadataCopied = copyMetadata(process.cwd(), distDir);
	const pluginsApplied = [];
	for (const plugin of [...BUILT_IN_PLUGINS, ...plugins]) if (plugin.execute({
		packageDir,
		distDir,
		distName: dist
	}) !== false) pluginsApplied.push(plugin.name);
	return {
		schemaVersion: 1,
		source: {
			path: packageDir,
			packageJsonHash: sourcePackageJsonHash
		},
		output: {
			distPath: distDir,
			packageJsonHash: transformResult.outputPackageJsonHash,
			sizeBytes: transformResult.outputSizeBytes
		},
		transforms: {
			strippedFields: transformResult.strippedFields,
			distPrefixStripped: transformResult.distPrefixStripped,
			metadataCopied,
			pluginsApplied
		},
		versionVerification: null,
		durationMs: Date.now() - start
	};
}
//#endregion
//#region src/verify-tag.ts
var VerifyTagError = class extends Error {
	constructor(message) {
		super(message);
		this.name = "VerifyTagError";
	}
};
function verifyTag({ distDir, tag }) {
	const version = tag.replace(/^.*v(?=\d)/, "");
	if (!/^\d+\.\d+\.\d+/.test(version)) throw new VerifyTagError(`Could not extract a valid version from tag "${tag}"`);
	const pkg = JSON.parse(readFileSync(resolve(distDir, "package.json"), "utf-8"));
	return {
		tag,
		version,
		packageVersion: pkg.version,
		matches: pkg.version === version
	};
}
//#endregion
//#region src/cli.ts
function errorMessage(error) {
	return error instanceof Error ? error.message : String(error);
}
var CliError = class extends Error {
	exitCode;
	constructor(message, exitCode) {
		super(message);
		this.name = "CliError";
		this.exitCode = exitCode;
	}
};
function parseCliArgs(argv) {
	const { values } = parseArgs({
		args: [...argv],
		options: {
			path: { type: "string" },
			dist: { type: "string" },
			tag: { type: "string" },
			json: {
				type: "boolean",
				default: false
			},
			help: {
				type: "boolean",
				default: false
			}
		},
		allowPositionals: false,
		strict: true
	});
	return {
		helpRequested: Boolean(values.help),
		options: {
			path: values.path,
			dist: values.dist,
			tag: values.tag,
			json: Boolean(values.json)
		}
	};
}
function printUsage(logger = console) {
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
async function runCli(argv, logger = console) {
	let parsed;
	try {
		parsed = parseCliArgs(argv);
	} catch (error) {
		const message = errorMessage(error);
		logger.error(`Error: ${message}`);
		logger.error("Run with --help for usage");
		return EXIT.CONFIGURATION_ERROR;
	}
	const { options, helpRequested } = parsed;
	if (helpRequested) {
		printUsage(logger);
		return EXIT.SUCCESS;
	}
	let report;
	try {
		report = prepareDist({
			path: options.path,
			dist: options.dist
		});
	} catch (error) {
		const message = errorMessage(error);
		if (message.includes("Dist directory does not exist") || message.includes("No package.json found")) {
			logger.error(`Error: ${message}`);
			return EXIT.MISSING_INPUTS;
		}
		logger.error(`Error: ${message}`);
		return EXIT.TRANSFORM_FAILURE;
	}
	if (typeof options.tag === "string" && options.tag !== "") try {
		const verification = verifyTag({
			distDir: report.output.distPath,
			tag: options.tag
		});
		report = {
			...report,
			versionVerification: verification
		};
		if (!verification.matches) {
			if (options.json) logger.log(JSON.stringify(report, null, 2));
			else logger.error(`Error: tag version "${verification.version}" (from "${verification.tag}") does not match package.json version "${verification.packageVersion}"`);
			return EXIT.TAG_MISMATCH;
		}
	} catch (error) {
		const message = errorMessage(error);
		logger.error(`Error: ${message}`);
		return EXIT.TAG_MISMATCH;
	}
	if (options.json) logger.log(JSON.stringify(report, null, 2));
	else logger.log(formatPrepareDistReportHuman(report));
	return EXIT.SUCCESS;
}
function formatPrepareDistReportHuman(report) {
	const lines = [];
	lines.push(`prepare-dist — ${report.output.distPath}`);
	lines.push("");
	lines.push(`  source       ${report.source.path} (sha256:${report.source.packageJsonHash.slice(0, 12)}…)`);
	lines.push(`  output       ${report.output.sizeBytes} bytes (sha256:${report.output.packageJsonHash.slice(0, 12)}…)`);
	lines.push(`  stripped     ${report.transforms.strippedFields.join(", ") || "(none)"}`);
	lines.push(`  prefix-fixed ${report.transforms.distPrefixStripped} reference(s)`);
	lines.push(`  metadata     ${report.transforms.metadataCopied.join(", ") || "(none)"}`);
	lines.push(`  plugins      ${report.transforms.pluginsApplied.join(", ") || "(none)"}`);
	if (report.versionVerification !== null) {
		const v = report.versionVerification;
		lines.push(`  tag-check    ${v.matches ? "✓" : "✗"} tag=${v.tag} pkg=${v.packageVersion}`);
	}
	lines.push(`  duration     ${report.durationMs}ms`);
	return lines.join("\n");
}
//#endregion
export { printUsage as a, stripDistPrefix as c, parseCliArgs as i, EXIT as l, errorMessage as n, runCli as o, formatPrepareDistReportHuman as r, prepareDist as s, CliError as t };
