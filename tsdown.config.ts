import { defineConfig } from 'tsdown'

export default defineConfig({
    format: ['esm', 'cjs'],
    entry: ['./src'],
    dts: true,
    clean: true,
    outDir: 'lib',
    loader: { '.jpg': 'asset', '.png': 'base64', '.ttf': 'asset' }
})