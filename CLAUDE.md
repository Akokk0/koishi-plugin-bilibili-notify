# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Bilibili Notify** is a Koishi.js plugin that provides push notifications for Bilibili platform activities, including user dynamic updates and live stream status notifications. The project is structured as a Yarn workspaces monorepo.

## Monorepo Structure

```
bilibili-notify/
├── packages/
│   ├── core/                    # Main plugin (koishi-plugin-bilibili-notify)
│   └── advanced-subscription/   # Enhanced subscription features
├── package.json                 # Root monorepo config
├── tsconfig.json                # Root TypeScript config
└── tsconfig.base.json           # Base TypeScript config
```

### Core Package (`packages/core/`)
Main plugin providing Bilibili notification services.

**Key Services:**
- `ServerManager` (server_manager.ts) - Plugin lifecycle and configuration management
- `DataServer` (data_server.ts) - API data retrieval and caching
- `Database` (database.ts) - Persistence layer for subscriptions and credentials
- Command handlers in `command/` directory

### Advanced Subscription Package (`packages/advanced-subscription/`)
Extension package that depends on core. Provides enhanced subscription controls including:
- User-enter-room notifications
- Special bullet screen monitoring
- Advanced filtering options

## Development Commands

### Root level
```bash
yarn install              # Install all workspace dependencies
```

### Core package
```bash
cd packages/core
yarn build                # Build TypeScript (tsdown) - outputs to lib/
yarn client               # Build web client (yakumo) - outputs to dist/
```

### Advanced subscription package
```bash
cd packages/advanced-subscription
yarn build                # Build TypeScript (tsdown) - outputs to lib/
```

## Build System

- **TypeScript compilation**: Uses `tsdown` to build both CJS and MJS outputs
- **Web client**: Core package uses `yakumo` to build the Koishi console UI
- **Node version**: Requires Node >= 20.0.0

## Code Style

- **Indentation**: 4 spaces (see .editorconfig)
- **Line endings**: LF
- **Charset**: UTF-8
- **Biome**: Used for linting (dev dependency in root)

## Architecture Patterns

### Koishi Plugin System
The plugin follows Koishi's service-based architecture:

1. **Dependency Injection**: Core plugin injects `puppeteer`, `database`, `notifier`, and `console` services
2. **Event System**: Custom events defined in `declare module "koishi"`:
   - `bilibili-notify/login-status-report`
   - `bilibili-notify/advanced-sub`
   - `bilibili-notify/ready-to-recive`

### Service Layer
- **ServerManager**: Manages plugin lifecycle, config validation, and coordinates other services
- **DataServer**: Handles Bilibili API interactions with caching
- **Database**: Koishi database extension for storing subscriptions and encrypted credentials

### Protocol Buffers
- Located in `packages/core/src/proto/`
- Used for Bilibili live message protocol handling
- Managed with `protobufjs`

## Publishing

GitHub Actions workflow (`.github/workflows/publish.yml`):
- Triggers on push to `monorepo` branch when package.json versions change
- Matrix build for both `core` and `advanced-subscription` packages
- Core package builds both main lib and client
- Uses npm provenance for secure publishing

## Key Dependencies

- `koishi` - Plugin framework (peer dependency, ^4.18.10)
- `blive-message-listener` - Bilibili live stream protocol listener
- `protobufjs` - Protocol buffer support for live messages
- `axios` + `axios-cookiejar-support` - HTTP client with cookie handling
- `cron` - Dynamic monitoring scheduler
- `puppeteer` - Image generation (peer dependency via koishi-plugin-puppeteer)
- `openai` - AI-powered live summaries

## Important Notes

- **Bilibili Login**: Uses QR code authentication with encrypted credential storage (32-character encryption key)
- **Platform Names**: For OneBot robots, use `onebot` not `qq`
- **Dynamic Monitoring**: Since v3.0.2, uses cron-based scheduling (look for "Dynamic monitoring initialized!" log message)
- **Subscription Migration**: Versions before 2.0.0-alpha.7 require resubscription when upgrading
