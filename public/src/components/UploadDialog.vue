<template>
  <div class="upload-dialog-overlay" @click.self="$emit('close')">
    <div class="upload-dialog">
      <div class="upload-dialog-header">
        <h3>上传账号配置</h3>
        <button class="btn-close" @click="$emit('close')">✕</button>
      </div>

      <div class="upload-dialog-body">
        <p>上传 <code>kiro-accounts.json</code> 文件或粘贴 JSON 内容:</p>
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
          placeholder="粘贴 JSON 内容..."
        ></textarea>
      </div>

      <div class="upload-dialog-footer">
        <button class="btn" @click="$emit('close')">取消</button>
        <button class="btn btn-primary" @click="submit">上传</button>
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

  try {
    const response = await fetch('/api/auth-config/multi', {
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
      showNotification(`上传失败: ${result.error}`, 'error')
    }
  } catch (error) {
    showNotification(`上传失败: ${error.message}`, 'error')
  }
}
</script>
