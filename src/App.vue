<template>
  <AppLayout @model-change="handleModelChange" @benchmark-click="handleBenchmarkClick">
    <template #default="{ currentModel }">
      <ChatInterface :current-model="currentModel" :key="chatKey" />
    </template>
  </AppLayout>
</template>

<script setup>
import { ref } from 'vue'
import AppLayout from './components/Layout/AppLayout.vue'
import ChatInterface from './components/ChatInterface.vue'

const chatKey = ref(0)

const handleModelChange = (model) => {
  console.log('Model changed to:', model)
  // 通过改变 key 强制重新渲染聊天组件，清空聊天记录
  chatKey.value++
}

const handleBenchmarkClick = () => {
  console.log('Benchmark test button clicked')
  alert('Benchmark Test\n\nThis feature is under development.\nYou can implement your benchmark testing logic here.')
}
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #app {
  height: 100%;
  overflow: hidden;
}

body {
  background: #1e1e1e;
  color: #fff;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
}
</style>