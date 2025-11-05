<template>
  <div class="test-runner">
    <header>
      <h1>🧪 Test Runner</h1>
      <span>Write code & tests, then run</span>
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
import { ref, computed } from 'vue'
import { executeCode } from './api/executor-api'

const files = ref([
  { name: 'calculator.py', content: 'def add(a, b):\n    return a + b\n\ndef subtract(a, b):\n    return a - b' },
  { name: 'test_calculator.py', content: 'from calculator import add, subtract\n\ndef test_add():\n    assert add(2, 3) == 5\n\ndef test_subtract():\n    assert subtract(5, 2) == 3' }
])

const current = ref(0)
const running = ref(false)
const result = ref(null)
const testType = ref('auto')

// 判断是否是测试文件
function isTestFile(filename) {
  return filename.includes('test_') ||
      filename.startsWith('test_') ||
      filename.endsWith('.feature') ||
      filename.endsWith('_test.py') ||
      filename.endsWith('_test.js') ||
      filename.endsWith('.test.js')
}

// 判断当前文件是否可以运行
const canRunCurrentFile = computed(() => {
  const currentFileName = files.value[current.value]?.name
  if (!currentFileName) return false
  return isTestFile(currentFileName)
})

// 获取当前文件状态显示
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
    if (current.value >= files.value.length) current.value = Math.max(0, files.value.length - 1)
  }
}

function getIcon(name) {
  if (name.endsWith('.py')) return '🐍'
  if (name.endsWith('.js')) return '📜'
  if (name.endsWith('.feature')) return '🥒'
  return '📄'
}

async function runTests() {
  // 检查当前文件是否是测试文件
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

    // 直接使用当前文件作为主文件（不再查找对应的测试）
    const mainFile = files.value[current.value].name

    let type = testType.value

    // 自动检测类型
    if (type === 'auto') {
      if (mainFile.endsWith('.feature')) {
        type = 'gherkin'
      } else if (mainFile.endsWith('.py')) {
        type = 'python-test'
      } else {
        type = 'javascript-test'
      }
    }

    // 对于多文件项目，统一用 'project' 类型
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
}

.files-sidebar {
  background: #252526;
  border-right: 1px solid #3e3e42;
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  padding: 10px;
  border-bottom: 1px solid #3e3e42;
  display: flex;
  justify-content: space-between;
  align-items: center;
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
}

.editor-tab {
  padding: 10px 16px;
  background: #2d2d30;
  border-bottom: 1px solid #3e3e42;
  font-size: 13px;
  color: #858585;
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
}

.test-panel {
  background: #252526;
  border-left: 1px solid #3e3e42;
  display: flex;
  flex-direction: column;
}

.test-controls {
  padding: 10px;
  border-bottom: 1px solid #3e3e42;
  display: flex;
  gap: 8px;
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
  padding: 12px;
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
  margin: 0;
}
</style>