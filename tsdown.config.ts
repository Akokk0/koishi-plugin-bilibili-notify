import { defineConfig } from "tsdown";

export default defineConfig({
	format: ["esm", "cjs"],
	entry: ["./src/index.ts"],
	dts: true,
	clean: true,
	outDir: "lib",
	copy: { from: "./src/page", to: "./lib/page" },
	loader: { ".png": "base64", ".ttf": "asset" },
});
