# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Node.js proxy server that provides a Claude API-compatible endpoint backed by Kiro AI (Amazon Q Developer). Translates Claude API requests into Kiro API calls with support for multi-account management, automatic failover, and real-time monitoring via web interface.

## Commands

```bash
# Start the API server (includes web admin on port 3000)
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
- Auto-refreshes tokens before expiry based on `expiresAt`

### Configuration Files (config/)

- `server-config.json` - Server host/port, selection strategy, connection pool settings, auto-switch behavior
- `model-mapping.json` - Claude model ID to Kiro model ID mappings with default fallback
- `kiro-accounts.json` - Account configuration: array of accounts with email, credentials, status (`active`/`error`), usage stats, priority

### Web Management Interface

Server root (`http://localhost:3000`) serves web admin UI from `public/`:
- **Dashboard**: Server status, active accounts, quota usage, connection pool metrics
- **Account Management**: View all accounts, test connectivity, refresh tokens, see status/errors
- **Server Config**: Edit and apply config changes with validation (some require restart)
- **Model Mappings**: View and modify Claude-to-Kiro model mappings
- **Log Viewer**: Real-time display of server logs (auto-refreshing)

API endpoints in [web-admin.js](src/web-admin.js):
- `GET/PUT /api/config` - Server configuration
- `GET /api/accounts` - List accounts with status/usage
- `POST /api/accounts/:id/test` - Test account with sample request
- `POST /api/accounts/:id/reset` - Refresh token + connectivity test
- `GET/PUT /api/models` - Model mappings
- `GET /api/logs/:filename` - Read log files
- `POST /api/config/hot-reload` - Manually trigger config reload

### Configuration Hot-Reloading

[configWatcher.js](src/configWatcher.js) monitors config files and emits `configChanged` events:
- Uses `fs.watch()` with 500ms debouncing to avoid duplicate triggers
- Tracks file `mtimeMs` to detect actual changes
- Deep-merges with defaults on reload
- Emits detailed change events (added/removed/modified paths)
- Server listens for events and reloads without restart (except host/port changes)

Watched files: `server-config.json`, `model-mapping.json`, `kiro-accounts.json`

### Logging

All logs go to `logs/` directory with automatic rotation:
- `server-debug.log` - General server logs
- `server-error.log` - Error logs with stack traces
- `claude-code.log` - Claude API request/response details
- `kiro-api.log` - Kiro API request/response details
- `kiro-client-debug.log` - KiroClient internal debug logs

Log level configurable via API: DEBUG, INFO, WARN, ERROR

## Setup

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
