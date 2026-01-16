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

      <!-- 使用量概览 -->
      <div class="usage-overview">
        <div class="usage-header">
          <span class="usage-title">总使用量</span>
          <span class="usage-percent" :class="percentClass">{{ percentUsed.toFixed(1) }}% 已使用</span>
        </div>
        <div class="usage-total">
          <span class="usage-current">{{ formatNumber(account.usage?.current || 0) }}</span>
          <span class="usage-limit">/ {{ formatNumber(account.usage?.limit || 0) }}</span>
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
        <!-- 配额详情卡片 -->
        <div class="quota-cards">
          <!-- 主配额 -->
          <div class="quota-card" :class="{ active: hasActiveMain }">
            <div class="quota-card-header">
              <span class="quota-dot main"></span>
              <span class="quota-card-title">主配额</span>
              <span v-if="hasActiveMain" class="quota-badge active">ACTIVE</span>
            </div>
            <div class="quota-card-value">
              <span class="quota-current">{{ formatNumber(account.usage?.baseCurrent || 0) }}</span>
              <span class="quota-max">/ {{ formatNumber(account.usage?.baseLimit || 0) }}</span>
            </div>
            <div class="quota-card-date">{{ formatResetDate(account.usage?.nextResetDate) }} 重置</div>
          </div>

          <!-- 免费试用 -->
          <div class="quota-card" :class="{ active: hasActiveTrial }">
            <div class="quota-card-header">
              <span class="quota-dot trial"></span>
              <span class="quota-card-title">免费试用</span>
              <span v-if="hasActiveTrial" class="quota-badge active">ACTIVE</span>
            </div>
            <div class="quota-card-value">
              <span class="quota-current">{{ formatNumber(account.usage?.freeTrialCurrent || 0) }}</span>
              <span class="quota-max">/ {{ formatNumber(account.usage?.freeTrialLimit || 0) }}</span>
            </div>
            <div class="quota-card-date">{{ formatExpiryDate(account.usage?.freeTrialExpiry) }}</div>
          </div>

          <!-- 奖励总计 -->
          <div class="quota-card">
            <div class="quota-card-header">
              <span class="quota-dot bonus"></span>
              <span class="quota-card-title">奖励总计</span>
            </div>
            <div class="quota-card-value">
              <span class="quota-current">{{ formatNumber(account.usage?.bonusCurrent || 0) }}</span>
              <span class="quota-max">/ {{ formatNumber(account.usage?.bonusLimit || 0) }}</span>
            </div>
            <div class="quota-card-date">{{ account.usage?.activeBonusCount || 0 }} 个生效奖励</div>
          </div>
        </div>

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
            <div class="info-value">{{ account.subscription?.daysRemaining ?? '-' }} 天</div>
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

const percentClass = computed(() => {
  if (percentUsed.value > 80) return 'percent-danger'
  if (percentUsed.value > 50) return 'percent-warning'
  return 'percent-normal'
})

const hasActiveTrial = computed(() => {
  const trialLimit = props.account.usage?.freeTrialLimit || 0
  const trialCurrent = props.account.usage?.freeTrialCurrent || 0
  const expiry = props.account.usage?.freeTrialExpiry
  
  if (trialLimit <= 0) return false
  if (trialCurrent >= trialLimit) return false
  if (expiry) {
    const expiryDate = new Date(expiry)
    if (expiryDate < new Date()) return false
  }
  return true
})

const hasActiveMain = computed(() => {
  // 主配额激活条件：有主配额额度，且试用未激活
  const baseLimit = props.account.usage?.baseLimit || 0
  return baseLimit > 0 && !hasActiveTrial.value
})

const formatNumber = (num) => {
  if (num === undefined || num === null) return '0'
  if (Number.isInteger(num)) return num.toString()
  return num.toFixed(1)
}

const formatResetDate = (dateStr) => {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return '-'
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const formatExpiryDate = (dateStr) => {
  if (!dateStr) return '无试用'
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return '无试用'
  const now = new Date()
  if (date < now) return '已过期'
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} 过期`
}

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
