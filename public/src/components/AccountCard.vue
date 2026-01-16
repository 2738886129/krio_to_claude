<template>
  <div
    class="account-card"
    :class="{ error: account.status === 'error', 'list-view': viewMode === 'list' }"
  >
    <div class="account-status-indicator"></div>

    <div class="account-card-main">
      <div class="account-header">
        <div class="account-identity">
          <div class="account-avatar">{{ getInitials(account.email) }}</div>
          <div class="account-name-group">
            <div class="account-email">{{ account.email || '未知邮箱' }}</div>
            <div class="account-meta">
              <span class="account-nickname">
                {{ account.nickname || account.userId?.split('.')[1]?.substring(0, 12) || '-' }}
              </span>
            </div>
          </div>
        </div>

        <div class="account-badges">
          <span class="badge" :class="account.status === 'active' ? 'badge-active' : 'badge-error'">
            {{ account.status === 'active' ? '✓ 活跃' : '✗ 错误' }}
          </span>
          <span v-if="account.subscription?.title" class="badge badge-subscription">
            {{ account.subscription.title }}
          </span>
        </div>
      </div>

      <div class="account-actions">
        <button
          class="btn-test-small"
          :class="{ testing: testingStatus === 'testing' }"
          :disabled="testingStatus !== 'idle'"
          @click="handleTest"
          title="测试账号可用性"
        >
          {{ testButtonText }}
        </button>
        <button
          v-if="account.status === 'error'"
          class="btn-reset-small"
          :disabled="resetting"
          @click="handleReset"
        >
          {{ resetting ? '重置中...' : '重置' }}
        </button>
        <button
          class="btn-delete-small"
          @click="handleDelete"
          title="删除账号"
        >
          🗑️ 删除
        </button>
      </div>

      <div class="account-quota">
        <div class="quota-info">
          <span class="quota-label">额度使用</span>
          <span class="quota-value">
            {{ (account.usage?.current || 0).toFixed(2) }} / {{ account.usage?.limit || 0 }}
            ({{ percentUsed.toFixed(1) }}%)
          </span>
        </div>
        <div class="account-progress">
          <div
            class="account-progress-fill"
            :class="progressClass"
            :style="{ width: `${Math.min(percentUsed, 100)}%` }"
          ></div>
        </div>
      </div>
    </div>

    <!-- 详情区域 -->
    <div class="account-details" :class="{ show: showDetails }">
      <div class="account-details-inner">
        <div v-if="account.lastError" class="account-error-box">
          <div class="account-error-title">最后错误信息</div>
          <div class="account-error-message">{{ account.lastError }}</div>
        </div>

        <div class="account-info-grid">
          <div class="info-item">
            <div class="info-label">用户 ID</div>
            <div class="info-value" style="font-size: 12px; word-break: break-all">
              {{ account.userId || '-' }}
            </div>
          </div>
          <div class="info-item">
            <div class="info-label">认证提供商</div>
            <div class="info-value">{{ account.idp || '-' }}</div>
          </div>
          <div class="info-item">
            <div class="info-label">订阅到期</div>
            <div class="info-value">{{ formatShortDate(account.subscription?.expiresAt) }}</div>
          </div>
          <div class="info-item">
            <div class="info-label">剩余天数</div>
            <div class="info-value">{{ account.subscription?.daysRemaining || '-' }} 天</div>
          </div>
        </div>

        <div class="account-timestamps">
          <div class="timestamp-item">
            <strong>最后使用:</strong> {{ formatDate(account.lastUsedAt) }}
          </div>
          <div v-if="account.lastCheckedAt" class="timestamp-item">
            <strong>最后检查:</strong> {{ formatDate(account.lastCheckedAt) }}
          </div>
          <div v-if="account.createdAt" class="timestamp-item">
            <strong>创建时间:</strong> {{ formatDate(account.createdAt) }}
          </div>
        </div>
      </div>
    </div>

    <div
      class="account-toggle"
      :class="{ expanded: showDetails }"
      @click="showDetails = !showDetails"
    >
      <span>查看详情</span>
      <span class="arrow">▼</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useUtils } from '../composables/useUtils'

const props = defineProps({
  account: {
    type: Object,
    required: true
  },
  viewMode: {
    type: String,
    default: 'grid'
  }
})

const emit = defineEmits(['test', 'reset', 'delete'])

const { getInitials, formatDate, formatShortDate } = useUtils()

const showDetails = ref(false)
const testingStatus = ref('idle') // 'idle', 'testing', 'success', 'failed'
const resetting = ref(false)

const percentUsed = computed(() => {
  return (props.account.usage?.percentUsed || 0) * 100
})

const progressClass = computed(() => {
  if (percentUsed.value > 80) return 'danger'
  if (percentUsed.value > 50) return 'warning'
  return ''
})

const testButtonText = computed(() => {
  switch (testingStatus.value) {
    case 'testing':
      return '测试中...'
    case 'success':
      return '✓ 可用'
    case 'failed':
      return '✗ 失败'
    default:
      return '🧪 测试'
  }
})

const handleTest = async () => {
  testingStatus.value = 'testing'
  emit('test', props.account.id)

  // 模拟测试结果的视觉反馈
  setTimeout(() => {
    testingStatus.value = 'idle'
  }, 2000)
}

const handleReset = async () => {
  resetting.value = true
  emit('reset', props.account.id)

  setTimeout(() => {
    resetting.value = false
  }, 2000)
}

const handleDelete = () => {
  const accountName = props.account.email || props.account.id
  const userInput = prompt(`确定要删除账号吗？此操作不可恢复。\n\n请输入账号名称 "${accountName}" 以确认删除：`)
  
  if (userInput === null) {
    // 用户点击了取消
    return
  }
  
  if (userInput === accountName) {
    emit('delete', props.account.id)
  } else {
    alert('输入的账号名称不匹配，删除操作已取消。')
  }
}
</script>
