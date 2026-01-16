# Kiro to Claude API 桥接服务

一个高性能的 Node.js 代理服务器，提供 Claude API 兼容的端点，后端对接 Kiro AI (Amazon Q Developer)。将 Claude API 请求转换为 Kiro API 调用，支持多账号管理、自动故障转移和 Web 实时监控界面。

## ✨ 核心特性

- 🔄 **智能故障转移** - 配额或认证错误时自动切换到可用账号
- 👥 **多账号负载均衡** - 支持多种账号选择策略（auto/random/first）
- ⏰ **自动 Token 刷新** - 基于过期时间的后台自动刷新机制
- 🔧 **配置热重载** - 无需重启即可应用配置更改
- 🗺️ **灵活模型映射** - Claude 模型 ID 到 Kiro 模型 ID 的自定义映射
- 📊 **Web 管理界面** - 实时状态监控、账号管理、日志查看
- 🔌 **连接池优化** - 基于负载测试优化的 HTTPS 连接池配置
- 📝 **分类日志系统** - 服务器、Claude API、Kiro API 分离记录
- 🛠️ **工具调用支持** - 完整支持 Claude Tools/Function Calling
- 📡 **流式响应** - 支持 SSE 流式输出和非流式 JSON 响应

## 🚀 快速开始

### 环境要求

- Node.js 18+
- npm

### 安装依赖

```bash
npm install
```

### 配置账号

系统启动时会自动创建 `config/kiro-accounts.json` 文件。

**配置方式：**

1. **通过 Web 管理界面添加账号（推荐）**

   - 启动服务后访问 Web 管理界面（默认 `http://localhost:3000`，可在配置中修改）
   - 在"账号管理"页面添加和管理账号
   - 系统自动保存配置

2. **导入已有配置**

   - 如果您使用 Kiro 账号管理器，可直接导出账号配置
   - 将导出的文件放置到 `config/kiro-accounts.json`
   - 文件格式与账号管理器完全兼容

3. **手动配置（高级用户）**
   ```json
   {
     "accounts": [
       {
         "id": "account_1",
         "email": "user1@example.com",
         "credentials": {
           "accessToken": "your_access_token_here",
           "refreshToken": "your_refresh_token_here",
           "expiresAt": "2025-12-31T23:59:59.000Z"
         },
         "status": "active",
         "priority": 1,
         "usage": {
           "percentUsed": 0
         }
       }
     ]
   }
   ```

**字段说明：**

- `id`: 账号唯一标识符（系统自动生成）
- `email`: 账号邮箱
- `credentials`: 包含 accessToken、refreshToken 和过期时间
- `status`: 账号状态，`active` 或 `error`（系统自动管理）
- `priority`: 优先级（数字越小优先级越高）
- `usage`: 使用情况统计（系统自动更新）

### 启动服务

**方式一：使用启动脚本（推荐）**

Windows 用户直接双击运行：

```bash
start.bat
```

该脚本会自动完成以下操作：

- ✅ 检查 Node.js 环境
- ✅ 自动安装后端依赖（首次运行）
- ✅ 自动安装前端依赖（首次运行）
- ✅ 自动打包前端项目
- ✅ 启动服务器

**方式二：使用 npm 命令**

```bash
# 手动安装依赖（首次运行）
npm install

# 安装并打包前端（首次运行）
cd public
npm install
npm run build
cd ..

# 启动服务器
npm run server

# 或直接运行
node src/claude-api-server.js
```

**服务启动后（默认配置）：**

- Web 管理界面: `http://localhost:3000`
- Claude API 端点: `http://localhost:3000/v1/messages`

> 💡 可在 `config/server-config.json` 中修改 `host` 和 `port` 配置

### 常用命令

```bash
# 运行测试示例
npm test

# 查看当前模型映射
npm run models

# 列出可用的 Kiro 模型
npm run models:list

# 模型映射管理
node src/manage-models.js show              # 显示所有映射
node src/manage-models.js list              # 查询 Kiro API 可用模型
node src/manage-models.js add <claude> <kiro>  # 添加映射
node src/manage-models.js remove <claude>   # 删除映射
node src/manage-models.js test <claude>     # 测试映射解析
```

## 📁 项目结构

```
├── config/                    # 配置文件目录
│   ├── kiro-accounts.json           # 账号配置（系统自动创建）
│   ├── model-mapping.json           # 模型映射配置
│   ├── server-config.json           # 服务器配置
│   └── README.md                    # 配置说明文档
├── docs/                      # 文档目录
│   ├── FEATURES.md            # 功能详细说明
│   └── SCREENSHOTS.md         # 界面截图说明
├── public/                    # 前端 Vue 项目（Web 管理界面）
│   ├── src/                   # 前端源代码
│   ├── dist/                  # 前端打包产物（自动生成）
│   ├── package.json           # 前端依赖配置
│   └── vite.config.js         # Vite 构建配置
├── src/                       # 后端源代码
│   ├── KiroClient.js          # Kiro API 客户端
│   ├── claude-api-server.js   # Claude API 代理服务器
│   ├── loadMultiAccount.js    # 账号管理系统
│   ├── configWatcher.js       # 配置文件热加载
│   ├── logger.js              # 日志系统
│   ├── web-admin.js           # Web 管理 API
│   ├── manage-models.js       # 模型管理工具
│   └── example.js             # 使用示例
├── logs/                      # 日志文件目录（自动创建）
├── start.bat                  # Windows 一键启动脚本
├── CLAUDE.md                  # 开发指南（AI 辅助开发文档）
├── README.md                  # 项目说明文档
└── package.json               # 后端依赖配置
```

## 🔧 配置说明

### server-config.json - 服务器配置

```json
{
  "port": 3000,
  "host": "0.0.0.0",
  "strategy": "auto", // 账号选择策略: auto/random/first
  "autoSwitchOnError": true, // 错误时自动切换账号
  "connectionPool": {
    "maxSockets": 20, // 最大并发连接数（默认 20）
    "maxFreeSockets": 10, // 空闲连接池大小（默认 10）
    "socketTimeout": 60000, // Socket 超时（毫秒）
    "requestTimeout": 30000 // 请求超时（毫秒）
  },
  "tokenRefresh": {
    "bufferSeconds": 300, // Token 刷新提前时间（秒）
    "retryAttempts": 3 // 刷新失败重试次数
  },
  "logLevel": "INFO" // 日志级别: DEBUG/INFO/WARN/ERROR
}
```

**配置说明：**

- **host**: 服务监听地址
  - `0.0.0.0`: 监听所有网络接口（默认，允许外部访问）
  - `127.0.0.1`: 仅本地访问
  - 修改后需要重启服务
- **port**: 服务监听端口（默认 3000）
  - 修改后需要重启服务
- **strategy**: 账号选择策略
  - `auto`: 自动选择使用率最低的账号（推荐）
  - `random`: 随机选择账号
  - `first`: 始终使用第一个可用账号
- **autoSwitchOnError**: 遇到配额或认证错误时自动切换账号
- **connectionPool**: 基于负载测试优化，20/10 配置适合大多数场景
- **tokenRefresh**: Token 过期前自动刷新，避免请求中断
- **logLevel**: 日志级别（DEBUG/INFO/WARN/ERROR）

### model-mapping.json - 模型映射配置

```json
{
  "claude-3-5-sonnet-20241022": "claude-sonnet-4-20240307",
  "claude-3-5-haiku-20241022": "claude-haiku-20240307",
  "claude-opus-4-20241113": "claude-opus-4-20240307",
  "default": "claude-sonnet-4-20240307"
}
```

**配置说明：**

- 键: Claude API 模型 ID（客户端请求使用）
- 值: Kiro API 模型 ID（实际调用的模型）
- `default`: 当请求的模型未配置映射时使用的默认模型

## 📊 核心功能详解

### 账号选择策略

| 策略     | 说明                                           | 使用场景                   |
| -------- | ---------------------------------------------- | -------------------------- |
| `auto`   | 自动选择使用率最低的账号（基于 `percentUsed`） | 生产环境推荐，智能负载均衡 |
| `random` | 随机选择可用账号                               | 开发测试，简单负载分散     |
| `first`  | 始终使用第一个可用账号                         | 单一账号优先场景           |

### 自动故障转移机制

系统自动检测以下错误并切换账号：

**配额错误检测：**

- quota, limit, exceeded, insufficient, credit, usage, overloaded

**认证错误检测：**

- suspended, banned, disabled, unauthorized, authentication, invalid token, token expired

**故障转移流程：**

1. 检测到错误后标记当前账号为 `error` 状态
2. 根据选择策略切换到下一个可用账号
3. 重试失败的请求
4. Web 界面实时显示账号状态变化

### 配置热重载

支持以下配置文件的热重载（无需重启服务）：

- `config/server-config.json` - 服务器配置（host/port 除外）
- `config/model-mapping.json` - 模型映射
- `config/kiro-accounts.json` - 账号配置

**工作原理：**

- **手动重载模式：** 系统默认采用手动触发重载机制，避免重复重载
- **Web 界面操作：** 通过 Web 管理界面添加/删除账号时，系统自动触发配置重载
- **API 手动触发：** 可调用 `POST /api/config/hot-reload` 手动触发重载
- **直接编辑文件：** 修改配置文件后，需要通过 Web 界面或 API 手动触发重载
- **深度合并：** 重载时自动与默认配置深度合并，确保配置完整性

**注意事项：**

- `host` 和 `port` 修改需要重启服务
- 修改配置文件时确保 JSON 格式正确
- 可查看 `logs/server-debug.log` 确认重载日志
- Web 界面添加/删除账号会自动触发重载，无需手动操作

## 🖥️ Web 管理界面

启动服务后访问 Web 管理界面（默认地址：`http://<host>:<port>`，根据配置文件决定），提供以下功能：

### 功能模块

- 📈 **状态概览 (Dashboard)**

  - 服务器运行状态和配置信息
  - 活跃账号数量和当前使用的账号
  - 配额使用情况（百分比显示）
  - 连接池状态和性能指标

- 👥 **账号管理 (Account Management)**

  - 查看所有账号的详细信息（邮箱、状态、使用率、优先级）
  - 测试账号连通性（发送测试请求验证）
  - 刷新账号 Token（重新获取认证令牌）
  - 查看账号错误信息和最后活动时间
  - 账号状态实时更新（active/error）

- ⚙️ **服务器配置 (Server Config)**

  - 查看当前服务器配置（只读）
  - 显示各项配置的详细信息
  - 配置修改请直接编辑 `config/server-config.json` 文件
  - 文件保存后自动热重载（host/port 除外）

- 🗺️ **模型映射 (Model Mappings)**

  - 查看当前所有 Claude → Kiro 模型映射
  - 添加/删除映射关系
  - 测试模型解析
  - 查询可用的 Kiro 模型列表

- 📋 **日志查看 (Log Viewer)**
  - 实时显示服务器日志
  - 支持查看不同类型日志文件
  - 自动刷新（可配置间隔）
  - 日志分类：server-debug、server-error、claude-code、kiro-api

### API 端点

| 端点                      | 方法 | 说明                         |
| ------------------------- | ---- | ---------------------------- |
| `/api/health`             | GET  | 健康检查                     |
| `/api/config`             | GET  | 获取服务器配置（只读）       |
| `/api/accounts`           | GET  | 获取所有账号信息             |
| `/api/accounts/:id/test`  | POST | 测试指定账号（发送测试请求） |
| `/api/accounts/:id/reset` | POST | 刷新账号 Token 并测试连通性  |
| `/api/models`             | GET  | 获取模型映射配置             |
| `/api/logs/:filename`     | GET  | 读取指定日志文件             |
| `/v1/messages`            | POST | Claude API 兼容端点（主要）  |

> 💡 配置修改通过直接编辑配置文件实现，系统自动监听文件变化并热重载

## 💡 使用示例

### 作为 Claude API 代理使用

```javascript
// 使用任何 Claude API 客户端库连接到本地代理
const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({
  apiKey: "any-key-works", // API key 可以是任意值
  baseURL: "http://localhost:3000", // 指向代理服务器地址（根据配置修改）
});

async function chat() {
  const message = await client.messages.create({
    model: "claude-3-5-sonnet-20241022", // 使用配置的模型映射
    max_tokens: 1024,
    messages: [{ role: "user", content: "你好，请介绍一下自己" }],
  });

  console.log(message.content[0].text);
}

chat();
```

### 直接使用 KiroClient

```javascript
const KiroClient = require("./src/KiroClient");

const client = new KiroClient("your_kiro_access_token");

async function chat() {
  const response = await client.chat("你好，请介绍一下自己");
  console.log(response);
}

async function listModels() {
  const models = await client.getAvailableModelIds();
  console.log("可用模型:", models);
}

chat();
```

### 流式响应示例

```javascript
// 将 URL 中的 localhost:3000 替换为您配置的服务器地址
const response = await fetch("http://localhost:3000/v1/messages", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "anthropic-version": "2023-06-01",
  },
  body: JSON.stringify({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 1024,
    stream: true,
    messages: [{ role: "user", content: "写一首诗" }],
  }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const chunk = decoder.decode(value);
  console.log(chunk); // 实时输出流式响应
}
```

### 工具调用 (Function Calling) 示例

```javascript
const message = await client.messages.create({
  model: "claude-3-5-sonnet-20241022",
  max_tokens: 1024,
  tools: [
    {
      name: "get_weather",
      description: "获取指定城市的天气信息",
      input_schema: {
        type: "object",
        properties: {
          city: { type: "string", description: "城市名称" },
        },
        required: ["city"],
      },
    },
  ],
  messages: [{ role: "user", content: "北京今天天气怎么样？" }],
});

// 处理工具调用请求
if (message.stop_reason === "tool_use") {
  const toolUse = message.content.find((block) => block.type === "tool_use");
  console.log("工具调用:", toolUse.name, toolUse.input);
}
```

## 🔒 安全建议

1. **保护敏感配置文件**

   - 不要将 `config/kiro-accounts.json` 提交到版本控制
   - `.gitignore` 已配置忽略此文件
   - 生产环境使用环境变量存储敏感信息

2. **Token 安全管理**

   - 定期刷新 Token（系统会自动刷新）
   - 监控 Token 过期时间
   - 发现异常立即重置账号

3. **网络安全**

   - 生产环境建议使用反向代理（Nginx）并配置 HTTPS
   - 限制 Web 管理界面的访问（通过防火墙或身份认证）
   - 配置合适的 CORS 策略

4. **资源限制**
   - 根据实际负载调整 `connectionPool` 配置
   - 设置合理的请求超时时间防止资源耗尽
   - 监控日志文件大小，定期清理旧日志

## 🐛 故障排查

### 常见问题

#### 1. 首次启动（无账号）

**情况：** 首次启动服务时，系统会自动创建空的配置文件

**操作步骤：**

1. 系统会自动创建 `config/kiro-accounts.json`（如果不存在）
2. 访问 Web 管理界面（地址根据配置文件的 `host` 和 `port` 决定）
3. 在"账号管理"页面添加第一个账号
4. 或者导入已有的账号配置文件

#### 2. 服务启动失败

**问题：** `Error: No valid accounts found`

**原因：** 配置文件中没有有效的账号

**解决方案：**

- 通过 Web 管理界面添加账号
- 确保至少有一个账号的 `status` 为 `"active"`
- 验证账号的 `credentials` 字段是否完整（accessToken、refreshToken、expiresAt）

#### 3. 账号无法连接

**症状：** 请求失败，Web 界面显示账号状态为 `error`

**排查步骤：**

- 查看 `logs/kiro-api.log` 获取详细错误信息
- 在 Web 界面点击"测试账号"按钮验证连通性
- 检查 Token 是否过期（查看 `expiresAt` 字段）
- 尝试点击"刷新 Token"按钮重新获取认证令牌

#### 4. 自动切换失败

**问题：** 错误时没有自动切换账号

**解决方案：**

- 确保 `server-config.json` 中 `autoSwitchOnError: true`
- 检查是否有其他可用账号（至少 2 个账号且状态为 `active`）
- 查看日志确认是否触发了故障检测逻辑

#### 5. 请求超时

**症状：** 请求长时间无响应

**解决方案：**

- 在 Web 界面或手动调整 `server-config.json` 中的超时配置：
  ```json
  {
    "connectionPool": {
      "requestTimeout": 60000, // 增加到 60 秒
      "socketTimeout": 90000 // 增加到 90 秒
    }
  }
  ```
- 检查网络连接状态
- 查看 Kiro API 是否正常（访问 `q.us-east-1.amazonaws.com`）

#### 6. 模型映射错误

**问题：** `Model not found` 或模型解析失败

**解决方案：**

- 运行 `npm run models` 查看当前映射
- 运行 `npm run models:list` 获取可用的 Kiro 模型 ID
- 在 Web 界面的"模型映射"页面添加或修改映射
- 确保 `model-mapping.json` 中有 `default` 映射

#### 7. 配置热重载不生效

**问题：** 修改配置文件后没有自动应用

**解决方案：**

- 检查配置文件 JSON 格式是否正确（可使用 JSON 验证工具）
- 确保文件已保存（检查编辑器是否自动保存）
- **手动触发重载：** 直接修改配置文件不会自动重载，需要：
  - 方式一：访问 Web 管理界面，调用配置重载功能
  - 方式二：通过 API 手动触发：`POST http://localhost:3000/api/config/hot-reload`
  - 方式三：通过 Web 界面添加/删除账号会自动触发重载
- 查看 `logs/server-debug.log` 确认是否有重载日志：
  ```
  🔄 配置热重载: kiro-accounts.json
  ✅ 账号配置已更新
  ```
- 刷新 Web 界面查看配置是否已更新
- **注意：** `host` 和 `port` 修改需要重启服务才能生效

### 日志文件说明

| 日志文件                | 内容                     | 用途                     |
| ----------------------- | ------------------------ | ------------------------ |
| `server-debug.log`      | 服务器一般日志           | 排查服务器配置和运行问题 |
| `server-error.log`      | 错误日志和堆栈跟踪       | 排查严重错误和崩溃       |
| `claude-code.log`       | Claude API 请求/响应详情 | 排查 API 请求问题        |
| `kiro-api.log`          | Kiro API 请求/响应详情   | 排查后端 API 调用问题    |
| `kiro-client-debug.log` | KiroClient 内部调试日志  | 排查连接和数据解析问题   |

### 获取帮助

如遇到未解决的问题，请：

1. 查看 `logs/` 目录下的相关日志文件
2. 在 GitHub 提交 Issue 并附上：
   - 错误日志（脱敏后）
   - 配置文件（脱敏后）
   - 复现步骤

## 📚 相关项目

本项目参考和借鉴了以下开源项目：

- [AIClient-2-API](https://github.com/justlovemaki/AIClient-2-API) - AI 客户端到 API 转换
- [cc-switch](https://github.com/farion1231/cc-switch) - 账号切换机制

## 🎯 技术架构

### 核心技术栈

- **运行时：** Node.js 18+
- **Web 框架：** Express.js 4.x
- **HTTP 客户端：** Axios
- **二进制解析：** CBOR
- **唯一 ID 生成：** UUID

### 数据流转

```
Client Request (Claude API格式)
    ↓
Express Server (/v1/messages)
    ↓
Request Translation (Claude → Kiro格式转换)
    ↓
Account Manager (选择最优账号)
    ↓
KiroClient (发送到 Kiro API)
    ↓
AWS Event Stream Parser (二进制流解析)
    ↓
Response Translation (Kiro → Claude格式转换)
    ↓
Client Response (SSE流式 / JSON)
```

### 关键转换

| Claude API             | Kiro API                             | 说明             |
| ---------------------- | ------------------------------------ | ---------------- |
| `messages`             | `conversationState`                  | 消息历史结构转换 |
| `tools[].input_schema` | `toolSpecification.inputSchema.json` | 工具定义转换     |
| `tool_result` blocks   | `toolResults` array                  | 工具执行结果转换 |
| Base64 image blocks    | `images` array                       | 图片数据转换     |
| SSE text/event-stream  | AWS Event Stream binary              | 流式响应格式转换 |

## 📄 开源协议

本项目遵循 [AGPL-3.0 开源协议](LICENSE)。

### 协议要点

- ✅ 可以自由使用、修改和分发本软件
- ✅ 可以用于商业用途
- ⚠️ 修改后的代码必须开源（AGPL 要求）
- ⚠️ 网络服务也需要开源代码（AGPL 特点）
- ⚠️ 必须保留原作者版权声明

## 🤝 贡献指南

欢迎参与项目贡献！

### 如何贡献

1. **提交 Issue**

   - 报告 Bug
   - 提出新功能建议
   - 提问和讨论

2. **提交 Pull Request**
   - Fork 本仓库
   - 创建功能分支 (`git checkout -b feature/AmazingFeature`)
   - 提交更改 (`git commit -m 'Add some AmazingFeature'`)
   - 推送到分支 (`git push origin feature/AmazingFeature`)
   - 开启 Pull Request

### 开发规范

- 遵循现有代码风格
- 添加适当的注释
- 更新相关文档
- 测试新功能

## 📞 联系与支持

### 问题反馈

- **GitHub Issues**: [提交 Issue](https://github.com/your-repo/issues)
- **Gitee Issues**: [提交 Issue](https://gitee.com/shangyuhang_gitee/krio_to_claude/issues)

### 项目相关

- **CLAUDE.md**: 开发者指南，详细的技术文档
- **config/README.md**: 配置文件说明文档
- **docs/**: 更多详细文档和截图

### 致谢

感谢所有为本项目做出贡献的开发者！

---

⭐ 如果这个项目对你有帮助，欢迎给个 Star！
