<template>
  <div>
    <h2>模型映射配置</h2>

    <div v-if="loading" class="loading">加载中...</div>
    <div v-else-if="error" class="error-message">{{ error }}</div>
    <div v-else class="config-editor">
      <div class="config-header">
        <h3>模型映射配置</h3>
        <span class="readonly-badge">只读</span>
      </div>

      <!-- 默认模型 -->
      <div class="config-section">
        <h4>🎯 默认模型</h4>
        <div class="config-grid">
          <div class="config-field">
            <label>默认模型</label>
            <span class="readonly-value">{{ config.defaultModel }}</span>
          </div>
        </div>
      </div>

      <!-- 模型映射表 -->
      <div class="config-section">
        <h4>🔄 模型映射表</h4>
        <p class="section-desc">将 Claude API 请求的模型 ID 映射到 Kiro API 的模型 ID</p>
        <div v-for="(mapping, index) in mappings" :key="index" class="mapping-row readonly">
          <span class="mapping-value">{{ mapping.claude }}</span>
          <span class="mapping-arrow">→</span>
          <span class="mapping-value">{{ mapping.kiro }}</span>
        </div>
      </div>

      <!-- 模型说明 -->
      <div v-if="Object.keys(config.notes || {}).length > 0" class="config-section">
        <h4>📝 模型说明</h4>
        <div v-for="(note, model) in config.notes" :key="model" class="note-row">
          <span class="note-model">{{ model }}</span>
          <span class="note-text">{{ note }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const loading = ref(false)
const error = ref(null)

const config = ref({
  defaultModel: 'claude-sonnet-4.5',
  mappings: {},
  description: '',
  notes: {}
})

const mappings = ref([])

const loadConfig = async () => {
  loading.value = true
  error.value = null

  try {
    const response = await fetch('/api/models')
    const data = await response.json()

    config.value = data

    // 将 mappings 对象转换为数组
    mappings.value = Object.entries(data.mappings || {}).map(([claude, kiro]) => ({
      claude,
      kiro
    }))
  } catch (err) {
    error.value = `加载失败: ${err.message}`
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadConfig()
})
</script>


<style scoped>
.readonly-badge {
  background: #6c757d;
  color: white;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
}

.readonly-value {
  background: #f8f9fa;
  padding: 8px 12px;
  border-radius: 4px;
  border: 1px solid #dee2e6;
  display: inline-block;
  min-width: 200px;
}

.mapping-row.readonly {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
}

.mapping-value {
  background: #f8f9fa;
  padding: 8px 12px;
  border-radius: 4px;
  border: 1px solid #dee2e6;
  min-width: 180px;
  font-family: monospace;
}

.mapping-arrow {
  color: #6c757d;
  font-weight: bold;
}

.note-row {
  display: flex;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px solid #eee;
}

.note-model {
  font-weight: 500;
  min-width: 150px;
  font-family: monospace;
}

.note-text {
  color: #666;
}
</style>
