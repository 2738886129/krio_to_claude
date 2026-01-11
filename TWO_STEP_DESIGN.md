# 两步式对话设计 (Two-Step Intent Classification Design)

## 概述

KiroClient 现已实现与真实 Kiro IDE 相同的两步式对话设计，通过意图分类优化请求处理流程。

## 工作原理

### 传统单步式 vs 新的两步式

```
┌─────────────────────────────────────────────────────────┐
│ 单步式 (chat)                                            │
├─────────────────────────────────────────────────────────┤
│ 用户消息 → [手动指定模式和模型] → API 请求 → 响应       │
│                                                         │
│ 缺点:                                                   │
│ - 需要手动选择模型                                       │
│ - 无法根据意图优化                                       │
│ - 可能使用过大的模型浪费成本                              │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ 两步式 (chatWithIntent)                                 │
├─────────────────────────────────────────────────────────┤
│ 步骤 1: 意图分类                                         │
│   用户消息 → [simple-task 模型分类]                      │
│   → {"chat": 1.0, "do": 0.0, "spec": 0.0}              │
│                                                         │
│ 步骤 2: 智能路由                                         │
│   根据分类结果:                                          │
│   - 选择合适的 agentTaskType (vibe/task-execution/spec) │
│   - 选择合适的模型 (haiku/sonnet)                        │
│   - 发送主对话请求                                       │
│                                                         │
│ 优点:                                                   │
│ ✓ 自动选择最佳模型                                       │
│ ✓ 节省成本（聊天用小模型）                                │
│ ✓ 提升效率（任务执行用大模型）                             │
└─────────────────────────────────────────────────────────┘
```

## API 使用

### 方法 1: 单步式（原有方式）

适用于：已知需要的模式和模型

```javascript
const result = await client.chat("你好", {
  agentTaskType: "vibe",
  modelId: "simple-task",
  onChunk: (chunk) => {
    if (chunk.type === "content") {
      process.stdout.write(chunk.data);
    }
  },
});
```

### 方法 2: 两步式（智能选择）

适用于：让系统自动判断和优化

```javascript
const result = await client.chatWithIntent("帮我写一个函数", {
  onIntentClassified: ({ status, intent }) => {
    if (status === "classified") {
      console.log(`意图: chat=${intent.chat}, do=${intent.do}, spec=${intent.spec}`);
    }
  },
  onChunk: (chunk) => {
    if (chunk.type === "content") {
      process.stdout.write(chunk.data);
    }
  },
});
```

### 方法 3: 仅进行意图分类

```javascript
const intent = await client.classifyIntent("创建一个登录功能的规范");
// 返回: { chat: 0.0, do: 0.2, spec: 0.8 }

// 然后可以根据分类结果自定义处理
if (intent.spec > 0.5) {
  console.log("用户想创建规范");
}
```

## 意图分类结果

### Chat 模式 (chat > 0.5)

**特征**: 普通聊天、问候、提问

**示例**:
- "你好"
- "今天天气怎么样？"
- "JavaScript 中的闭包是什么？"

**自动选择**:
- agentTaskType: `vibe`
- modelId: `claude-haiku-4.5` (更快、更便宜)

### Do 模式 (do > 0.5)

**特征**: 请求执行任务、写代码、修改文件

**示例**:
- "帮我写一个计算斐波那契的函数"
- "创建一个 React 组件"
- "修复这个 bug"

**自动选择**:
- agentTaskType: `task-execution`
- modelId: `claude-sonnet-4.5` (更强大)

### Spec 模式 (spec > 0.5)

**特征**: 明确要求创建规范文档

**示例**:
- "创建一个用户登录功能的规范"
- "生成 API 接口的 spec"
- "为这个功能写一个详细的规范"

**自动选择**:
- agentTaskType: `spec-creation`
- modelId: `claude-sonnet-4.5`

## 成本对比

假设场景：用户发送 10 条消息，其中 6 条聊天，4 条任务

### 单步式（全部使用 claude-sonnet-4.5）

```
10 次请求 × claude-sonnet-4.5 费率
= 较高成本
```

### 两步式（智能分类）

```
10 次意图分类 × simple-task 费率（很低）
+ 6 次聊天 × claude-haiku-4.5 费率（较低）
+ 4 次任务 × claude-sonnet-4.5 费率（较高）
= 总成本约降低 40-60%
```

## 新增方法说明

### `classifyIntent(message, options)`

仅进行意图分类，不发送主对话。

**参数**:
- `message`: 用户消息
- `options.conversationId`: 可选的会话 ID

**返回值**:
```javascript
{
  chat: 0.0,  // 0-1 之间的浮点数
  do: 0.9,    // 0-1 之间的浮点数
  spec: 0.1   // 0-1 之间的浮点数
}
// 三个值总和为 1
```

### `chatWithIntent(message, options)`

两步式对话：先分类，再发送。

**参数**:
- `message`: 用户消息
- `options.onIntentClassified`: 意图分类完成回调
- `options.onChunk`: 响应数据流回调
- `options.agentTaskType`: 可选，覆盖自动选择
- `options.modelId`: 可选，覆盖自动选择
- 其他选项同 `chat()` 方法

**回调示例**:
```javascript
onIntentClassified: ({ status, intent }) => {
  if (status === 'classifying') {
    console.log('正在分类...');
  } else if (status === 'classified') {
    console.log('分类完成:', intent);
  }
}
```

## 运行示例

```bash
# 运行两步式对话示例
node example.js

# 查看示例 7: 测试不同类型的消息
# 查看示例 8: 对比单步与两步的差异
```

## 技术实现细节

### 意图分类请求头

```javascript
{
  'x-amzn-kiro-agent-mode': 'intent-classification',
  'x-amzn-codewhisperer-optout': 'true'
}
```

### 意图分类 System Prompt

使用特殊的 system prompt 引导模型返回 JSON 格式的分类结果，包含详细的分类规则和示例。

### 响应解析

处理流式响应的片段化 JSON，支持：
- 完整 JSON: `{"chat": 1.0, "do": 0.0, "spec": 0.0}`
- 片段化: `{\ → chat\ → : 1 → .0 → ...}`

### 智能路由逻辑

```javascript
_selectAgentMode(intent) {
  if (intent.spec > 0.5) return 'spec-creation';
  if (intent.do > 0.5) return 'task-execution';
  return 'vibe'; // chat 模式
}

_selectModel(intent) {
  if (intent.chat > 0.8) return 'claude-haiku-4.5';  // 纯聊天用小模型
  return 'claude-sonnet-4.5';  // 任务执行用大模型
}
```

## 兼容性

- ✅ 保留原有 `chat()` 方法，向后兼容
- ✅ 新增 `chatWithIntent()` 方法，可选使用
- ✅ 独立的 `classifyIntent()` 方法，灵活使用

## 总结

两步式设计实现了：

1. **成本优化**: 根据意图选择合适的模型
2. **智能路由**: 自动选择最佳的处理模式
3. **灵活使用**: 支持单步和两步两种方式
4. **透明过程**: 通过回调展示分类过程

这与真实的 Kiro IDE 实现完全一致！🎉
