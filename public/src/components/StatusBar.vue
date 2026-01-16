<template>
  <div class="status-bar">
    <div class="status-card">
      <h3>服务器状态</h3>
      <div class="value">
        <span v-if="serverStatus === 'online'" class="status-online">● 在线</span>
        <span v-else-if="serverStatus === 'offline'" class="status-error">● 离线</span>
        <span v-else>{{ serverStatus }}</span>
      </div>
      <div class="label">Server Status</div>
    </div>

    <div class="status-card">
      <h3>活跃账号</h3>
      <div class="value">{{ stats.activeAccounts }}</div>
      <div class="label">Active Accounts</div>
    </div>

    <div class="status-card">
      <h3>总额度</h3>
      <div class="value">{{ stats.totalQuota }}</div>
      <div class="label">Total Quota</div>
    </div>

    <div class="status-card">
      <h3>已使用</h3>
      <div class="value">{{ stats.usedQuota }}</div>
      <div class="label">Used Quota</div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  serverStatus: {
    type: String,
    default: '检查中...'
  },
  stats: {
    type: Object,
    default: () => ({
      activeAccounts: '-',
      totalQuota: '-',
      usedQuota: '-'
    })
  }
})
</script>
