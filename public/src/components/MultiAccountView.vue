<template>
  <div>
    <!-- 工具栏 -->
    <div class="accounts-toolbar">
      <div class="search-box" :class="{ 'has-value': searchQuery }">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索邮箱、昵称或用户ID..."
          @input="filterAccounts"
        />
        <button v-if="searchQuery" class="search-clear" @click="clearSearch" title="清空搜索">
          ✕
        </button>
      </div>

      <div class="filter-group">
        <select v-model="statusFilter" class="filter-select" @change="filterAccounts">
          <option value="all">全部状态</option>
          <option value="active">仅活跃</option>
          <option value="error">仅异常</option>
        </select>

        <select v-model="sortBy" class="filter-select" @change="filterAccounts">
          <option value="email">按邮箱排序</option>
          <option value="quota">按额度排序</option>
          <option value="usage">按使用率排序</option>
        </select>

        <div class="view-toggle">
          <button
            class="view-btn"
            :class="{ active: viewMode === 'grid' }"
            @click="viewMode = 'grid'"
            title="网格视图"
          >
            ⊞
          </button>
          <button
            class="view-btn"
            :class="{ active: viewMode === 'list' }"
            @click="viewMode = 'list'"
            title="列表视图"
          >
            ☰
          </button>
        </div>

        <button class="btn btn-primary" @click="showAddDialog = true" title="添加账号">
          ➕ 添加账号
        </button>
      </div>
    </div>

    <!-- 统计概览 -->
    <div v-if="stats" class="accounts-overview">
      <div class="overview-item">
        <div class="icon">👥</div>
        <div class="number">{{ stats.totalCount }}</div>
        <div class="label">总账号数</div>
      </div>
      <div class="overview-item">
        <div class="icon">✅</div>
        <div class="number" style="color: #10b981">{{ stats.activeCount }}</div>
        <div class="label">活跃账号</div>
      </div>
      <div class="overview-item">
        <div class="icon">⚠️</div>
        <div class="number" :style="{ color: stats.errorCount > 0 ? '#ef4444' : '#6b7280' }">
          {{ stats.errorCount }}
        </div>
        <div class="label">异常账号</div>
      </div>
      <div class="overview-item">
        <div class="icon">📊</div>
        <div class="number">{{ stats.remaining.toFixed(1) }}</div>
        <div class="label">剩余额度</div>
      </div>
    </div>

    <!-- 总额度使用情况 -->
    <div v-if="stats" class="quota-overview">
      <div class="quota-header">
        <span class="quota-title">总额度使用情况</span>
        <span class="quota-numbers">
          <strong>{{ stats.totalUsed.toFixed(2) }}</strong> /
          {{ stats.totalLimit.toFixed(2) }} ({{ stats.percentUsed.toFixed(1) }}%)
        </span>
      </div>
      <div class="quota-bar">
        <div
          class="quota-fill"
          :class="{
            warning: stats.percentUsed > 50 && stats.percentUsed <= 80,
            danger: stats.percentUsed > 80
          }"
          :style="{ width: `${Math.min(stats.percentUsed, 100)}%` }"
        ></div>
      </div>
    </div>

    <!-- 账号列表 -->
    <div v-if="loading" class="loading">加载中...</div>
    <div v-else-if="error" class="error-message">{{ error }}</div>
    <div v-else-if="filteredAccounts.length === 0" class="accounts-empty">
      <div class="icon">🔍</div>
      <div class="title">没有匹配的账号</div>
      <div class="desc">尝试调整搜索条件或筛选器</div>
    </div>
    <div v-else :class="viewMode === 'grid' ? 'accounts-grid' : 'accounts-list'">
      <AccountCard
        v-for="account in filteredAccounts"
        :key="account.id"
        :account="account"
        :view-mode="viewMode"
        @test="testAccount"
        @reset="resetAccount"
        @delete="deleteAccount"
      />
    </div>

    <!-- 添加账号对话框 -->
    <AddAccountDialog
      v-if="showAddDialog"
      @close="showAddDialog = false"
      @success="loadAccounts"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import AccountCard from './AccountCard.vue'
import AddAccountDialog from './AddAccountDialog.vue'
import { useNotification } from '../composables/useNotification'

const emit = defineEmits(['update-stats'])
const { showNotification } = useNotification()

const accounts = ref([])
const filteredAccounts = ref([])
const searchQuery = ref('')
const statusFilter = ref('all')
const sortBy = ref('email')
const viewMode = ref('grid')
const loading = ref(false)
const error = ref(null)
const showAddDialog = ref(false)

let refreshInterval = null

const stats = computed(() => {
  if (accounts.value.length === 0) return null

  const activeAccounts = accounts.value.filter(acc => acc.status === 'active')
  const errorAccounts = accounts.value.filter(acc => acc.status === 'error')
  const totalLimit = activeAccounts.reduce((sum, acc) => sum + (acc.usage?.limit || 0), 0)
  const totalUsed = activeAccounts.reduce((sum, acc) => sum + (acc.usage?.current || 0), 0)

  return {
    totalCount: accounts.value.length,
    activeCount: activeAccounts.length,
    errorCount: errorAccounts.length,
    totalLimit,
    totalUsed,
    remaining: totalLimit - totalUsed,
    percentUsed: totalLimit > 0 ? (totalUsed / totalLimit) * 100 : 0
  }
})

const loadAccounts = async () => {
  loading.value = true
  error.value = null

  try {
    const response = await fetch('/api/accounts')
    const data = await response.json()

    if (!data.accounts || data.accounts.length === 0) {
      accounts.value = []
      filteredAccounts.value = []
    } else {
      accounts.value = data.accounts
      filterAccounts()
    }

    // 更新父组件的统计信息
    if (stats.value) {
      emit('update-stats', {
        activeAccounts: stats.value.activeCount,
        totalQuota: stats.value.totalLimit.toFixed(2),
        usedQuota: stats.value.totalUsed.toFixed(2)
      })
    }
  } catch (err) {
    error.value = `加载失败: ${err.message}`
  } finally {
    loading.value = false
  }
}

const filterAccounts = () => {
  let filtered = [...accounts.value]

  // 搜索过滤
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter(
      acc =>
        (acc.email && acc.email.toLowerCase().includes(query)) ||
        (acc.nickname && acc.nickname.toLowerCase().includes(query)) ||
        (acc.userId && acc.userId.toLowerCase().includes(query))
    )
  }

  // 状态过滤
  if (statusFilter.value !== 'all') {
    filtered = filtered.filter(acc => acc.status === statusFilter.value)
  }

  // 排序
  filtered.sort((a, b) => {
    switch (sortBy.value) {
      case 'email':
        return (a.email || '').localeCompare(b.email || '')
      case 'quota':
        return (b.usage?.limit || 0) - (a.usage?.limit || 0)
      case 'usage':
        return (b.usage?.percentUsed || 0) - (a.usage?.percentUsed || 0)
      default:
        return 0
    }
  })

  filteredAccounts.value = filtered
}

const clearSearch = () => {
  searchQuery.value = ''
  filterAccounts()
}

const testAccount = async (accountId) => {
  try {
    const response = await fetch(`/api/accounts/${accountId}/test`, { method: 'POST' })
    const result = await response.json()

    if (result.success) {
      showNotification(`账号可用,响应时间: ${result.responseTime}ms`, 'success')
    } else {
      showNotification(`测试失败: ${result.error}`, 'error')
      await loadAccounts()
    }
  } catch (err) {
    showNotification(`测试失败: ${err.message}`, 'error')
  }
}

const resetAccount = async (accountId) => {
  try {
    const response = await fetch(`/api/accounts/${accountId}/reset`, { method: 'POST' })
    const result = await response.json()

    if (result.success) {
      showNotification('账号重置成功', 'success')
      await loadAccounts()
    } else {
      showNotification(`重置失败: ${result.error}`, 'error')
    }
  } catch (err) {
    showNotification(`重置失败: ${err.message}`, 'error')
  }
}

const deleteAccount = async (accountId) => {
  try {
    const response = await fetch(`/api/accounts/${accountId}`, { method: 'DELETE' })
    const result = await response.json()

    if (result.success) {
      showNotification(result.message, 'success')
      await loadAccounts()
    } else {
      showNotification(`删除失败: ${result.error}`, 'error')
    }
  } catch (err) {
    showNotification(`删除失败: ${err.message}`, 'error')
  }
}

onMounted(() => {
  loadAccounts()

  // 每30秒刷新一次
  refreshInterval = setInterval(() => {
    loadAccounts()
  }, 30000)
})

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
  }
})
</script>
