# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Requires Node 20+ and Yarn 4 (`corepack enable`).

```bash
yarn install                                    # Install all dependencies at repo root

cd packages/core && yarn build                  # Build core plugin (tsdown → lib/)
cd packages/core && yarn client                 # Build Koishi console UI (yakumo → dist/)
cd packages/advanced-subscription && yarn build # Build advanced-subscription plugin

yarn workspaces foreach -A run build            # Build all packages
```

There is no automated test suite. Test manually in a local Koishi instance by verifying the login → subscription → push flow.

## Architecture

This is a Yarn 4 workspace monorepo with two publishable Koishi plugins under `packages/`:

- **`packages/core`** (`koishi-plugin-bilibili-notify`): Main plugin. Monitors Bilibili dynamics and live streams, sends notifications to chat platforms via Koishi.
- **`packages/advanced-subscription`** (`koishi-plugin-bilibili-notify-advanced-subscription`): Extension plugin that adds per-UP-master, per-platform, per-channel subscription granularity on top of the core plugin.

### Core Plugin Service Architecture

`index.ts` loads `ServerManager`, which instantiates five services:

| Service | File | Responsibility |
|---|---|---|
| `BilibiliNotifyAPI` | `core/api.ts` | HTTP client (axios + cookie jar), auth (WBI signing, QR login), token refresh cron |
| `BilibiliNotifyDynamic` | `core/dynamic.ts` | Cron-based polling for user dynamics (default every 2 min), filtering, push event emission |
| `BilibiliNotifyLive` | `core/live.ts` | WebSocket live stream detection (blive-message-listener), danmaku collection, AI summaries |
| `BilibiliNotifyPush` | `core/push.ts` | Dispatches notifications to target Koishi platforms/channels |
| `BilibiliNotifyGenerateImg` | `core/generate_img.ts` | Puppeteer card image rendering using HTML templates in `src/core/page/` |
| `BilibiliNotifySub` | `core/sub.ts` | Subscription config management; bridges advanced-subscription events to dynamic/live monitors |

Commands are registered in `src/command/` (user-facing `bili`, system `sys`, info `status`).

Database schema is declared in `src/database.ts` (extends Koishi `loginBili` table for encrypted cookie storage).

The console UI lives in `client/` and is a Vue component built separately by `yarn client`.

### Inter-Plugin Communication

The two plugins communicate via Koishi events:
- Core emits `bilibili-notify/login-status-report`, `bilibili-notify/ready-to-recive`
- Advanced-subscription listens for triggers and emits `bilibili-notify/advanced-sub` with per-UID config overlays

### Key Conventions

- **File naming**: lowercase underscores (`server_manager.ts`, `generate_img.ts`)
- **Class naming**: PascalCase with full prefix (`BilibiliNotifyAPI`, `BilibiliNotifyDynamic`)
- **Indentation**: 4 spaces, LF line endings, UTF-8 (enforced by `.editorconfig`)
- **Linting**: Biome (`biome.json`); use `// biome-ignore lint/...` for intentional suppressions
- **Koishi plugin pattern**: export `name`, `inject`, `Config` (Schema), and `apply(ctx, config)`
- **Commits**: Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`) scoped to one logical change
- **UI descriptions**: Written in Mandarin Chinese (humorous "maid persona" style — preserve this tone)
