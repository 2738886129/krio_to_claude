# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Node.js proxy server that provides a Claude API-compatible endpoint backed by Kiro AI (Amazon Q Developer). It translates Claude API requests into Kiro API calls, allowing Claude Code and other Claude API clients to use Kiro as the backend.

## Commands

```bash
# Start the API server
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

- [claude-api-server.js](src/claude-api-server.js) - Express server exposing Claude-compatible `/v1/messages` endpoint. Handles request translation, streaming responses, tool use conversion, and token refresh scheduling.

- [KiroClient.js](src/KiroClient.js) - HTTP client for Kiro AI API (`q.us-east-1.amazonaws.com`). Parses AWS Event Stream binary format, manages HTTPS connection pooling, and handles streaming responses.

- [loadToken.js](src/loadToken.js) - Token management: loading from `config/kiro-auth-token.json`, automatic refresh when expired, and persistence.

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

### Configuration Files (config/)

- `server-config.json` - Server host/port, stream chunk size, token refresh settings
- `model-mapping.json` - Claude model ID to Kiro model ID mappings
- `kiro-auth-token.json` - Auth credentials (accessToken, refreshToken, expiresAt)

### Logging

All logs go to `logs/` directory:
- `server-debug.log` - General server logs
- `server-error.log` - Error logs with stack traces
- `claude-code.log` - Claude API request/response details
- `kiro-api.log` - Kiro API request/response details
- `kiro-client-debug.log` - KiroClient internal debug logs

## Token Setup

Copy `config/kiro-auth-token.example.json` to `config/kiro-auth-token.json` and fill in:
- `accessToken` - Bearer token from Kiro authentication
- `refreshToken` - For automatic token refresh
- `expiresAt` - ISO timestamp when token expires
