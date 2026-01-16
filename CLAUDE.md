# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Node.js proxy server that provides a Claude API-compatible endpoint backed by Kiro AI (Amazon Q Developer). Translates Claude API requests into Kiro API calls with support for multi-account management, automatic failover, and real-time monitoring via web interface.

## Commands

```bash
# Quick start (Windows - handles all setup automatically)
start.bat

# Start the API server (includes web admin on default port 3000)
npm run server

# Run example/test client
npm test

# Show current model mappings
npm run models

# List available Kiro models from API
npm run models:list

# Model mapping management
node src/manage-models.js show           # Display all mappings
node src/manage-models.js list           # Query Kiro API for available models
node src/manage-models.js add <claude> <kiro>  # Add mapping
node src/manage-models.js remove <claude>      # Remove mapping
node src/manage-models.js test <claude>        # Test mapping resolution

# Frontend development (from public/ directory)
cd public
npm run dev      # Start Vite dev server with hot reload
npm run build    # Build frontend for production (creates dist/)
npm run preview  # Preview production build locally
```

## Architecture

### Core Components

- [claude-api-server.js](src/claude-api-server.js) - Express server exposing Claude-compatible `/v1/messages` endpoint. Handles request translation, streaming responses, tool use conversion, and token refresh scheduling. Serves web admin interface at root path.

- [KiroClient.js](src/KiroClient.js) - HTTP client for Kiro AI API (`q.us-east-1.amazonaws.com`). Parses AWS Event Stream binary format, manages HTTPS connection pooling, and handles streaming responses.

- [loadMultiAccount.js](src/loadMultiAccount.js) - Account management system with automatic account selection, load balancing, token refresh, and failover on quota/auth errors. Supports strategies: `auto` (lowest usage), `random`, `first`.

- [web-admin.js](src/web-admin.js) - Express router providing REST API for web management interface: account testing, token refresh, config updates, model mapping, and log viewing.

- [configWatcher.js](src/configWatcher.js) - Configuration hot-reloading system using `fs.watch()` with debouncing. Monitors `server-config.json`, `model-mapping.json`, and `kiro-accounts.json` for changes and emits reload events.

- [logger.js](src/logger.js) - Centralized logging to `logs/` directory with log rotation, level filtering, and separate streams for server, Claude API, and Kiro API events.

- [manage-models.js](src/manage-models.js) - CLI tool for managing Claude-to-Kiro model ID mappings.

**Frontend Components** (Vue 3 in `public/src/components/`):
- `App.vue` - Main application container
- `AccountManager.vue` / `MultiAccountView.vue` / `AccountCard.vue` - Account management UI
- `ServerConfig.vue` - Server configuration viewer
- `ModelMapping.vue` - Model mapping editor
- `LogViewer.vue` - Log file viewer with auto-refresh
- `StatusBar.vue` - System status display
- Additional dialogs: `AddAccountDialog.vue`, `UploadDialog.vue`, `RestartDialog.vue`

Build process: Vite bundles Vue 3 SFC components from `public/src/` → `public/dist/`, served as static files by Express

### Data Flow

1. Client sends Claude API request to `/v1/messages`
2. Server converts Claude message format to Kiro `conversationState`
3. KiroClient sends to Kiro API with Bearer token auth
4. AWS Event Stream response is parsed and converted back to Claude format
5. For streaming: chunks are sent as SSE events; for non-streaming: JSON response

### Key Conversions

- **Tools**: Claude `input_schema` → Kiro `toolSpecification.inputSchema.json`
- **Tool results**: Claude `tool_result` blocks → Kiro `toolResults` array
- **Images**: Claude base64 image blocks → Kiro `images` array
- **Streaming**: Kiro binary Event Stream → Claude SSE text/event-stream

### Account Management

The server uses `config/kiro-accounts.json` with array of accounts:
- Auto-selects best account using configured strategy (`auto`, `random`, or `first`)
- Automatic failover: when quota errors or auth failures detected via `shouldSwitchAccount()`, marks account as `error` status and switches to next available account
- Tracks usage quotas (`percentUsed`) for intelligent selection
- Auto-refreshes tokens before expiry based on `expiresAt` via Kiro auth endpoint (`prod.us-east-1.auth.desktop.kiro.dev/refreshToken`)

### Configuration Files (config/)

- `server-config.json` - Server host/port, selection strategy, connection pool settings, auto-switch behavior
- `model-mapping.json` - Claude model ID to Kiro model ID mappings with default fallback
- `kiro-accounts.json` - Account configuration: array of accounts with email, credentials, status (`active`/`error`), usage stats, priority

### Web Management Interface

Server root (`http://localhost:3000`) serves web admin UI from `public/dist/`:
- **Frontend Stack**: Vue 3 + Vite (source in `public/src/`, built to `public/dist/`)
- **Dashboard**: Server status, active accounts, quota usage, connection pool metrics
- **Account Management**: View all accounts, test connectivity, refresh tokens, see status/errors
- **Server Config**: View-only display of current configuration (edit via config files)
- **Model Mappings**: View and modify Claude-to-Kiro model mappings
- **Log Viewer**: Real-time display of server logs (auto-refreshing)

API endpoints in [web-admin.js](src/web-admin.js):
- `GET /api/config` - Server configuration (read-only)
- `GET /api/accounts` - List accounts with status/usage
- `POST /api/accounts/:id/test` - Test account with sample request
- `POST /api/accounts/:id/reset` - Refresh token + connectivity test
- `GET/PUT /api/models` - Model mappings
- `GET /api/logs/:filename` - Read log files
- `POST /api/config/hot-reload` - Manually trigger config reload

### Configuration Hot-Reloading

[configWatcher.js](src/configWatcher.js) provides manual configuration reload functionality:
- **Manual reload only**: Automatic file watching is disabled by default to avoid duplicate reloads
- Triggered via API endpoint: `POST /api/config/hot-reload` or programmatically via `configWatcher.reload()`
- Deep-merges with defaults on reload
- Emits detailed change events (added/removed/modified paths)
- Server listens for `configChanged` events and reloads without restart (except host/port changes)

Config files: `server-config.json`, `model-mapping.json`, `kiro-accounts.json`

**Note**: When adding/removing accounts via Web UI, configs are automatically reloaded via `configWatcher.reload()` calls.

### Logging

All logs go to `logs/` directory with automatic rotation:
- `server-debug.log` - General server logs
- `server-error.log` - Error logs with stack traces
- `claude-code.log` - Claude API request/response details
- `kiro-api.log` - Kiro API request/response details
- `kiro-client-debug.log` - KiroClient internal debug logs

Log level configurable via API: DEBUG, INFO, WARN, ERROR

## Setup

### Quick Setup (Windows)

[start.bat](start.bat) automates the entire setup process:
1. Checks Node.js installation
2. Installs backend dependencies (if `node_modules/` missing)
3. Installs frontend dependencies (if `public/node_modules/` missing)
4. Builds frontend with Vite (creates `public/dist/`)
5. Starts the server

Double-click `start.bat` or run from command line. First-time setup takes a few minutes for all dependencies and build.

### Manual Setup

```bash
# Install backend dependencies
npm install

# Install and build frontend
cd public
npm install
npm run build
cd ..

# Start server
npm run server
```

### Account Configuration

1. Create `config/kiro-accounts.json` with accounts array (compatible with Kiro account manager export format)
2. Each account needs: `id`, `email`, `credentials: {accessToken, refreshToken, expiresAt}`, `status: "active"`, optional `usage` stats
3. In `server-config.json`: choose `strategy` (`auto`/`random`/`first`), enable `autoSwitchOnError: true` for automatic failover

### Configuration Validation

On startup, server validates:
- `kiro-accounts.json` exists and has valid accounts
- At least one account has `status: "active"`
- Active accounts have valid credentials
- Returns error if validation fails

## Key Implementation Details

### Account Error Detection and Failover

[loadMultiAccount.js](src/loadMultiAccount.js):`shouldSwitchAccount()` detects:
- **Quota errors**: `quota`, `limit`, `exceeded`, `insufficient`, `credit`, `usage`, `overloaded`
- **Auth errors**: `suspended`, `banned`, `disabled`, `unauthorized`, `authentication`, `invalid token`, `token expired`

When detected: marks current account as `error`, selects next best account via `selectBestAccount()`, retries request

### Connection Pooling

KiroClient uses Node.js `https.Agent` with custom pooling config from `server-config.json`:
- `maxSockets`: Max concurrent connections (default: 20)
- `maxFreeSockets`: Keep-alive pool size (default: 10)
- `socketTimeout`: Connection timeout (default: 60000ms)
- `requestTimeout`: Request timeout (default: 30000ms)

Optimized based on load testing: 20/10 provides best throughput for typical workloads

### AWS Event Stream Parsing

Kiro API returns binary AWS Event Stream format. [KiroClient.js](src/KiroClient.js) parses:
1. Chunks arrive with headers (name/value pairs) and payload
2. Each chunk prefixed with 12-byte header (total length, headers length, prelude CRC)
3. Payload contains JSON events: `messageStart`, `contentBlockDelta`, `messageStop`
4. Aggregates deltas into complete message for non-streaming, forwards chunks for streaming

### Error Handling

[claude-api-server.js](src/claude-api-server.js) translates errors to Claude API format:
- Maps HTTP status codes to Claude error types (`invalid_request_error`, `authentication_error`, `rate_limit_error`, etc.)
- Extracts and preserves original Kiro API error messages from JSON responses
- Special handling: Backend auth failures return 400 to stop client retries
- Feeds into failover logic: quota/auth errors trigger account switching via `shouldSwitchAccount()`
