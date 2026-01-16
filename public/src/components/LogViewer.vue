<template>
  <div>
    <h2>日志查看</h2>

    <div style="margin-bottom: 15px">
      <select
        v-model="selectedLog"
        class="filter-select"
        style="padding: 8px; border-radius: 6px; border: 1px solid #d1d5db"
        @change="loadLog"
      >
        <option value="server-debug.log">服务器调试日志</option>
        <option value="server-error.log">服务器错误日志</option>
        <option value="claude-code.log">Claude Code 日志</option>
        <option value="kiro-api.log">Kiro API 日志</option>
      </select>
      <button class="btn" style="margin-left: 10px" @click="loadLog">刷新</button>
      <button
        class="btn"
        :class="{ 'btn-primary': autoRefresh }"
        style="margin-left: 10px"
        @click="toggleAutoRefresh"
      >
        {{ autoRefresh ? '⏸ 停止自动刷新' : '▶ 自动刷新' }}
      </button>
    </div>

    <div class="log-viewer" ref="logViewer">
      {{ logContent || '加载中...' }}
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const selectedLog = ref('server-debug.log')
const logContent = ref('')
const logViewer = ref(null)
const autoRefresh = ref(false)
let refreshInterval = null

const loadLog = async () => {
  try {
    const response = await fetch(`/api/logs/${selectedLog.value}`)
    const text = await response.text()

    if (text.trim()) {
      logContent.value = text
      // 自动滚动到底部
      setTimeout(() => {
        if (logViewer.value) {
          logViewer.value.scrollTop = logViewer.value.scrollHeight
        }
      }, 100)
    } else {
      logContent.value = '日志文件为空'
    }
  } catch (error) {
    logContent.value = `加载失败: ${error.message}`
  }
}

const toggleAutoRefresh = () => {
  autoRefresh.value = !autoRefresh.value

  if (autoRefresh.value) {
    // 每5秒刷新一次
    refreshInterval = setInterval(() => {
      loadLog()
    }, 5000)
  } else {
    if (refreshInterval) {
      clearInterval(refreshInterval)
      refreshInterval = null
    }
  }
}

onMounted(() => {
  loadLog()
})

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
  }
})
</script>
