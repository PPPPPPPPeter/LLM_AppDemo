<template>
  <div class="test-runner">
    <header>
      <h1>🧪 Test Runner</h1>
      <div class="header-actions">
        <span>Write code & tests, then run</span>
        <button @click="resetStorage" class="reset-btn" title="Clear all files and reset">🗑️ Reset</button>
      </div>
    </header>

    <div class="workspace">
      <aside class="files-sidebar">
        <div class="sidebar-header">
          <h3>Files</h3>
          <button @click="addFile">+</button>
        </div>
        <div class="file-list">
          <div
              v-for="(file, i) in files"
              :key="i"
              :class="['file', {active: i === current}]"
              @click="current = i"
          >
            <span>{{ getIcon(file.name) }}</span>
            <input
                v-if="file.renaming"
                v-model="file.name"
                @blur="file.renaming = false"
                @keyup.enter="file.renaming = false"
                @click.stop
            />
            <span v-else>{{ file.name }}</span>
            <button @click.stop="file.renaming = true">✏️</button>
            <button @click.stop="remove(i)">×</button>
          </div>
        </div>
      </aside>

      <main class="editor">
        <div class="editor-tab">{{ files[current]?.name || 'No file' }}</div>
        <textarea
            v-model="files[current].content"
            v-if="files[current]"
            spellcheck="false"
        ></textarea>
      </main>

      <aside class="test-panel">
        <div class="test-controls">
          <button
              @click="runTests"
              :disabled="running || !canRunCurrentFile"
              class="run-btn"
          >
            {{ running ? '⏳ Running...' : '▶️ Run Tests' }}
          </button>
          <select v-model="testType">
            <option value="auto">Auto</option>
            <option value="python-test">Python (pytest)</option>
            <option value="javascript-test">JS (assert)</option>
            <option value="gherkin">Gherkin (behave)</option>
          </select>
          <button @click="result = null">Clear</button>
        </div>

        <div class="test-info">
          <span class="info-label">Current file:</span>
          <span :class="['info-value', { 'not-test': !canRunCurrentFile }]">
            {{ getCurrentFileStatus() }}
          </span>
        </div>

        <div class="results">
          <div v-if="!result" class="empty">
            {{ canRunCurrentFile ? 'Run tests to see results' : 'Please select a test file to run' }}
          </div>
          <div v-else>
            <div :class="['status', result.success ? 'ok' : 'fail']">
              {{ result.success ? '✓ PASSED' : '✗ FAILED' }}
            </div>
            <pre>{{ result.output }}</pre>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { executeCode } from './api/executor-api'

// 从 localStorage 加载文件
const loadFilesFromStorage = () => {
  try {
    const saved = localStorage.getItem('test-runner-files')
    if (saved) {
      const parsed = JSON.parse(saved)
      console.log('📂 从本地存储加载了', parsed.length, '个文件')
      return parsed
    }
  } catch (error) {
    console.error('加载文件失败:', error)
  }

  return [
    { name: 'calculator.py', content: 'def add(a, b):\n    return a + b\n\ndef subtract(a, b):\n    return a - b' },
    { name: 'test_calculator.py', content: 'from calculator import add, subtract\n\ndef test_add():\n    assert add(2, 3) == 5\n\ndef test_subtract():\n    assert subtract(5, 2) == 3' }
  ]
}

const files = ref(loadFilesFromStorage())
const current = ref(0)
const running = ref(false)
const result = ref(null)
const testType = ref('auto')

// 监听文件变化，自动保存
watch(files, (newFiles) => {
  try {
    localStorage.setItem('test-runner-files', JSON.stringify(newFiles))
    console.log('💾 已保存', newFiles.length, '个文件')
  } catch (error) {
    console.error('保存失败:', error)
  }
}, { deep: true })

// 加载上次的文件索引
onMounted(() => {
  try {
    const savedIndex = localStorage.getItem('test-runner-current-index')
    if (savedIndex !== null) {
      const index = parseInt(savedIndex)
      if (index >= 0 && index < files.value.length) {
        current.value = index
      }
    }
  } catch (error) {
    console.error('加载索引失败:', error)
  }
})

// 保存当前文件索引
watch(current, (newIndex) => {
  localStorage.setItem('test-runner-current-index', newIndex.toString())
})

function isTestFile(filename) {
  return filename.includes('test_') ||
      filename.startsWith('test_') ||
      filename.endsWith('.feature') ||
      filename.endsWith('_test.py') ||
      filename.endsWith('_test.js') ||
      filename.endsWith('.test.js')
}

const canRunCurrentFile = computed(() => {
  const currentFileName = files.value[current.value]?.name
  if (!currentFileName) return false
  return isTestFile(currentFileName)
})

function getCurrentFileStatus() {
  const currentFileName = files.value[current.value]?.name
  if (!currentFileName) return 'No file selected'

  if (isTestFile(currentFileName)) {
    return `${currentFileName} ✓`
  }

  return `${currentFileName} (not a test file)`
}

function addFile() {
  const name = prompt('Filename:')
  if (name?.trim()) {
    files.value.push({ name: name.trim(), content: '' })
    current.value = files.value.length - 1
  }
}

function remove(i) {
  if (confirm(`Delete ${files.value[i].name}?`)) {
    files.value.splice(i, 1)
    if (current.value >= files.value.length) {
      current.value = Math.max(0, files.value.length - 1)
    }
  }
}

function getIcon(name) {
  if (name.endsWith('.py')) return '🐍'
  if (name.endsWith('.js')) return '📜'
  if (name.endsWith('.feature')) return '🥒'
  return '📄'
}

async function runTests() {
  if (!canRunCurrentFile.value) {
    result.value = {
      success: false,
      output: 'Error: Current file is not a test file.\n\nPlease select a test file:\n- test_*.py\n- *.test.js\n- *.feature'
    }
    return
  }

  running.value = true
  result.value = null

  try {
    const fileList = files.value.map(f => ({ path: f.name, content: f.content }))
    const mainFile = files.value[current.value].name

    let type = testType.value

    if (type === 'auto') {
      if (mainFile.endsWith('.feature')) {
        type = 'gherkin'
      } else if (mainFile.endsWith('.py')) {
        type = 'python-test'
      } else {
        type = 'javascript-test'
      }
    }

    const actualType = fileList.length > 1 ? 'project' : type

    console.log('🚀 执行测试:', {
      type: actualType,
      mainFile,
      files: fileList.length
    })

    result.value = await executeCode(actualType, '', {
      files: fileList,
      mainFile
    })
  } catch (error) {
    result.value = { success: false, output: error.message }
  } finally {
    running.value = false
  }

}

function resetStorage() {
  if (confirm('Are you sure you want to delete all files and reset to defaults?\n\nThis action cannot be undone.')) {
    localStorage.removeItem('test-runner-files')
    localStorage.removeItem('test-runner-current-index')
    files.value = [
      { name: 'calculator.py', content: 'def add(a, b):\n    return a + b\n\ndef subtract(a, b):\n    return a - b' },
      { name: 'test_calculator.py', content: 'from calculator import add, subtract\n\ndef test_add():\n    assert add(2, 3) == 5\n\ndef test_subtract():\n    assert subtract(5, 2) == 3' }
    ]
    current.value = 0
    result.value = null
    console.log('🔄 已重置所有数据')
  }
}


</script>

<style scoped>
.test-runner {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  color: #d4d4d4;
}

header {
  padding: 16px 24px;
  background: #2d2d30;
  border-bottom: 1px solid #3e3e42;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

header h1 { margin: 0; font-size: 18px; }
header span { color: #858585; font-size: 13px; }

.workspace {
  flex: 1;
  display: grid;
  grid-template-columns: 220px 1fr 350px;
  overflow: hidden;
  min-height: 0;
}

.files-sidebar {
  background: #252526;
  border-right: 1px solid #3e3e42;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.sidebar-header {
  padding: 10px;
  border-bottom: 1px solid #3e3e42;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.sidebar-header h3 { margin: 0; font-size: 13px; }

.sidebar-header button {
  background: #0e639c;
  border: none;
  color: white;
  width: 24px;
  height: 24px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 16px;
}

.file-list {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.file {
  padding: 6px 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 13px;
  border-bottom: 1px solid #2d2d30;
}

.file:hover { background: #2d2d30; }
.file.active { background: #37373d; }

.file span:first-child { font-size: 14px; }
.file span:nth-child(2) { flex: 1; font-family: monospace; }

.file input {
  flex: 1;
  background: #3e3e42;
  border: 1px solid #0e639c;
  color: white;
  padding: 2px 4px;
  font-family: monospace;
  font-size: 12px;
}

.file button {
  background: none;
  border: none;
  color: #858585;
  cursor: pointer;
  padding: 2px 4px;
  opacity: 0;
  transition: opacity 0.2s;
}

.file:hover button { opacity: 1; }
.file button:hover { color: white; }

.editor {
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  min-height: 0;
}

.editor-tab {
  padding: 10px 16px;
  background: #2d2d30;
  border-bottom: 1px solid #3e3e42;
  font-size: 13px;
  color: #858585;
  flex-shrink: 0;
}

.editor textarea {
  flex: 1;
  padding: 16px;
  background: #1e1e1e;
  color: #d4d4d4;
  border: none;
  font-family: 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.6;
  resize: none;
  outline: none;
  min-height: 0;
}

.test-panel {
  background: #252526;
  border-left: 1px solid #3e3e42;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.test-controls {
  padding: 10px;
  border-bottom: 1px solid #3e3e42;
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.run-btn {
  flex: 1;
  padding: 8px;
  background: #0e639c;
  border: none;
  color: white;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}

.run-btn:hover:not(:disabled) { background: #1177bb; }
.run-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.test-controls select,
.test-controls button:not(.run-btn) {
  padding: 6px 10px;
  background: #3e3e42;
  border: none;
  color: white;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.test-info {
  padding: 8px 10px;
  background: #2d2d30;
  border-bottom: 1px solid #3e3e42;
  display: flex;
  gap: 8px;
  font-size: 12px;
  align-items: center;
  flex-shrink: 0;
}

.info-label {
  color: #858585;
  font-weight: 500;
}

.info-value {
  color: #4ec9b0;
  font-family: monospace;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.info-value.not-test {
  color: #858585;
}

.results {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 12px;
  min-height: 0;
}

.empty {
  color: #858585;
  text-align: center;
  padding: 40px 20px;
  font-size: 13px;
}

.status {
  padding: 8px 12px;
  border-radius: 4px;
  margin-bottom: 12px;
  font-size: 13px;
  font-weight: 600;
}

.status.ok { background: #1a3d1a; color: #4ec9b0; }
.status.fail { background: #3d1a1a; color: #f48771; }

.results pre {
  background: #1e1e1e;
  padding: 12px;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.5;
  overflow-x: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
  margin: 0;
  max-width: 100%;
}


.header-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.reset-btn {
  padding: 6px 12px;
  background: #3e3e42;
  border: none;
  color: #858585;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.reset-btn:hover {
  background: #d32f2f;
  color: white;
}

.results::-webkit-scrollbar,
.file-list::-webkit-scrollbar,
.editor textarea::-webkit-scrollbar,
.results pre::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.results::-webkit-scrollbar-track,
.file-list::-webkit-scrollbar-track,
.editor textarea::-webkit-scrollbar-track,
.results pre::-webkit-scrollbar-track {
  background: #1e1e1e;
}

.results::-webkit-scrollbar-thumb,
.file-list::-webkit-scrollbar-thumb,
.editor textarea::-webkit-scrollbar-thumb,
.results pre::-webkit-scrollbar-thumb {
  background: #3e3e42;
  border-radius: 4px;
}

.results::-webkit-scrollbar-thumb:hover,
.file-list::-webkit-scrollbar-thumb:hover,
.editor textarea::-webkit-scrollbar-thumb:hover,
.results pre::-webkit-scrollbar-thumb:hover {
  background: #4e4e52;
}



</style>