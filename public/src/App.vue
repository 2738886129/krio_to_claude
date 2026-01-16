<template>
  <div class="container">
    <!-- 头部 -->
    <div class="header">
      <h1>🚀 Kiro API 管理面板</h1>
      <p>实时监控和管理您的 Kiro API 服务器</p>
    </div>

    <!-- 状态栏 -->
    <StatusBar
      :server-status="serverStatus"
      :stats="stats"
    />

    <!-- 标签页导航 -->
    <div class="tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="tab"
        :class="{ active: currentTab === tab.id }"
        @click="switchTab(tab.id)"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- 内容区域 -->
    <div class="content">
      <component
        :is="currentTabComponent"
        @update-stats="updateStats"
      />
    </div>

    <!-- 通知组件 -->
    <Notification
      v-if="notification.show"
      :message="notification.message"
      :type="notification.type"
      @close="closeNotification"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import StatusBar from './components/StatusBar.vue'
import AccountManager from './components/AccountManager.vue'
import ServerConfig from './components/ServerConfig.vue'
import ModelMapping from './components/ModelMapping.vue'
import LogViewer from './components/LogViewer.vue'
import Notification from './components/Notification.vue'
import { useNotification } from './composables/useNotification'

const { notification, closeNotification } = useNotification()

const tabs = [
  { id: 'accounts', label: '账号管理', component: AccountManager },
  { id: 'config', label: '服务器配置', component: ServerConfig },
  { id: 'models', label: '模型映射', component: ModelMapping },
  { id: 'logs', label: '日志查看', component: LogViewer }
]

const currentTab = ref('accounts')
const serverStatus = ref('检查中...')
const stats = ref({
  activeAccounts: '-',
  totalQuota: '-',
  usedQuota: '-'
})

let refreshInterval = null

const currentTabComponent = computed(() => {
  return tabs.find(tab => tab.id === currentTab.value)?.component
})

const switchTab = (tabId) => {
  currentTab.value = tabId
}

const updateStats = (newStats) => {
  stats.value = { ...stats.value, ...newStats }
}

const checkServerStatus = async () => {
  try {
    const response = await fetch('/api/health')
    if (response.ok) {
      serverStatus.value = 'online'
    } else {
      serverStatus.value = 'offline'
    }
  } catch (error) {
    serverStatus.value = 'offline'
  }
}

onMounted(async () => {
  await checkServerStatus()

  // 每30秒刷新一次
  refreshInterval = setInterval(() => {
    checkServerStatus()
  }, 30000)
})

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
  }
})
</script>
