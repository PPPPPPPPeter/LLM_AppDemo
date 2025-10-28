<template>
  <header class="app-header">
    <h1>Demo</h1>
    <div class="header-controls">
      <select v-model="selectedModel" @change="onModelChange" class="model-selector">
        <optgroup label="DeepSeek">
          <option value="deepseek-chat">DeepSeek Chat</option>
          <option value="deepseek-reasoner">DeepSeek Reasoner</option>
        </optgroup>
        <optgroup label="OpenAI">
          <option value="gpt-4">GPT-4</option>
        </optgroup>
        <optgroup label="Google">
          <option value="gemini-2.0-flash-exp">Gemini</option>
        </optgroup>
      </select>
      <button class="benchmark-btn" @click="onBenchmarkClick">
        Benchmark Test
      </button>
    </div>
  </header>
</template>

<script setup>
import { ref } from 'vue'

const selectedModel = ref('deepseek-chat')

const emit = defineEmits(['model-change', 'benchmark-click'])

const onModelChange = () => {
  emit('model-change', selectedModel.value)
}

const onBenchmarkClick = () => {
  emit('benchmark-click')
}
</script>

<style scoped>
.app-header {
  padding: 16px 24px;
  background: #2d2d30;
  border-bottom: 1px solid #3e3e42;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.model-selector {
  padding: 8px 12px;
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  outline: none;
  min-width: 200px;
}

.model-selector:hover {
  border-color: #0e639c;
}

.model-selector:focus {
  border-color: #0e639c;
}

.model-selector option {
  background: #1e1e1e;
  color: #fff;
}

.model-selector optgroup {
  background: #2d2d30;
  color: #cccccc;
  font-weight: 600;
}

.benchmark-btn {
  padding: 8px 16px;
  background: #0e639c;
  border: none;
  border-radius: 4px;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.benchmark-btn:hover {
  background: #1177bb;
}

.benchmark-btn:active {
  transform: scale(0.98);
}
</style>