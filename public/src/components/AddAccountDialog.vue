<template>
  <div class="upload-dialog-overlay" @click.self="$emit('close')">
    <div class="upload-dialog">
      <div class="upload-dialog-header">
        <h3>添加账号</h3>
        <button class="btn-close" @click="$emit('close')">✕</button>
      </div>

      <div class="upload-dialog-body">
        <p>上传凭证 JSON 文件或粘贴内容:</p>
        <div class="upload-methods">
          <input
            ref="fileInput"
            type="file"
            accept=".json"
            style="display: none"
            @change="handleFileSelect"
          />
          <button class="btn" @click="$refs.fileInput.click()">📁 选择文件</button>
          <span class="upload-or">或粘贴 JSON</span>
        </div>
        <textarea
          v-model="jsonContent"
          placeholder='{
  "accessToken": "aoaAAAAA...",
  "refreshToken": "aorAAAAA...",
  "expiresAt": "2026-01-16T04:18:26.071Z",
  "authMethod": "social",
  "provider": "Google"
}'
        ></textarea>
        <p class="hint">必填字段: accessToken, refreshToken</p>
      </div>

      <div class="upload-dialog-footer">
        <button class="btn" @click="$emit('close')" :disabled="loading">取消</button>
        <button class="btn btn-primary" @click="submit" :disabled="loading">
          {{ loading ? '添加中...' : '添加' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useNotification } from '../composables/useNotification'

const emit = defineEmits(['close', 'success'])
const { showNotification } = useNotification()

const jsonContent = ref('')
const fileInput = ref(null)
const loading = ref(false)

const handleFileSelect = (event) => {
  const file = event.target.files[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (e) => {
    jsonContent.value = e.target.result
  }
  reader.readAsText(file)
}

const submit = async () => {
  if (!jsonContent.value.trim()) {
    showNotification('请选择文件或粘贴 JSON 内容', 'error')
    return
  }

  let data
  try {
    data = JSON.parse(jsonContent.value)
  } catch (e) {
    showNotification(`JSON 格式错误: ${e.message}`, 'error')
    return
  }

  if (!data.accessToken || !data.refreshToken) {
    showNotification('缺少必要字段: accessToken, refreshToken', 'error')
    return
  }

  loading.value = true

  try {
    const response = await fetch('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })

    const result = await response.json()

    if (result.success) {
      showNotification(result.message, 'success')
      emit('success')
      emit('close')
    } else {
      showNotification(`添加失败: ${result.error}`, 'error')
    }
  } catch (error) {
    showNotification(`添加失败: ${error.message}`, 'error')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.hint {
  font-size: 12px;
  color: #6b7280;
  margin-top: 8px;
}
</style>
