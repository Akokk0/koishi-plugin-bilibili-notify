import { defineConfig } from "tsdown";

export default defineConfig({
	name: "core",
	format: ["esm", "cjs"],
	entry: ["src/index.ts"],
	dts: true,
	clean: true,
	outDir: "lib",
	copy: [
		{ from: "src/core/page", to: "lib" },
		{ from: "src/core/img", to: "lib" },
		{ from: "src/core/static", to: "lib" },
		{ from: "src/core/proto", to: "lib" },
	],
	exports: true,
	external: [/^node:/, /^[^./]/],
});
