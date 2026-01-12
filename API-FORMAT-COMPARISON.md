# Claude API vs Kiro API 格式对比

## 1. 请求结构对比

### Claude API 请求格式
```json
{
  "model": "claude-sonnet-4-5-20250929",
  "max_tokens": 4096,
  "stream": true,
  "system": "You are a helpful assistant...",
  "messages": [
    { "role": "user", "content": "Hello" },
    { "role": "assistant", "content": "Hi there!" },
    { "role": "user", "content": "..." }
  ],
  "tools": [...]
}
```

### Kiro API 请求格式
```json
{
  "conversationState": {
    "agentTaskType": "vibe",
    "chatTriggerType": "MANUAL",
    "conversationId": "uuid",
    "currentMessage": {
      "userInputMessage": {
        "content": "当前用户消息",
        "modelId": "claude-sonnet-4.5",
        "origin": "AI_EDITOR",
        "userInputMessageContext": {
          "tools": [...],
          "toolResults": [...]
        }
      }
    },
    "history": [...]
  }
}
```

---

## 2. 消息格式对比

### Claude API 消息
```json
// 用户消息
{ "role": "user", "content": "Hello" }

// 助手消息
{ "role": "assistant", "content": "Hi!" }

// 带工具调用的助手消息
{
  "role": "assistant",
  "content": [
    { "type": "text", "text": "Let me read that file." },
    { "type": "tool_use", "id": "toolu_xxx", "name": "Read", "input": {...} }
  ]
}

// 工具结果消息
{
  "role": "user",
  "content": [
    { "type": "tool_result", "tool_use_id": "toolu_xxx", "content": "file content..." }
  ]
}
```

### Kiro API 历史消息
```json
// 用户消息
{
  "userInputMessage": {
    "content": "Hello",
    "modelId": "claude-sonnet-4.5",
    "origin": "AI_EDITOR"
  }
}

// 助手消息
{
  "assistantResponseMessage": {
    "content": "Hi!"
  }
}

// 带工具调用的助手消息
{
  "assistantResponseMessage": {
    "content": "Let me read that file.",
    "toolUses": [
      {
        "name": "Read",
        "toolUseId": "tooluse_xxx",
        "input": {...}
      }
    ]
  }
}

// 工具结果（在 userInputMessage 中）
{
  "userInputMessage": {
    "content": "",
    "modelId": "claude-sonnet-4.5",
    "origin": "AI_EDITOR",
    "userInputMessageContext": {
      "toolResults": [
        {
          "toolUseId": "tooluse_xxx",
          "status": "success",
          "content": [{ "text": "file content..." }]
        }
      ]
    }
  }
}
```

---

## 3. Tools 格式对比

### Claude API Tools
```json
{
  "name": "Read",
  "description": "Reads a file...",
  "input_schema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": {
      "file_path": {
        "type": "string",
        "description": "The file path"
      }
    },
    "required": ["file_path"]
  }
}
```

### Kiro API Tools
```json
{
  "toolSpecification": {
    "name": "Read",
    "description": "Reads a file...",
    "inputSchema": {
      "json": {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "type": "object",
        "properties": {
          "file_path": {
            "type": "string",
            "description": "The file path"
          }
        },
        "required": ["file_path"],
        "additionalProperties": false
      }
    }
  }
}
```

**关键差异：**
| 项目 | Claude API | Kiro API |
|------|-----------|----------|
| 包装 | 直接对象 | `toolSpecification` 包装 |
| Schema 字段 | `input_schema` | `inputSchema.json` |
| JSON Schema 版本 | draft-2020-12 | draft-07 |
| description 长度 | 无限制 | **约 5000 字符限制** |

---

## 4. Tool Use 响应格式对比

### Claude API 响应（流式）
```
event: content_block_start
data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_xxx","name":"Read","input":{}}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"file_path\":\"test.js\"}"}}

event: content_block_stop
data: {"type":"content_block_stop","index":1}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}
```

### Kiro API 响应（AWS Event Stream 二进制）
```json
// 文本内容
{"content": "Let me read that file."}

// 工具调用开始
{"name": "Read", "toolUseId": "tooluse_xxx"}

// 工具调用参数（流式累积）
{"input": "{\"file_", "name": "Read", "toolUseId": "tooluse_xxx"}
{"input": "path\":", "name": "Read", "toolUseId": "tooluse_xxx"}
{"input": " \"test.js\"}", "name": "Read", "toolUseId": "tooluse_xxx"}

// 工具调用结束
{"name": "Read", "stop": true, "toolUseId": "tooluse_xxx"}

// 费用信息
{"unit": "credit", "usage": 0.05}
{"contextUsagePercentage": 7.5}
```

---

## 5. Tool Result 格式对比

### Claude API Tool Result
```json
{
  "type": "tool_result",
  "tool_use_id": "toolu_xxx",
  "content": "file content here...",
  "is_error": false
}
```

### Kiro API Tool Result
```json
{
  "toolUseId": "tooluse_xxx",
  "status": "success",  // 或 "error"
  "content": [
    { "text": "file content here..." }
  ]
}
```

**关键差异：**
| 项目 | Claude API | Kiro API |
|------|-----------|----------|
| ID 字段 | `tool_use_id` | `toolUseId` |
| 错误标识 | `is_error: true` | `status: "error"` |
| 内容格式 | 字符串或数组 | `content: [{text: "..."}]` |

---

## 6. System Prompt 处理

### Claude API
```json
{
  "system": "You are a helpful assistant...",
  // 或
  "system": [
    { "type": "text", "text": "Part 1..." },
    { "type": "text", "text": "Part 2..." }
  ]
}
```

### Kiro API
System prompt 作为历史记录的第一对消息：
```json
{
  "history": [
    {
      "userInputMessage": {
        "content": "You are a helpful assistant...",
        "modelId": "claude-sonnet-4.5",
        "origin": "AI_EDITOR"
      }
    },
    {
      "assistantResponseMessage": {
        "content": "I will follow these instructions."
      }
    }
  ]
}
```

---

## 7. 模型 ID 映射

| Claude API | Kiro API |
|------------|----------|
| `claude-sonnet-4-5-20250929` | `claude-sonnet-4.5` |
| `claude-haiku-4-5-20251001` | `claude-haiku-4.5` |
| `claude-opus-4-5-*` | `claude-opus-4.5` |

---

## 8. 响应协议对比

| 项目 | Claude API | Kiro API |
|------|-----------|----------|
| 协议 | SSE (text/event-stream) | AWS Event Stream (二进制) |
| 格式 | `event: xxx\ndata: {...}\n\n` | 二进制帧：`[总长度][headers长度][CRC][headers][payload][CRC]` |
| 解析 | 文本正则匹配 | 二进制 Buffer 解析 |

---

## 9. 转换要点总结

1. **Tools 转换**：
   - 包装为 `toolSpecification`
   - `input_schema` → `inputSchema.json`
   - 截断 description 到 5000 字符以内
   - 使用 JSON Schema draft-07

2. **历史记录转换**：
   - `role: user` → `userInputMessage`
   - `role: assistant` → `assistantResponseMessage`
   - `tool_use` → `toolUses` 数组
   - `tool_result` → `userInputMessageContext.toolResults`

3. **响应转换**：
   - 解析 AWS Event Stream 二进制格式
   - 累积工具调用的 `input` 字段
   - 转换为 Claude API 的 SSE 格式

4. **ID 格式**：
   - Claude: `toolu_xxx`
   - Kiro: `tooluse_xxx`


---

## 10. 图片（多模态）格式对比

### Claude API 图片格式
```json
{
  "role": "user",
  "content": [
    {
      "type": "image",
      "source": {
        "type": "base64",
        "media_type": "image/jpeg",
        "data": "base64编码的图片数据..."
      }
    },
    {
      "type": "text",
      "text": "这张图片里有什么？"
    }
  ]
}
```

### Kiro API 图片格式
```json
{
  "userInputMessage": {
    "content": "这张图片里有什么？",
    "images": [
      {
        "format": "jpeg",
        "source": {
          "bytes": "base64编码的图片数据..."
        }
      }
    ],
    "modelId": "claude-opus-4.5",
    "origin": "AI_EDITOR"
  }
}
```

**关键差异：**
| 项目 | Claude API | Kiro API |
|------|-----------|----------|
| 图片位置 | `content` 数组中的 block | 独立的 `images` 数组 |
| 格式字段 | `media_type: "image/jpeg"` | `format: "jpeg"` |
| 数据字段 | `source.data` | `source.bytes` |
| 类型标识 | `source.type: "base64"` | 无（默认 base64） |

**支持的图片格式：**
- jpeg / jpg
- png
- gif
- webp

**转换逻辑：**
1. 从 `media_type` 提取格式（如 `image/jpeg` → `jpeg`）
2. 将 `source.data` 映射到 `source.bytes`
3. 图片从 `content` 数组提取到独立的 `images` 数组


---

## 11. 错误码映射

### Claude API 错误类型
| HTTP 状态码 | 错误类型 | 说明 |
|------------|---------|------|
| 400 | `invalid_request_error` | 请求格式错误 |
| 401 | `authentication_error` | 认证失败 |
| 403 | `permission_error` | 权限不足 |
| 404 | `not_found_error` | 资源不存在 |
| 429 | `rate_limit_error` | 请求过于频繁 |
| 500 | `api_error` | 服务器内部错误 |
| 503 | `overloaded_error` | 服务过载 |

### 错误响应格式
```json
{
  "type": "error",
  "error": {
    "type": "invalid_request_error",
    "message": "具体错误信息"
  }
}
```

### Kiro 错误到 Claude 错误的映射逻辑
1. 从 Kiro 错误消息中提取 HTTP 状态码
2. 根据状态码映射到对应的 Claude 错误类型
3. 特殊关键词检测：
   - `token`/`unauthorized` → `authentication_error`
   - `rate limit`/`too many` → `rate_limit_error`
   - `not found` → `not_found_error`
   - `permission`/`forbidden` → `permission_error`
   - `overloaded`/`capacity` → `overloaded_error`

---

## 12. Token 计数

### Kiro API 返回的计数字段
```json
{
  "inputTokenCount": 1234,
  "outputTokenCount": 567,
  "usage": 0.05,
  "contextUsagePercentage": 7.5
}
```

### 转换为 Claude API 格式
```json
{
  "usage": {
    "input_tokens": 1234,
    "output_tokens": 567
  }
}
```

### 回退估算逻辑
如果 Kiro 未返回精确的 token 计数：
- `input_tokens`: 从 `usage` (credit) 估算，约 `usage * 2000`
- `output_tokens`: 从输出字符数估算，约 `字符数 / 4`

---

## 13. 流式工具调用

### Claude API 流式工具调用事件序列
```
1. message_start
2. content_block_start (index=0, type=text)
3. content_block_delta (text_delta) × N
4. content_block_stop (index=0)
5. content_block_start (index=1, type=tool_use)
6. content_block_delta (input_json_delta) × N
7. content_block_stop (index=1)
8. message_delta (stop_reason=tool_use)
9. message_stop
```

### Kiro API 流式工具调用格式
```json
// 工具调用开始
{"name": "readFile", "toolUseId": "tooluse_xxx"}

// 输入增量（多次）
{"name": "readFile", "toolUseId": "tooluse_xxx", "input": "{\"path\":"}
{"name": "readFile", "toolUseId": "tooluse_xxx", "input": "\"test.js\"}"}

// 工具调用结束
{"name": "readFile", "toolUseId": "tooluse_xxx", "stop": true}
```

### 转换回调类型
| Kiro 事件 | 转换后的回调类型 |
|----------|----------------|
| 首次出现 toolUseId | `tool_use_start` |
| input 字段增量 | `tool_use_delta` |
| stop: true | `tool_use_stop` |
