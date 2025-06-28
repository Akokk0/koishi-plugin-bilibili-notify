import { defineConfig } from "tsdown";

export default defineConfig({
	format: ["esm", "cjs"],
	entry: ["./src/index.ts"],
	dts: true,
	clean: true,
	outDir: "lib",
	copy: [
		{ from: "./src/page", to: "./lib/page" },
		{ from: "./src/img", to: "./lib/img" },
		{ from: "./src/font", to: "./lib/font" },
		{ from: "./src/static", to: "./lib/static" },
	],
});
