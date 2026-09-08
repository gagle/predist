import { o as runCli } from "./cli2.mjs";
//#region src/main.ts
const path = process.env.INPUT_PATH ?? ".";
const dist = process.env.INPUT_DIST ?? "dist";
const tag = process.env.INPUT_TAG ?? "";
const argv = [
	"--path",
	path,
	"--dist",
	dist
];
if (tag !== "") argv.push("--tag", tag);
runCli(argv, {
	log: (message) => console.log(message),
	error: (message) => console.log(`::error::${message}`)
}).then((code) => {
	process.exitCode = code;
});
//#endregion
export {};
