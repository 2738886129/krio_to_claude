# 配置文件说明

## server-config.json

服务器运行时配置文件。

### 配置项说明

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

### 修改配置后

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
✅ Kiro 客户端初始化成功
```

### 监控连接池状态

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

## model-mapping.json

模型 ID 映射配置，用于将 Claude API 的模型 ID 映射到 Kiro API 的模型 ID。

详见该文件的注释说明。
