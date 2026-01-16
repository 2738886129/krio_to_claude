<template>
  <div class="restart-dialog-overlay">
    <div class="restart-dialog">
      <template v-if="!restarting">
        <div class="restart-dialog-icon">⚠️</div>
        <h3>需要重启服务器</h3>
        <p>您修改了以下配置,需要重启服务器才能生效:</p>
        <ul>
          <li>服务器地址/端口</li>
          <li>账号模式切换</li>
        </ul>
        <div class="restart-dialog-actions">
          <button class="btn" @click="$emit('close')">稍后重启</button>
          <button class="btn btn-danger" @click="restart">立即重启</button>
        </div>
      </template>

      <template v-else>
        <div class="restart-dialog-icon">🔄</div>
        <h3>正在重启...</h3>
        <p>服务器正在重启,页面将自动刷新</p>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const emit = defineEmits(['close'])

const restarting = ref(false)

const restart = async () => {
  restarting.value = true

  try {
    await fetch('/api/server/restart', { method: 'POST' })
  } catch (e) {
    // 请求可能因服务器关闭而失败,这是正常的
  }

  // 等待服务器重启后刷新页面
  setTimeout(() => {
    waitForServerAndReload()
  }, 2000)
}

const waitForServerAndReload = async () => {
  const maxAttempts = 30
  let attempts = 0

  const check = async () => {
    attempts++
    try {
      const response = await fetch('/api/health')
      if (response.ok) {
        window.location.reload()
        return
      }
    } catch (e) {
      // 服务器还没恢复
    }

    if (attempts < maxAttempts) {
      setTimeout(check, 1000)
    } else {
      emit('close')
    }
  }

  check()
}
</script>
