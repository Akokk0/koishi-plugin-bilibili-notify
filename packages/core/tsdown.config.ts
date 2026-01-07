import { defineConfig } from "tsdown";

export default defineConfig({
	name: "core",
	format: ["esm", "cjs"],
	entry: ["src/index.ts"],
	dts: true,
	clean: true,
	outDir: "lib",
	copy: [
		{ from: "src/page", to: "lib" },
		{ from: "src/img", to: "lib" },
		{ from: "src/static", to: "lib" },
	],
	exports: true,
	external: [/^node:/, /^[^./]/],
});
