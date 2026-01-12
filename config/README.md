# 配置文件说明

## 目录结构

```
config/
├── kiro-auth-token.json          # 单账号模式的 Token 配置
├── kiro-auth-token.example.json  # Token 配置示例
├── kiro-accounts.json             # 多账号配置文件
├── model-mapping.json             # 模型映射配置
├── server-config.json             # 服务器配置
└── README.md                      # 本文件
```

## server-config.json

服务器运行时配置文件。

### 账号模式配置 ⭐ 新增

```json
{
  "account": {
    "multiAccountEnabled": true,  // 是否启用多账号模式
    "strategy": "auto",           // 账号选择策略
    "autoSwitchOnError": true     // 是否自动切换账号（额度不足时）
  }
}
```

#### 账号模式

- **单账号模式** (`multiAccountEnabled: false`)
  - 从 `kiro-auth-token.json` 读取 Token
  - 适合只有一个账号的情况
  
- **多账号模式** (`multiAccountEnabled: true`) ⭐ 推荐
  - 从 `kiro-accounts.json` 读取多个账号
  - 自动选择最佳账号
  - 支持账号轮换和负载均衡
  - 自动跳过错误/封禁账号
  - **自动切换账号**（额度不足时）⭐ 新增

#### 选择策略 (strategy)

- `auto`: 自动选择使用率最低的账号（推荐）
- `random`: 随机选择可用账号
- `first`: 始终使用第一个可用账号

#### 自动切换 (autoSwitchOnError) ⭐ 新增

- `true`: 当账号额度不足或出现错误时，自动切换到其他可用账号（推荐）
- `false`: 不自动切换，直接返回错误

**工作原理：**
1. 检测到额度不足或账号异常
2. 标记当前账号为 error
3. 选择下一个可用账号
4. 重试请求（最多 3 次）
5. 无缝切换，用户无感知

详见：[自动切换账号功能文档](../docs/auto-switch-account.md)

### 其他配置项

```json
{
  "server": {
    "host": "0.0.0.0",     // 监听地址，0.0.0.0 表示监听所有网卡
    "port": 3000           // 监听端口
  },
  
  "stream": {
    "chunkSize": 2         // 流式响应时每次发送的字符数，越小打字效果越流畅
  },
  
  "token": {
    "refreshRetryMax": 3,           // Token 刷新失败最大重试次数
    "refreshRetryIntervalMs": 60000, // 重试间隔（毫秒）
    "refreshBufferMinutes": 5        // 提前多少分钟刷新 Token
  },
  
  "connectionPool": {
    "maxSockets": 20,        // 最大并发连接数（到 Kiro API）
    "maxFreeSockets": 10,    // 空闲连接池大小（保持连接以便复用）
    "socketTimeout": 60000,  // 单个连接超时时间（毫秒）
    "requestTimeout": 30000  // 单个请求超时时间（毫秒）
  }
}
```

### 连接池配置详解

#### maxSockets（最大并发连接数）

控制同时可以向 Kiro API 发起多少个并发请求。

**推荐值**：
- 低并发场景（< 5 并发）：`10`
- 中等并发场景（5-15 并发）：`20` ⭐ 推荐
- 高并发场景（> 15 并发）：`30-50`

**注意**：
- 设置过小：并发请求会排队等待，响应变慢
- 设置过大：浪费系统资源，可能触发后端限流

#### maxFreeSockets（空闲连接池大小）

请求完成后保留多少个空闲连接，以便下次请求复用（避免 TCP/TLS 握手开销）。

**推荐值**：通常设置为 `maxSockets` 的 50%

**好处**：
- 减少连接建立时间（TCP 三次握手 + TLS 握手约 100-200ms）
- 提高响应速度
- 降低服务器负载

#### socketTimeout（连接超时）

单个 TCP 连接的超时时间。

**推荐值**：`60000`（60 秒）

**说明**：
- 如果 Kiro API 响应慢，可以适当增加
- 设置过小可能导致长时间请求被中断

#### requestTimeout（请求超时）

单个 HTTP 请求的超时时间。

**推荐值**：`30000`（30 秒）

**说明**：
- 如果经常处理大量数据或复杂请求，可以增加到 60000
- 设置过小可能导致正常请求被中断

### 性能调优建议

根据并发测试结果：

```
并发数 | maxSockets | 效率
2      | 20         | 117% ✅
4      | 20         | 85%  ✅
8      | 20         | 89%  ✅
16     | 20         | 88%  ✅
16     | 10         | 43%  ❌ 连接池不够
16     | 50         | 63%  ❌ 连接池过大
```

**结论**：`maxSockets: 20, maxFreeSockets: 10` 是最优配置。

## 单账号配置 (kiro-auth-token.json)

当 `multiAccountEnabled: false` 时使用此文件：

```json
{
  "accessToken": "your-access-token",
  "refreshToken": "your-refresh-token",
  "expiresAt": "2026-01-12T09:02:53.818Z",
  "authMethod": "social",
  "provider": "Google"
}
```

### 字段说明

- `accessToken`: 访问令牌，用于 API 请求认证
- `refreshToken`: 刷新令牌，用于自动更新过期的 accessToken
- `expiresAt`: Token 过期时间（ISO 8601 格式）
- `authMethod`: 认证方式（通常是 "social"）
- `provider`: 认证提供商（如 "Google"）

## 多账号配置 (kiro-accounts.json) ⭐ 新增

当 `multiAccountEnabled: true` 时使用此文件。

### 账号状态

- `active`: 可用账号，会被自动选择
- `error`: 错误状态，不会被选择（通常是 Token 过期或账号被封禁）

### 账号选择逻辑

1. 过滤出所有 `status: "active"` 的账号
2. 根据 `strategy` 选择最佳账号：
   - `auto`: 选择 `usage.percentUsed` 最低的账号
   - `random`: 随机选择
   - `first`: 选择第一个
3. 自动刷新 Token（如果即将过期）

### 示例结构

```json
{
  "accounts": [
    {
      "email": "user@example.com",
      "userId": "d-xxx.xxx",
      "status": "active",
      "credentials": {
        "accessToken": "...",
        "refreshToken": "...",
        "expiresAt": 1768211890879
      },
      "usage": {
        "current": 43.44,
        "limit": 550,
        "percentUsed": 0.079
      }
    }
  ]
}
```

## model-mapping.json

模型 ID 映射配置，用于将 Claude API 的模型 ID 映射到 Kiro API 的模型 ID。

```json
{
  "defaultModel": "claude-sonnet-4.5",
  "mappings": {
    "claude-3-5-sonnet-20241022": "claude-sonnet-4.5",
    "claude-3-5-haiku-20241022": "claude-haiku-4.5",
    "claude-opus-4-20250514": "claude-opus-4.5"
  }
}
```

## 快速开始

### 使用单账号模式

1. 编辑 `server-config.json`：
   ```json
   {
     "account": {
       "multiAccountEnabled": false
     }
   }
   ```

2. 配置 `kiro-auth-token.json`

3. 启动服务器：
   ```bash
   npm run server
   ```

### 使用多账号模式 ⭐ 推荐

1. 编辑 `server-config.json`：
   ```json
   {
     "account": {
       "multiAccountEnabled": true,
       "strategy": "auto"
     }
   }
   ```

2. 确保 `kiro-accounts.json` 中有可用账号（`status: "active"`）

3. 启动服务器：
   ```bash
   npm run server
   ```

4. 查看日志确认账号选择：
   ```
   🔄 多账号模式已启用，正在选择最佳账号...
   📌 选择账号: user@example.com (使用率: 7.9%)
   ✅ 已选择账号: user@example.com
      用户ID: d-xxx.xxx
      使用率: 7.9%
      额度: 43.44/550
   ```

## 修改配置后

修改配置文件后，需要**重启服务器**才能生效：

```bash
# 停止服务器（Ctrl+C）
# 重新启动
npm run server
```

启动时会看到日志：
```
✅ 加载服务器配置: host=0.0.0.0, port=3000, chunkSize=2
   Token 刷新配置: 最大重试=3次, 重试间隔=60000ms, 提前刷新=5分钟
   连接池配置: maxSockets=20, maxFreeSockets=10, socketTimeout=60000ms
   账号配置: 多账号模式=启用, 策略=auto
✅ Kiro 客户端初始化成功
```

## 监控连接池状态

访问健康检查端点查看实时连接池状态：

```bash
curl http://localhost:3000/health
```

返回示例：
```json
{
  "status": "ok",
  "service": "kiro-claude-api",
  "connectionPool": {
    "totalSockets": 3,      // 当前活跃连接数
    "freeSockets": 2,       // 当前空闲连接数
    "pendingRequests": 0,   // 等待连接的请求数 ⚠️ 如果 > 0 说明需要增加 maxSockets
    "maxSockets": 20,
    "maxFreeSockets": 10
  }
}
```

**关键指标**：
- `pendingRequests > 0`：说明连接池不够用，需要增加 `maxSockets`
- `totalSockets` 接近 `maxSockets`：说明并发压力大
- `freeSockets > 0`：说明有空闲连接可复用

## 注意事项

- **安全性**: Token 配置文件包含敏感信息，不要提交到版本控制系统
- **自动更新**: Token 会自动刷新，配置文件会自动更新，无需手动维护
- **多账号优势**: 可以充分利用多个账号的额度，避免单账号限流
- **日志查看**: 所有操作都会记录在 `logs/` 目录中
