<template>
  <div class="app-layout">
    <AppHeader @model-change="handleModelChange" @benchmark-click="handleBenchmarkClick" />
    <main class="app-content">
      <slot :current-model="currentModel" :on-clear-chat="clearChat"></slot>
    </main>
    <AppFooter />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import AppHeader from './AppHeader.vue'
import AppFooter from './AppFooter.vue'

const currentModel = ref('deepseek-chat')

const emit = defineEmits(['model-change', 'benchmark-click'])

const handleModelChange = (model) => {
  currentModel.value = model
  emit('model-change', model)
}

const handleBenchmarkClick = () => {
  emit('benchmark-click')
}

const clearChat = () => {
  emit('model-change', currentModel.value)
}
</script>

<style scoped>
.app-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.app-content {
  flex: 1;
  overflow: auto;
}
</style>