<template>
  <div class="test-runner">
    <header>
      <h1>🧪 Python Test Runner</h1>
      <div class="header-actions">
        <span>Write Python code & tests, then run</span>
        <button @click="resetStorage" class="reset-btn" title="Clear all files and reset">🗑️ Reset</button>
      </div>
    </header>

    <div class="workspace">
      <aside class="files-sidebar" :style="{ width: sidebarWidth + 'px' }">
        <div class="sidebar-header">
          <h3>Files</h3>
          <div class="header-buttons">
            <button @click="addFile" title="New File">📄</button>
            <button @click="addFolder" title="New Folder">📁</button>
          </div>
        </div>
        <div class="file-list">
          <FileTreeItem
              v-for="(item, i) in fileTree"
              :key="item.id"
              :item="item"
              :depth="0"
              :is-selected="isSelected(item)"
              @select="selectItem"
              @rename="renameItem"
              @delete="deleteItem"
          />
        </div>
      </aside>

      <!-- 左侧拖拽条 -->
      <div class="resizer resizer-left" @mousedown="startDragLeft"></div>

      <main class="editor">
        <div class="editor-tab">
          {{ currentItem?.type === 'folder' ? '📁 ' + currentItem.name : currentItem?.path || 'No file' }}
        </div>
        <div v-if="currentItem?.type === 'folder'" class="folder-view">
          <div class="folder-info">
            <h3>📁 {{ currentItem.name }}</h3>
            <p>{{ getFolderStats(currentItem) }}</p>
            <div class="folder-actions">
              <button @click="addFileToFolder(currentItem)">➕ New File</button>
              <button @click="addSubfolder(currentItem)">➕ New Subfolder</button>
            </div>
          </div>
        </div>
        <textarea
            v-else-if="currentItem?.type === 'file'"
            v-model="currentItem.content"
            spellcheck="false"
        ></textarea>
        <div v-else class="empty-state">
          Select a file to edit
        </div>
      </main>

      <!-- 右侧拖拽条 -->
      <div class="resizer resizer-right" @mousedown="startDragRight"></div>

      <aside class="test-panel" :style="{ width: rightPanelWidth + 'px' }">
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
import FileTreeItem from './components/FileTreeItem.vue'

// 从 localStorage 加载文件树
const loadFileTreeFromStorage = () => {
  try {
    const saved = localStorage.getItem('test-runner-file-tree')
    if (saved) {
      const parsed = JSON.parse(saved)
      console.log('📂 从本地存储加载了文件树')
      return parsed
    }
  } catch (error) {
    console.error('加载文件失败:', error)
  }

  // 默认结构
  return [
    {
      id: 'calculator-folder',
      type: 'folder',
      name: 'calculator',
      children: [
        { id: 'calc-py', type: 'file', name: 'calculator.py', path: 'calculator/calculator.py', content: 'def add(a, b):\n    return a + b\n\ndef subtract(a, b):\n    return a - b' },
        { id: 'calc-feature', type: 'file', name: 'calculator.feature', path: 'calculator/calculator.feature', content: 'Feature: Calculator\n  Scenario: Add two numbers\n    Given I have a calculator\n    When I add 2 and 3\n    Then the result should be 5' },
        {
          id: 'calc-steps-folder',
          type: 'folder',
          name: 'steps',
          children: [
            { id: 'calc-steps', type: 'file', name: 'calculator_steps.py', path: 'calculator/steps/calculator_steps.py', content: 'from behave import given, when, then\nfrom calculator import add\n\n@given("I have a calculator")\ndef step_impl(context):\n    pass\n\n@when("I add {a:d} and {b:d}")\ndef step_impl(context, a, b):\n    context.result = add(a, b)\n\n@then("the result should be {expected:d}")\ndef step_impl(context, expected):\n    assert context.result == expected' }
          ]
        }
      ]
    }
  ]
}

const fileTree = ref(loadFileTreeFromStorage())
const currentItemId = ref(null)
const running = ref(false)
const result = ref(null)
const testType = ref('auto')

// 拖拽相关
const sidebarWidth = ref(250)
const rightPanelWidth = ref(400)
const isDraggingLeft = ref(false)
const isDraggingRight = ref(false)

// 监听文件树变化，自动保存
watch(fileTree, (newTree) => {
  try {
    localStorage.setItem('test-runner-file-tree', JSON.stringify(newTree))
    console.log('💾 已保存文件树')
  } catch (error) {
    console.error('保存失败:', error)
  }
}, { deep: true })

// 加载上次选中的项
onMounted(() => {
  try {
    const savedId = localStorage.getItem('test-runner-current-item-id')
    if (savedId) {
      currentItemId.value = savedId
    }
  } catch (error) {
    console.error('加载索引失败:', error)
  }
})

// 保存当前选中的项
watch(currentItemId, (newId) => {
  if (newId) {
    localStorage.setItem('test-runner-current-item-id', newId)
  }
})

// 查找项
function findItemById(tree, id) {
  for (const item of tree) {
    if (item.id === id) return item
    if (item.children) {
      const found = findItemById(item.children, id)
      if (found) return found
    }
  }
  return null
}

// 当前选中的项
const currentItem = computed(() => {
  if (!currentItemId.value) return null
  return findItemById(fileTree.value, currentItemId.value)
})

// 判断是否为测试文件
function isTestFile(item) {
  if (!item || item.type !== 'file') return false
  const name = item.name
  return name.includes('test_') ||
      name.startsWith('test_') ||
      name.endsWith('.feature') ||
      name.endsWith('_test.py')
}

const canRunCurrentFile = computed(() => isTestFile(currentItem.value))

function getCurrentFileStatus() {
  const item = currentItem.value
  if (!item) return 'No file selected'
  if (item.type === 'folder') return `${item.name} (folder)`

  if (isTestFile(item)) {
    return `${item.name} ✓`
  }

  return `${item.name} (not a test file)`
}

// 生成唯一ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

// 添加文件到根目录
function addFile() {
  const name = prompt('Filename (e.g., test_example.py, example.py):')
  if (name?.trim()) {
    const newFile = {
      id: generateId(),
      type: 'file',
      name: name.trim(),
      path: name.trim(),
      content: ''
    }
    fileTree.value.push(newFile)
    currentItemId.value = newFile.id
  }
}

// 添加文件夹到根目录
function addFolder() {
  const name = prompt('Folder name:')
  if (name?.trim()) {
    const newFolder = {
      id: generateId(),
      type: 'folder',
      name: name.trim(),
      children: []
    }
    fileTree.value.push(newFolder)
    currentItemId.value = newFolder.id
  }
}

// 添加文件到指定文件夹
function addFileToFolder(folder) {
  const name = prompt('Filename:')
  if (name?.trim()) {
    const folderPath = getFolderPath(folder)
    const newFile = {
      id: generateId(),
      type: 'file',
      name: name.trim(),
      path: folderPath + '/' + name.trim(),
      content: ''
    }
    if (!folder.children) {
      folder.children = []
    }
    folder.children.push(newFile)
    currentItemId.value = newFile.id
  }
}

// 添加子文件夹
function addSubfolder(folder) {
  const name = prompt('Subfolder name:')
  if (name?.trim()) {
    const newFolder = {
      id: generateId(),
      type: 'folder',
      name: name.trim(),
      children: []
    }
    if (!folder.children) {
      folder.children = []
    }
    folder.children.push(newFolder)
    currentItemId.value = newFolder.id
  }
}

// 获取文件夹路径
function getFolderPath(folder) {
  function findPath(tree, targetId, currentPath = '') {
    for (const item of tree) {
      const itemPath = currentPath ? `${currentPath}/${item.name}` : item.name
      if (item.id === targetId) {
        return itemPath
      }
      if (item.children) {
        const found = findPath(item.children, targetId, itemPath)
        if (found) return found
      }
    }
    return null
  }
  return findPath(fileTree.value, folder.id) || folder.name
}

// 获取文件夹统计信息
function getFolderStats(folder) {
  let fileCount = 0
  let folderCount = 0

  function count(items) {
    for (const item of items) {
      if (item.type === 'file') {
        fileCount++
      } else if (item.type === 'folder') {
        folderCount++
        if (item.children) {
          count(item.children)
        }
      }
    }
  }

  if (folder.children) {
    count(folder.children)
  }

  return `${fileCount} files, ${folderCount} folders`
}

// 选中项
function selectItem(item) {
  currentItemId.value = item.id
}

// 判断是否选中
function isSelected(item) {
  return item.id === currentItemId.value
}

// 重命名项
function renameItem(item) {
  const newName = prompt(`Rename "${item.name}" to:`, item.name)
  if (newName?.trim() && newName !== item.name) {
    item.name = newName.trim()
    if (item.type === 'file') {
      // 更新文件路径
      const pathParts = item.path.split('/')
      pathParts[pathParts.length - 1] = newName.trim()
      item.path = pathParts.join('/')
    }
  }
}

// 删除项
function deleteItem(itemToDelete, tree = fileTree.value) {
  for (let i = 0; i < tree.length; i++) {
    if (tree[i].id === itemToDelete.id) {
      const confirmed = itemToDelete.type === 'folder'
          ? confirm(`Delete folder "${itemToDelete.name}" and all its contents?`)
          : confirm(`Delete "${itemToDelete.name}"?`)

      if (confirmed) {
        tree.splice(i, 1)
        if (currentItemId.value === itemToDelete.id) {
          currentItemId.value = null
        }
      }
      return
    }
    if (tree[i].children) {
      deleteItem(itemToDelete, tree[i].children)
    }
  }
}

// 收集文件夹中的所有文件
function collectFilesFromFolder(folder, files = []) {
  if (!folder || !folder.children) return files

  for (const item of folder.children) {
    if (item.type === 'file') {
      files.push({
        path: item.path,
        content: item.content
      })
    } else if (item.type === 'folder') {
      collectFilesFromFolder(item, files)
    }
  }

  return files
}

// 获取项所在的文件夹
function getParentFolder(itemId, tree = fileTree.value, parent = null) {
  for (const item of tree) {
    if (item.id === itemId) {
      return parent
    }
    if (item.children) {
      const found = getParentFolder(itemId, item.children, item)
      if (found !== null) return found
    }
  }
  return null
}

// 运行测试
async function runTests() {
  if (!canRunCurrentFile.value) {
    result.value = {
      success: false,
      output: 'Error: Current file is not a test file.\n\nPlease select a test file:\n- test_*.py\n- *_test.py\n- *.feature'
    }
    return
  }

  running.value = true
  result.value = null

  try {
    const currentFile = currentItem.value
    const parentFolder = getParentFolder(currentFile.id)

    let fileList = []

    if (parentFolder) {
      // 收集父文件夹中的所有文件
      fileList = collectFilesFromFolder(parentFolder)
    } else {
      // 根目录下的文件，只包含自己
      fileList = [{
        path: currentFile.path,
        content: currentFile.content
      }]
    }

    let type = testType.value

    if (type === 'auto') {
      if (currentFile.name.endsWith('.feature')) {
        type = 'gherkin'
      } else {
        type = 'python-test'
      }
    }

    const actualType = fileList.length > 1 ? 'project' : type

    console.log('🚀 执行测试:', {
      type: actualType,
      mainFile: currentFile.path,
      files: fileList.length,
      folder: parentFolder?.name || 'root'
    })

    result.value = await executeCode(actualType, '', {
      files: fileList,
      mainFile: currentFile.path
    })
  } catch (error) {
    result.value = { success: false, output: error.message }
  } finally {
    running.value = false
  }
}

// 重置存储
function resetStorage() {
  if (confirm('Are you sure you want to delete all files and reset to defaults?\n\nThis action cannot be undone.')) {
    localStorage.removeItem('test-runner-file-tree')
    localStorage.removeItem('test-runner-current-item-id')
    fileTree.value = loadFileTreeFromStorage()
    currentItemId.value = null
    result.value = null
    console.log('🔄 已重置所有数据')
  }
}

// 拖拽调整宽度
function startDragLeft(e) {
  isDraggingLeft.value = true
  document.addEventListener('mousemove', doDragLeft)
  document.addEventListener('mouseup', stopDragLeft)
  e.preventDefault()
}

function doDragLeft(e) {
  if (isDraggingLeft.value) {
    const newWidth = e.clientX
    if (newWidth >= 200 && newWidth <= 500) {
      sidebarWidth.value = newWidth
    }
  }
}

function stopDragLeft() {
  isDraggingLeft.value = false
  document.removeEventListener('mousemove', doDragLeft)
  document.removeEventListener('mouseup', stopDragLeft)
}

function startDragRight(e) {
  isDraggingRight.value = true
  document.addEventListener('mousemove', doDragRight)
  document.addEventListener('mouseup', stopDragRight)
  e.preventDefault()
}

function doDragRight(e) {
  if (isDraggingRight.value) {
    const newWidth = window.innerWidth - e.clientX
    if (newWidth >= 300 && newWidth <= 600) {
      rightPanelWidth.value = newWidth
    }
  }
}

function stopDragRight() {
  isDraggingRight.value = false
  document.removeEventListener('mousemove', doDragRight)
  document.removeEventListener('mouseup', stopDragRight)
}
</script>

<style scoped>
/* 基础样式保持不变，添加文件夹相关样式 */
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

.workspace {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
  position: relative;
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

.header-buttons {
  display: flex;
  gap: 4px;
}

.sidebar-header button {
  background: #0e639c;
  border: none;
  color: white;
  width: 28px;
  height: 24px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sidebar-header button:hover {
  background: #1177bb;
}

.file-list {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  min-height: 0;
  min-width: 400px;
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

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #858585;
  font-size: 14px;
}

.folder-view {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
}

.folder-info {
  text-align: center;
  background: #2d2d30;
  padding: 40px;
  border-radius: 8px;
  border: 1px solid #3e3e42;
}

.folder-info h3 {
  margin: 0 0 12px 0;
  font-size: 24px;
}

.folder-info p {
  margin: 0 0 24px 0;
  color: #858585;
  font-size: 14px;
}

.folder-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.folder-actions button {
  padding: 10px 20px;
  background: #0e639c;
  border: none;
  color: white;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}

.folder-actions button:hover {
  background: #1177bb;
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

.resizer {
  width: 4px;
  background: #3e3e42;
  cursor: col-resize;
  position: relative;
  flex-shrink: 0;
  transition: background 0.2s;
}

.resizer:hover {
  background: #0e639c;
}

.resizer::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  width: 8px;
  left: -2px;
}

/* 滚动条样式 */
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