# Kiro to Claude API Bridge Service

A high-performance API proxy service that translates Kiro API requests into Claude API format, supporting multi-account management, automatic switching, and real-time monitoring.

## ✨ Core Features

- 🔄 **Automatic Account Switching** - Automatically switch to available accounts when errors occur
- 👥 **Multi-Account Management** - Supports load balancing across multiple Kiro accounts
- ⏰ **Automatic Token Refresh** - Automatically refresh authentication tokens in the background
- 🗺️ **Model Mapping** - Flexible mapping between Kiro models and Claude models
- 📊 **Real-Time Monitoring** - Web management interface for real-time status monitoring
- 🔌 **Connection Pool Management** - Optimized high-performance connection pool configuration
- 📝 **Comprehensive Logging** - Detailed request/response logging

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn

### Install Dependencies

```bash
npm install
```

### Configure Accounts

**Option 1: Single Account Mode**

Rename `config/kiro-auth-token.example.json` to `kiro-auth-token.json` and fill in your token:

```json
{
  "accessToken": "your_access_token",
  "refreshToken": "your_refresh_token"
}
```

**Option 2: Multi-Account Mode (Recommended)**

Create a `config/kiro-accounts.json` file:

```json
{
  "accounts": [
    {
      "id": "account_1",
      "email": "user1@example.com",
      "tokens": {
        "accessToken": "token1",
        "refreshToken": "refresh1"
      },
      "priority": 1
    },
    {
      "id": "account_2",
      "email": "user2@example.com",
      "tokens": {
        "accessToken": "token2",
        "refreshToken": "refresh2"
      },
      "priority": 2
    }
  ]
}
```

### Start the Service

```bash
# Option 1: Use startup script (Windows)
start.bat

# Option 2: Run directly
node src/claude-api-server.js
```

Once started, access the service at http://localhost:3000

## 📁 Project Structure

```
├── config/                    # Configuration directory
│   ├── kiro-auth-token.example.json  # Single account template
│   ├── kiro-accounts.json           # Multi-account configuration
│   ├── model-mapping.json           # Model mapping configuration
│   ├── server-config.json           # Server configuration
│   └── README.md                    # Configuration documentation
├── docs/                      # Documentation directory
│   ├── FEATURES.md            # Feature details
│   └── SCREENSHOTS.md         # Interface screenshots
├── public/                    # Static resources for web admin interface
│   ├── index.html             # Admin interface HTML
│   └── app.js                 # Admin interface logic
├── src/                       # Source code
│   ├── KiroClient.js          # Kiro API client
│   ├── claude-api-server.js   # Claude API proxy server
│   ├── loadToken.js           # Token management (single account)
│   ├── loadMultiAccount.js    # Multi-account management system
│   ├── configWatcher.js       # Hot-reload configuration files
│   ├── logger.js              # Logging system
│   ├── web-admin.js           # Web admin API
│   ├── manage-models.js       # Model management utility
│   └── example.js             # Usage examples
├── logs/                      # Log files directory
├── CLAUDE.md                  # Development guide
└── package.json               # Project configuration
```

## 🔧 Configuration Details

### server-config.json

```json
{
  "port": 3000,
  "host": "0.0.0.0",
  "accountMode": "multi",      // "single" or "multi"
  "strategy": "auto",          // Account selection strategy
  "autoSwitchOnError": true,   // Auto-switch on error
  "connectionPool": {
    "maxSockets": 10,          // Maximum concurrent connections
    "maxFreeSockets": 5,       // Idle connection pool size
    "socketTimeout": 60000,    // Socket timeout (milliseconds)
    "requestTimeout": 120000   // Request timeout (milliseconds)
  },
  "tokenRefresh": {
    "bufferSeconds": 300,      // Token refresh buffer time
    "retryAttempts": 3         // Number of retry attempts
  }
}
```

### model-mapping.json

```json
{
  "claude-3-5-sonnet-20241022": "claude-opus-4-20240307",
  "claude-3-5-haiku-20241022": "claude-haiku-20240307",
  "default": "claude-sonnet-4-20240307"
}
```

## 📊 Account Selection Strategies

| Strategy | Description |
|----------|-------------|
| `auto` | Automatically selects the optimal account (default) |
| `round-robin` | Cycles through accounts sequentially |
| `priority` | Selects accounts by priority level |
| `least-used` | Chooses the least frequently used account |

## 🖥️ Web Admin Interface

After starting the service, visit http://localhost:3000 to manage:

- 📈 **Status Overview** - Server status, active accounts, quota usage
- 👥 **Account Management** - View, test, and reset accounts
- ⚙️ **Server Configuration** - Modify server settings
- 🗺️ **Model Mapping** - Manage model mapping relationships
- 📋 **Log Viewer** - View real-time server logs

## 💡 Usage Examples

### Basic Chat

```javascript
const KiroClient = require('./src/KiroClient');

const client = new KiroClient('your_access_token');

async function chat() {
  const response = await client.chat('Hello, please introduce yourself');
  console.log(response);
}

chat();
```

### List Available Models

```javascript
async function listModels() {
  const models = await client.getAvailableModelIds();
  console.log('Available models:', models);
}
```

## 📝 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/accounts` | GET | Get account list |
| `/api/accounts/:id/test` | POST | Test account connectivity |
| `/api/accounts/:id/refresh` | POST | Refresh account token |
| `/api/config` | GET/PUT | Get/modify server configuration |
| `/api/models` | GET/PUT | Get/modify model mappings |
| `/api/logs` | GET | Retrieve server logs |

## 🔒 Security Recommendations

1. Do not commit `kiro-auth-token.json` or `kiro-accounts.json` to version control
2. Regularly rotate tokens
3. Store sensitive information in environment variables in production
4. Configure appropriate request timeouts to prevent resource exhaustion

## 🐛 Troubleshooting

### Account Connection Issues
- Check if token has expired
- Verify account status is active
- Review server logs for detailed error information

### Automatic Switching Failure
- Ensure multiple valid accounts are configured
- Confirm `autoSwitchOnError` is enabled
- Check account priority settings

### Request Timeouts
- Adjust timeout values in `connectionPool` configuration
- Verify network connectivity
- Confirm Kiro API service is operational

## 📄 License

This project is licensed under the MIT License.

## 🤝 Contribution Guidelines

Issues and pull requests are welcome!

## 📞 Support

For assistance, please contact via:
- Submit a [GitHub Issue](https://gitee.com/shangyuhang_gitee/krio_to_claude/issues)
- Email the project maintainer