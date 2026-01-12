# Kiro API Tools 格式分析

## 1. 整体结构

### Kiro API 期望的格式
```json
{
  "toolSpecification": {
    "name": "toolName",
    "description": "...",
    "inputSchema": {
      "json": {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "type": "object",
        "properties": { ... },
        "required": [ ... ],
        "additionalProperties": false
      }
    }
  }
}
```

### Claude Code 发送的格式
```json
{
  "name": "toolName",
  "description": "...",
  "input_schema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": { ... },
    "required": [ ... ],
    "additionalProperties": false
  }
}
```

## 2. 关键差异

| 特性 | Kiro API | Claude Code |
|------|----------|-------------|
| 外层包装 | `toolSpecification: { ... }` | 直接是工具对象 |
| Schema 字段名 | `inputSchema.json` | `input_schema` |
| JSON Schema 版本 | `draft-07` | `draft-2020-12` |
| `$schema` URL | `http://json-schema.org/draft-07/schema#` | `https://json-schema.org/draft/2020-12/schema` |

## 3. JSON Schema draft-07 vs draft-2020-12 差异

### 3.1 可选参数表示方式

**Kiro (draft-07) - 使用 anyOf + not**:
```json
{
  "path": {
    "anyOf": [
      {
        "anyOf": [
          { "not": {} },
          { "type": "string", "description": "..." }
        ],
        "description": "..."
      },
      { "type": "null" }
    ],
    "description": "..."
  }
}
```

**Claude Code (draft-2020-12) - 简单类型**:
```json
{
  "path": {
    "type": "string",
    "description": "..."
  }
}
```

### 3.2 exclusiveMinimum/exclusiveMaximum

**draft-07**: 使用布尔值
```json
{
  "minimum": 0,
  "exclusiveMinimum": true
}
```

**draft-2020-12**: 使用数值
```json
{
  "exclusiveMinimum": 0
}
```

### 3.3 draft-2020-12 特有字段 (需要移除)
- `$id`
- `$vocabulary`
- `$dynamicAnchor`
- `$dynamicRef`
- `$comment`

## 4. 转换策略

### 4.1 已实现
1. ✅ 包装为 `toolSpecification`
2. ✅ `input_schema` → `inputSchema.json`
3. ✅ `$schema` 替换为 draft-07 URL
4. ✅ `exclusiveMinimum`/`exclusiveMaximum` 数值转布尔值

### 4.2 可能需要实现
1. ❓ 可选参数转换为 `anyOf + not + null` 结构
   - 这可能是导致 500 错误的原因
   - Kiro 可能严格验证 schema 格式

## 5. 建议的解决方案

### 方案 A: 完整转换可选参数格式
将 Claude Code 的简单可选参数转换为 Kiro 期望的 `anyOf` 结构：

```javascript
// 如果参数不在 required 中，转换为 anyOf 结构
if (!required.includes(propName)) {
  return {
    "anyOf": [
      {
        "anyOf": [
          { "not": {} },
          originalSchema
        ],
        "description": originalSchema.description
      },
      { "type": "null" }
    ],
    "description": originalSchema.description
  };
}
```

### 方案 B: 不传递 tools
让 Kiro 使用内置工具，然后在响应中转换工具调用格式。

### 方案 C: 简化 schema
移除所有复杂的 schema 验证，只保留基本结构。
