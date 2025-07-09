import { defineConfig } from "tsdown";

export default defineConfig({
	name: "advanced-subscription",
	format: ["esm", "cjs"],
	entry: ["src/index.ts"],
	dts: true,
	clean: true,
	outDir: "lib",
	external: [/^node:/, /^[^./]/],
});
