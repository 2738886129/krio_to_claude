<template>
  <div class="auth-config-status">
    <div v-if="loading" class="loading" style="padding: 20px; text-align: center">加载中...</div>
    <div v-else class="auth-config-card-single">
      <div class="auth-config-header">
        <span class="auth-config-title">📁 账号配置</span>
        <span
          class="auth-config-badge"
          :class="status.multiAccount.valid ? 'badge-active' : 'badge-error'"
        >
          {{ status.multiAccount.valid ? '✓ 已配置' : '✗ 未配置' }}
        </span>
      </div>

      <div v-if="status.multiAccount.valid" class="auth-config-info">
        <span>总账号数: {{ status.multiAccount.count }}</span>
        <span class="auth-config-separator">|</span>
        <span>活跃账号: {{ status.multiAccount.activeCount }}</span>
      </div>
      <div v-else class="auth-config-info auth-config-warning">
        <span>⚠️ 需要配置 kiro-accounts.json 文件</span>
      </div>

      <div class="auth-config-actions">
        <button class="btn btn-small" @click="showUploadDialog">📁 上传配置</button>
      </div>
    </div>

    <!-- 上传对话框 -->
    <UploadDialog
      v-if="uploadDialogVisible"
      @close="uploadDialogVisible = false"
      @success="handleUploadSuccess"
    />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import UploadDialog from './UploadDialog.vue'

const loading = ref(false)
const uploadDialogVisible = ref(false)

const status = ref({
  multiAccount: { valid: false, count: 0, activeCount: 0 }
})

const loadStatus = async () => {
  loading.value = true

  try {
    const response = await fetch('/api/auth-config/status')
    const data = await response.json()
    status.value = data
  } catch (error) {
    console.error('Failed to load auth config status:', error)
  } finally {
    loading.value = false
  }
}

const showUploadDialog = () => {
  uploadDialogVisible.value = true
}

const handleUploadSuccess = () => {
  loadStatus()
}

onMounted(() => {
  loadStatus()
})
</script>
