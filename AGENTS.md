# Repository Guidelines

## Project Structure & Module Organization
This repository is a Yarn workspace monorepo with two publishable packages under `packages/`:
- `packages/core`: main Koishi plugin (`koishi-plugin-bilibili-notify`), source in `src/`, built output in `lib/`, static/web assets in `src/core/static` and `client/`.
- `packages/advanced-subscription`: extension plugin, source in `src/`, built output in `lib/`.

Top-level configs include `tsconfig.base.json` (shared TS options), `.editorconfig` (format baseline), and `.github/workflows/publish.yml` (release pipeline).

## Build, Test, and Development Commands
Use Node 20+ and Yarn 4 (`corepack enable`). Install once at repo root:

```bash
yarn install
```

Key build commands:
- `cd packages/core && yarn build`: build core package with `tsdown`.
- `cd packages/core && yarn client`: build Koishi console client assets via `yakumo`.
- `cd packages/advanced-subscription && yarn build`: build advanced-subscription package.
- `yarn workspaces foreach -A run build`: build all workspaces that expose `build`.

## Coding Style & Naming Conventions
- Indentation: 4 spaces, LF line endings, UTF-8, final newline (from `.editorconfig`).
- Language: TypeScript (ES2022 / ESM-oriented config).
- Keep module/file names consistent with existing lowercase patterns (examples: `data_server.ts`, `server_manager.ts`).
- Prefer small, focused modules in `src/` and keep exports explicit in package entrypoints.
- Biome is present in dev dependencies; if adding lint/format automation, align with Biome defaults and existing style.

## Testing Guidelines
There is currently no dedicated automated test suite or `test` script in this repository. For changes:
- Build affected package(s) successfully.
- Perform smoke checks in a local Koishi instance (login, subscription, push flow).
- If adding tests, co-locate as `*.test.ts` near source or under `src/__tests__/` and add a workspace `test` script.

## Commit & Pull Request Guidelines
Recent history follows Conventional Commit style (`feat:`, `fix:`, `refactor:`, `chore:`, `test:`). Continue this format and scope commits to one logical change.

PRs should include:
- Clear summary of behavioral changes.
- Linked issue/context when applicable.
- Migration notes for config/schema/version bumps.
- Screenshots/log snippets for UI or push-message rendering changes.
