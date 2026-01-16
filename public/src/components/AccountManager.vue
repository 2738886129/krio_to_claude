<template>
  <div>
    <h2>账号管理</h2>
    <MultiAccountView @update-stats="handleUpdateStats" />
  </div>
</template>

<script setup>

import MultiAccountView from './MultiAccountView.vue'

const emit = defineEmits(['update-stats'])

const handleUpdateStats = (stats) => {
  emit('update-stats', stats)
}
</script>
