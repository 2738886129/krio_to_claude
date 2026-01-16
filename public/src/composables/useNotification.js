import { reactive } from 'vue'

// 全局单例状态
const notification = reactive({
  show: false,
  message: '',
  type: 'info' // 'success', 'error', 'info'
})

export function useNotification() {
  const showNotification = (message, type = 'info') => {
    notification.message = message
    notification.type = type
    notification.show = true

    setTimeout(() => {
      notification.show = false
    }, 3000)
  }

  const closeNotification = () => {
    notification.show = false
  }

  return {
    notification,
    showNotification,
    closeNotification
  }
}
