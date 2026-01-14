# Kiro to Claude API 桥接服务

一个高性能的 API 代理服务，用于将 Kiro API 请求转换为 Claude API 格式，支持多账号管理、自动切换和实时监控。

## ✨ 核心特性

- 🔄 **自动账号切换** - 遇到错误时自动切换到可用账号
- 👥 **多账号管理** - 支持多个 Kiro 账号的负载均衡
- ⏰ **自动刷新 Token** - 后台自动刷新认证令牌
- 🗺️ **模型映射** - 支持 Kiro 模型与 Claude 模型的灵活映射
- 📊 **实时监控** - Web 管理界面提供实时状态监控
- 🔌 **连接池管理** - 高性能连接池配置优化
- 📝 **完整日志** - 详细的请求/响应日志记录

## 🚀 快速开始

### 环境要求

- Node.js 18+
- npm 或 yarn

### 安装依赖

```bash
npm install
```

### 配置账号

**方式一：单账号模式**

将 `config/kiro-auth-token.example.json` 重命名为 `kiro-auth-token.json`，并填入你的 token：

```json
{
  "accessToken": "your_access_token",
  "refreshToken": "your_refresh_token"
}
```

**方式二：多账号模式（推荐）**

> 💡 该文件结构与 Kiro 账号管理器的导出格式兼容，可直接通过 Kiro 账号管理器生成使用。

创建 `config/kiro-accounts.json` 文件：

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

### 启动服务

```bash
# 方式一：使用启动脚本（Windows）
start.bat

# 方式二：直接运行
node src/claude-api-server.js
```

服务启动后，默认访问 http://localhost:3000

## 📁 项目结构

```
├── config/                    # 配置文件目录
│   ├── kiro-auth-token.example.json  # 单账号模板
│   ├── kiro-accounts.json           # 多账号配置
│   ├── model-mapping.json           # 模型映射配置
│   ├── server-config.json           # 服务器配置
│   └── README.md                    # 配置说明文档
├── docs/                      # 文档目录
│   ├── FEATURES.md            # 功能详细说明
│   └── SCREENSHOTS.md         # 界面截图说明
├── public/                    # Web 管理界面静态资源
│   ├── index.html             # 管理界面 HTML
│   └── app.js                 # 管理界面逻辑
├── src/                       # 源代码
│   ├── KiroClient.js          # Kiro API 客户端
│   ├── claude-api-server.js   # Claude API 代理服务器
│   ├── loadToken.js           # Token 管理（单账号）
│   ├── loadMultiAccount.js    # 多账号管理系统
│   ├── configWatcher.js       # 配置文件热加载
│   ├── logger.js              # 日志系统
│   ├── web-admin.js           # Web 管理 API
│   ├── manage-models.js       # 模型管理工具
│   └── example.js             # 使用示例
├── logs/                      # 日志文件目录
├── CLAUDE.md                  # 开发指南
└── package.json               # 项目配置
```

## 🔧 配置说明

### server-config.json

```json
{
  "port": 3000,
  "host": "0.0.0.0",
  "accountMode": "multi", // "single" 或 "multi"
  "strategy": "auto", // 账号选择策略
  "autoSwitchOnError": true, // 错误时自动切换
  "connectionPool": {
    "maxSockets": 10, // 最大并发连接数
    "maxFreeSockets": 5, // 空闲连接池大小
    "socketTimeout": 60000, // Socket 超时（毫秒）
    "requestTimeout": 120000 // 请求超时（毫秒）
  },
  "tokenRefresh": {
    "bufferSeconds": 300, // 刷新令牌提前时间
    "retryAttempts": 3 // 重试次数
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

## 📊 账号选择策略

| 策略          | 说明                     |
| ------------- | ------------------------ |
| `auto`        | 自动选择最优账号（默认） |
| `round-robin` | 轮询选择                 |
| `priority`    | 按优先级选择             |
| `least-used`  | 选择使用最少的账号       |

## 🖥️ Web 管理界面

启动服务后访问 http://localhost:3000，可管理：

- 📈 **状态概览** - 服务器状态、活跃账号、额度使用
- 👥 **账号管理** - 查看、测试、重置账号
- ⚙️ **服务器配置** - 修改服务器配置
- 🗺️ **模型映射** - 管理模型映射关系
- 📋 **日志查看** - 实时查看服务器日志

## 💡 使用示例

### 基础对话

```javascript
const KiroClient = require("./src/KiroClient");

const client = new KiroClient("your_access_token");

async function chat() {
  const response = await client.chat("你好，请介绍一下自己");
  console.log(response);
}

chat();
```

### 列出可用模型

```javascript
async function listModels() {
  const models = await client.getAvailableModelIds();
  console.log("可用模型:", models);
}
```

## 📝 API 端点

| 端点                        | 方法    | 说明              |
| --------------------------- | ------- | ----------------- |
| `/api/health`               | GET     | 健康检查          |
| `/api/accounts`             | GET     | 获取账号列表      |
| `/api/accounts/:id/test`    | POST    | 测试账号          |
| `/api/accounts/:id/refresh` | POST    | 刷新账号 Token    |
| `/api/config`               | GET/PUT | 获取/修改配置     |
| `/api/models`               | GET/PUT | 获取/修改模型映射 |
| `/api/logs`                 | GET     | 获取日志          |

## 🔒 安全建议

1. 不要将 `kiro-auth-token.json` 或 `kiro-accounts.json` 提交到版本控制
2. 定期轮换 Token
3. 生产环境使用环境变量存储敏感信息
4. 配置合适的请求超时时间防止资源耗尽

## 🐛 故障排查

### 账号无法连接

- 检查 Token 是否过期
- 确认账号状态是否正常
- 查看服务器日志获取详细错误信息

### 自动切换失败

- 确保配置了多个可用账号
- 检查 `autoSwitchOnError` 是否启用
- 查看账号优先级配置

### 请求超时

- 调整 `connectionPool` 配置中的超时时间
- 检查网络连接状态
- 确认 Kiro API 服务是否正常

### 参考项目

- AIClient-2-API(https://github.com/justlovemaki/AIClient-2-API)
- cc-switch(https://github.com/farion1231/cc-switch)

## 📄 许可证

本项目遵循 MIT 许可证。

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

## 📞 支持

如有问题，请通过以下方式联系：

- 提交 [GitHub Issue](https://gitee.com/shangyuhang_gitee/krio_to_claude/issues)
- 发送邮件至项目维护者
