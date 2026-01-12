# Kiro API Client

用于调用真实 Kiro AI API (Amazon Q Developer) 的 Node.js 客户端。

## 功能特性

- ✅ 完整封装 Kiro API 所有端点
- ✅ 支持 SSE 流式响应
- ✅ 自动处理请求头和认证
- ✅ 多轮对话支持
- ✅ 错误处理
- ✅ 简洁的 API 设计

## 安装

```bash
cd E:\TestPoxy\TestSimple
npm install
```

## 快速开始

### 1. 获取 Bearer Token

你需要先从 Kiro 应用中获取 Bearer Token。

**方法 1: 使用 mitmproxy 捕获**

```bash
# 启动 mitmproxy
mitmproxy -p 8080

# 配置 Kiro 应用使用代理 127.0.0.1:8080
# 发送一条消息，从流量中找到 Authorization 头
# 格式: Bearer <token>:<signature>
```

**方法 2: 从配置文件读取**

检查以下位置的配置文件:
- Windows: `%APPDATA%\Kiro\`
- macOS: `~/Library/Application Support/Kiro/`
- Linux: `~/.config/Kiro/`

查找包含 token 的 JSON 文件（如 `credentials.json`, `session.json`）。

### 2. 初始化客户端

```javascript
const KiroClient = require('./KiroClient');

const client = new KiroClient('YOUR_BEARER_TOKEN_HERE');
```

### 3. 调用 API

```javascript
// 获取配额信息
const usage = await client.getUsageLimits();
console.log('剩余 credits:', await client.getRemainingCredits());

// 获取可用模型
const models = await client.listAvailableModels();

// 发送消息（流式）
const result = await client.chat('你好', {
  modelId: 'claude-sonnet-4.5',
  onChunk: (chunk) => {
    if (chunk.type === 'content') {
      process.stdout.write(chunk.data); // 实时打印
    }
  }
});

console.log('费用:', result.metering.usage, 'credits');
```

## API 文档

### 类: `KiroClient`

#### 构造函数

```javascript
new KiroClient(bearerToken, options)
```

**参数:**
- `bearerToken` (string) - 必需，从 Kiro 应用获取的 Bearer Token
- `options` (object) - 可选配置
  - `baseURL` (string) - API 基础 URL，默认: `https://q.us-east-1.amazonaws.com`
  - `timeout` (number) - 请求超时时间（毫秒），默认: 30000
  - `userAgent` (string) - 自定义 User-Agent

#### 方法

##### `getUsageLimits(params)`

获取用户配额信息。

```javascript
const usage = await client.getUsageLimits();
console.log(usage.usageBreakdownList[0].freeTrialInfo);
```

**返回:**
```json
{
  "subscriptionInfo": {
    "subscriptionTitle": "KIRO FREE",
    "type": "Q_DEVELOPER_STANDALONE_FREE"
  },
  "usageBreakdownList": [{
    "freeTrialInfo": {
      "currentUsage": 413.96,
      "usageLimit": 500,
      "freeTrialStatus": "ACTIVE"
    }
  }]
}
```

##### `listAvailableModels(params)`

获取可用的 AI 模型列表。

```javascript
const models = await client.listAvailableModels();
models.models.forEach(m => {
  console.log(m.modelName, m.rateMultiplier);
});
```

**返回:**
```json
{
  "defaultModel": { "modelId": "auto", "modelName": "Auto" },
  "models": [
    {
      "modelId": "claude-sonnet-4.5",
      "modelName": "Claude Sonnet 4.5",
      "rateMultiplier": 1.3,
      "tokenLimits": { "maxInputTokens": 200000 }
    }
  ]
}
```

##### `chat(message, options)`

简化的对话接口，发送消息并获取 AI 回复。

```javascript
const result = await client.chat('写一个排序算法', {
  modelId: 'claude-sonnet-4.5',
  conversationId: 'conversation-123', // 可选，用于多轮对话
  history: [],                        // 可选，历史消息
  onChunk: (chunk) => {               // 可选，流式回调
    if (chunk.type === 'content') {
      console.log(chunk.data);
    }
  }
});

console.log(result.content);        // 完整内容
console.log(result.metering.usage); // 费用
```

**Options 参数:**
- `modelId` (string) - 模型 ID，默认: `'simple-task'`
  - 可选值: `'auto'`, `'simple-task'`, `'claude-haiku-4.5'`, `'claude-sonnet-4.5'`, `'claude-opus-4.5'`
- `conversationId` (string) - 对话 ID，用于多轮对话
- `history` (array) - 历史消息数组
- `onChunk` (function) - 流式数据回调函数
- `agentTaskType` (string) - 任务类型，默认: `'vibe'`
- `origin` (string) - 来源，默认: `'AI_EDITOR'`

**返回:**
```javascript
{
  content: "完整的 AI 回复内容",
  metering: {
    unit: "credit",
    unitPlural: "credits",
    usage: 0.0065
  },
  contextUsage: {
    contextUsagePercentage: 0.48
  }
}
```

##### `generateAssistantResponse(conversationState, onChunk)`

底层 API，完全控制对话状态。

```javascript
const conversationState = {
  agentTaskType: 'vibe',
  chatTriggerType: 'MANUAL',
  conversationId: 'uuid-here',
  currentMessage: {
    userInputMessage: {
      content: '你的消息',
      modelId: 'claude-sonnet-4.5',
      origin: 'AI_EDITOR',
      userInputMessageContext: {}
    }
  },
  history: []
};

const result = await client.generateAssistantResponse(
  conversationState,
  (chunk) => console.log(chunk)
);
```

##### `getRemainingCredits()`

快捷方法：获取剩余 credits。

```javascript
const remaining = await client.getRemainingCredits();
console.log('剩余:', remaining, 'credits');
```

##### `getSubscriptionInfo()`

快捷方法：获取订阅信息。

```javascript
const info = await client.getSubscriptionInfo();
console.log('订阅类型:', info.subscriptionTitle);
```

## 使用示例

### 示例 1: 检查配额

```javascript
const client = new KiroClient('YOUR_TOKEN');

const usage = await client.getUsageLimits();
const trial = usage.usageBreakdownList[0].freeTrialInfo;

console.log(`已使用: ${trial.currentUsage}/${trial.usageLimit} credits`);
console.log(`剩余: ${trial.usageLimit - trial.currentUsage} credits`);
```

### 示例 2: 简单问答

```javascript
const result = await client.chat('什么是递归？', {
  modelId: 'claude-haiku-4.5', // 使用便宜的模型
  onChunk: (chunk) => {
    if (chunk.type === 'content') {
      process.stdout.write(chunk.data);
    }
  }
});

console.log('\n费用:', result.metering.usage, 'credits');
```

### 示例 3: 多轮对话

```javascript
const { v4: uuidv4 } = require('uuid');

const conversationId = uuidv4();
const history = [];

// 第一轮
let result = await client.chat('我想学 Python', {
  conversationId,
  history
});

history.push({
  userMessage: { content: '我想学 Python' },
  assistantMessage: { content: result.content }
});

// 第二轮
result = await client.chat('从哪里开始？', {
  conversationId,
  history
});
```

### 示例 4: 比较不同模型

```javascript
const models = ['claude-haiku-4.5', 'claude-sonnet-4.5', 'claude-opus-4.5'];
const message = '解释量子计算';

for (const modelId of models) {
  const start = Date.now();
  const result = await client.chat(message, { modelId });
  const time = Date.now() - start;

  console.log(`模型: ${modelId}`);
  console.log(`费用: ${result.metering.usage} credits`);
  console.log(`时间: ${time}ms`);
  console.log('---');
}
```

### 示例 5: 代码生成

```javascript
const result = await client.chat(
  '写一个 Node.js Express 服务器，包含 /api/users 路由',
  {
    modelId: 'claude-sonnet-4.5',
    onChunk: (chunk) => {
      if (chunk.type === 'content') {
        process.stdout.write(chunk.data);
      } else if (chunk.type === 'metering') {
        console.log('\n费用:', chunk.data.usage, 'credits');
      }
    }
  }
);
```

## 运行示例代码

```bash
# 编辑 example.js，填入你的 Bearer Token
npm test

# 或直接运行
node example.js
```

## 模型选择建议

| Model ID | 费率 | 适用场景 |
|----------|------|----------|
| `simple-task` | 0.3x | 简单问答、翻译 |
| `claude-haiku-4.5` | 0.4x | 常规编程问题、代码审查 |
| `claude-sonnet-4.5` | 1.3x | 复杂代码生成、架构设计 |
| `claude-opus-4.5` | 2.2x | 高难度算法、研究级问题 |
| `auto` | 1.0x | 自动选择（推荐） |

## 错误处理

```javascript
try {
  const result = await client.chat('你好');
  console.log(result.content);
} catch (error) {
  if (error.message.includes('401')) {
    console.error('Token 无效或已过期');
  } else if (error.message.includes('429')) {
    console.error('请求过于频繁，请稍后重试');
  } else {
    console.error('API 错误:', error.message);
  }
}
```

## 注意事项

1. **Token 安全**
   - 不要将 token 提交到 Git 仓库
   - 使用环境变量存储: `process.env.KIRO_TOKEN`

2. **费用控制**
   - 定期检查剩余 credits
   - 优先使用低费率模型（haiku）
   - 避免在循环中调用 API

3. **速率限制**
   - API 可能有速率限制
   - 建议请求间隔 >= 1 秒

4. **Token 过期**
   - Bearer Token 可能会过期
   - 需要定期从 Kiro 应用重新获取

## 目录结构

```
TestSimple/
├── KiroClient.js      # API 客户端类（核心）
├── example.js         # 使用示例
├── package.json       # 项目配置
├── README.md          # 本文档
└── .gitignore         # Git 忽略文件
```

## 进阶用法

### 使用环境变量

创建 `.env` 文件:
```
KIRO_BEARER_TOKEN=your_token_here
```

代码中使用:
```javascript
require('dotenv').config();
const client = new KiroClient(process.env.KIRO_BEARER_TOKEN);
```

### 自定义配置

```javascript
const client = new KiroClient(token, {
  baseURL: 'https://q.us-east-1.amazonaws.com',
  timeout: 60000, // 60秒超时
  userAgent: 'MyCustomApp/1.0.0'
});
```

### 流式处理大响应

```javascript
let buffer = '';

await client.chat('写一篇长文', {
  onChunk: (chunk) => {
    if (chunk.type === 'content') {
      buffer += chunk.data;

      // 实时保存到文件
      fs.appendFileSync('output.txt', chunk.data);
    }
  }
});
```

## 日志文件

服务器运行时会生成两个日志文件：

- `server-debug.log` - 记录所有调试信息和请求日志
- `server-error.log` - 单独记录错误信息，包含详细的错误堆栈

错误日志格式：
```
[2026-01-11T12:34:56.789Z] ❌ 错误描述
错误详情: 具体错误消息
堆栈跟踪:
Error: ...
    at ...
```

## 故障排查

**问题: 401 Unauthorized**
- 检查 Bearer Token 是否正确
- Token 可能已过期，重新获取

**问题: 超时**
- 增加 timeout 配置
- 检查网络连接

**问题: 费用异常高**
- 检查使用的模型 ID
- Opus 模型费率为 2.2x，成本较高

**问题: 查看错误详情**
- 检查 `server-error.log` 文件
- 包含完整的错误堆栈信息

## 许可证

MIT

## 相关文档

- [KIRO_API_DOCUMENTATION.md](../KIRO_API_DOCUMENTATION.md) - 完整 API 文档
- [generateAssistantResponse_SPEC.md](../generateAssistantResponse_SPEC.md) - 详细规范
