<template>
  <div>
    <h2>服务器配置</h2>

    <div v-if="loading" class="loading">加载中...</div>
    <div v-else-if="error" class="error-message">{{ error }}</div>
    <div v-else class="config-viewer">
      <div class="config-header">
        <h3>当前配置</h3>
        <div class="readonly-badge">
          <span class="badge">🔒 只读</span>
          <span class="hint">修改请编辑 config/server-config.json</span>
        </div>
      </div>

      <!-- 服务器设置 -->
      <div class="config-section">
        <h4>🖥️ 服务器设置</h4>
        <div class="config-grid">
          <div class="config-item">
            <span class="label">监听地址</span>
            <span class="value">{{ config.server.host }}</span>
          </div>
          <div class="config-item">
            <span class="label">端口</span>
            <span class="value">{{ config.server.port }}</span>
          </div>
        </div>
      </div>

      <!-- 流式响应 -->
      <div class="config-section">
        <h4>📡 流式响应</h4>
        <div class="config-grid">
          <div class="config-item">
            <span class="label">块大小</span>
            <span class="value">{{ config.stream.chunkSize }} 字符</span>
          </div>
        </div>
      </div>

      <!-- 账号设置 -->
      <div class="config-section">
        <h4>👥 账号设置</h4>
        <div class="config-grid">
          <div class="config-item">
            <span class="label">账号选择策略</span>
            <span class="value">{{ strategyLabel }}</span>
          </div>
          <div class="config-item">
            <span class="label">错误时自动切换</span>
            <span class="value" :class="config.account.autoSwitchOnError ? 'enabled' : 'disabled'">
              {{ config.account.autoSwitchOnError ? '✓ 启用' : '✗ 禁用' }}
            </span>
          </div>
        </div>
      </div>

      <!-- Token刷新设置 -->
      <div class="config-section">
        <h4>🔑 Token 刷新</h4>
        <div class="config-grid">
          <div class="config-item">
            <span class="label">最大重试次数</span>
            <span class="value">{{ config.token.refreshRetryMax }} 次</span>
          </div>
          <div class="config-item">
            <span class="label">重试间隔</span>
            <span class="value">{{ formatMs(config.token.refreshRetryIntervalMs) }}</span>
          </div>
          <div class="config-item">
            <span class="label">提前刷新</span>
            <span class="value">{{ config.token.refreshBufferMinutes }} 分钟</span>
          </div>
        </div>
      </div>

      <!-- 连接池设置 -->
      <div class="config-section">
        <h4>🔗 连接池</h4>
        <div class="config-grid">
          <div class="config-item">
            <span class="label">最大连接数</span>
            <span class="value">{{ config.connectionPool.maxSockets }}</span>
          </div>
          <div class="config-item">
            <span class="label">空闲连接数</span>
            <span class="value">{{ config.connectionPool.maxFreeSockets }}</span>
          </div>
          <div class="config-item">
            <span class="label">连接超时</span>
            <span class="value">{{ formatMs(config.connectionPool.socketTimeout) }}</span>
          </div>
          <div class="config-item">
            <span class="label">请求超时</span>
            <span class="value">{{ formatMs(config.connectionPool.requestTimeout) }}</span>
          </div>
        </div>
      </div>

      <!-- 日志设置 -->
      <div class="config-section">
        <h4>📝 日志设置</h4>
        <div class="config-grid">
          <div class="config-item">
            <span class="label">日志级别</span>
            <span class="value log-level" :class="config.logging.level.toLowerCase()">
              {{ config.logging.level }}
            </span>
          </div>
          <div class="config-item">
            <span class="label">轮转大小</span>
            <span class="value">{{ formatBytes(config.logging.rotation.maxSize) }}</span>
          </div>
          <div class="config-item">
            <span class="label">保留文件数</span>
            <span class="value">{{ config.logging.rotation.maxFiles }} 个</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const loading = ref(false)
const error = ref(null)

const config = ref({
  server: { host: '0.0.0.0', port: 3000 },
  stream: { chunkSize: 4 },
  account: { strategy: 'auto', autoSwitchOnError: true },
  token: { refreshRetryMax: 3, refreshRetryIntervalMs: 60000, refreshBufferMinutes: 5 },
  connectionPool: { maxSockets: 20, maxFreeSockets: 10, socketTimeout: 60000, requestTimeout: 30000 },
  logging: { level: 'INFO', rotation: { maxSize: 10485760, maxFiles: 5 } }
})

const strategyLabels = {
  'auto': '自动选择',
  'round-robin': '轮询',
  'least-used': '最少使用'
}

const strategyLabel = computed(() => strategyLabels[config.value.account.strategy] || config.value.account.strategy)

const formatMs = (ms) => {
  if (ms >= 60000) return `${ms / 60000} 分钟`
  if (ms >= 1000) return `${ms / 1000} 秒`
  return `${ms} ms`
}

const formatBytes = (bytes) => {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

const loadConfig = async () => {
  loading.value = true
  error.value = null
  try {
    const response = await fetch('/api/config')
    config.value = await response.json()
  } catch (err) {
    error.value = `加载失败: ${err.message}`
  } finally {
    loading.value = false
  }
}

onMounted(loadConfig)
</script>

<style scoped>
.config-viewer {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.config-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 2px solid #e5e7eb;
}

.config-header h3 {
  margin: 0;
  color: #374151;
  font-size: 20px;
}

.readonly-badge {
  display: flex;
  align-items: center;
  gap: 12px;
}

.readonly-badge .badge {
  background: #fef3c7;
  color: #d97706;
  padding: 4px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
}

.readonly-badge .hint {
  color: #6b7280;
  font-size: 12px;
}

.config-section {
  background: #f9fafb;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 20px;
}

.config-section h4 {
  color: #374151;
  margin: 0 0 16px 0;
  font-size: 15px;
  font-weight: 600;
}

.config-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}

.config-item {
  background: white;
  padding: 14px 16px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.config-item .label {
  color: #6b7280;
  font-size: 12px;
  font-weight: 500;
}

.config-item .value {
  color: #111827;
  font-size: 15px;
  font-weight: 600;
}

.config-item .value.enabled {
  color: #059669;
}

.config-item .value.disabled {
  color: #9ca3af;
}

.config-item .value.log-level {
  padding: 3px 10px;
  border-radius: 6px;
  display: inline-block;
  width: fit-content;
  font-size: 13px;
}

.config-item .value.log-level.debug {
  background: #dbeafe;
  color: #1d4ed8;
}

.config-item .value.log-level.info {
  background: #d1fae5;
  color: #047857;
}

.config-item .value.log-level.warn {
  background: #fef3c7;
  color: #d97706;
}

.config-item .value.log-level.error {
  background: #fee2e2;
  color: #dc2626;
}
</style>
