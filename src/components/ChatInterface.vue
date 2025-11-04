<template>
  <div class="chat-container">
    <!-- 消息展示区域 -->
    <div class="messages-area" ref="messagesArea">
      <div
          v-for="(message, index) in messages"
          :key="index"
          :class="['message-item', message.role]"
      >
        <div class="message-content">
          {{ message.content }}
          <span v-if="message.role === 'assistant' && message.content && isLoading && index === messages.length - 1" class="typing-cursor">▊</span>

          <!-- 文件结构展示 -->
          <div v-if="message.fileStructure" class="file-structure">
            <div class="structure-header">
              <span class="structure-icon">📁</span>
              <span class="structure-title">Project Structure</span>
              <span class="structure-count">{{ message.fileStructure.files.length }} files</span>
            </div>
            <div class="structure-tree">
              <div
                  v-for="(file, fIdx) in message.fileStructure.files"
                  :key="fIdx"
                  class="structure-file"
                  :class="{ 'is-main': file.path === message.fileStructure.mainFile }"
              >
                <span class="file-icon">{{ getFileIcon(file.path) }}</span>
                <span class="file-path">{{ file.path }}</span>
                <span v-if="file.path === message.fileStructure.mainFile" class="main-badge">MAIN</span>
              </div>
            </div>
          </div>

          <!-- 执行结果 -->
          <div v-if="message.executionResult" class="execution-result">
            <div class="result-header">
              <span class="result-icon" :class="message.executionResult.success ? 'success' : 'error'">
                {{ message.executionResult.success ? '✓' : '✗' }}
              </span>
              <span class="result-type">{{ getExecutionTypeLabel(message.executionResult.type) }}</span>
              <span class="result-status">
                {{ message.executionResult.success ? 'Execution Successful' : 'Execution Failed' }}
              </span>
            </div>
            <pre class="result-output">{{ message.executionResult.output }}</pre>
          </div>
        </div>

        <div class="message-actions">
          <button
              v-if="message.role === 'user'"
              class="action-btn"
              @click="editMessage(index)"
          >
            Edit
          </button>
          <button
              v-if="message.role === 'assistant' && hasExecutableCode(message.content)"
              class="action-btn run-btn"
              @click="runCode(index)"
              :disabled="isExecuting"
          >
            {{ isExecuting ? 'Running...' : '▶ Run Code' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 输入区域 -->
    <div class="input-area">
      <textarea
          v-model="userInput"
          class="input-box"
          placeholder="Type your message... (Ctrl+Enter to send)&#10;&#10;💡 The AI uses structured output format and supports module imports"
          @keydown.enter.ctrl.exact="sendMessage"
          rows="3"
      ></textarea>
      <button
          class="send-btn"
          @click="sendMessage"
          :disabled="!userInput.trim() || isLoading"
      >
        {{ isLoading ? 'Sending...' : 'Send' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick, watch } from 'vue'
import { callLLMAPI } from '../api/llm'
import { smartExecute, hasExecutableCode, parseStructuredOutput } from '../api/executor-api'
import { getSystemPromptForModel } from '../api/system-prompts'

const props = defineProps({
  currentModel: {
    type: String,
    default: 'deepseek-chat'
  }
})

const messages = ref([])
const userInput = ref('')
const isLoading = ref(false)
const isExecuting = ref(false)
const messagesArea = ref(null)

watch(() => props.currentModel, () => {
  messages.value = []
  userInput.value = ''
})

const scrollToBottom = () => {
  nextTick(() => {
    if (messagesArea.value) {
      messagesArea.value.scrollTop = messagesArea.value.scrollHeight
    }
  })
}

const sendMessage = async () => {
  const content = userInput.value.trim()
  if (!content || isLoading.value) return

  messages.value.push({
    role: 'user',
    content: content
  })

  userInput.value = ''
  scrollToBottom()
  isLoading.value = true

  const aiMessageIndex = messages.value.length
  messages.value.push({
    role: 'assistant',
    content: ''
  })

  try {
    // 构建消息历史，在第一条消息前添加系统提示
    const systemPrompt = getSystemPromptForModel(props.currentModel)
    const messagesWithSystem = [
      { role: 'system', content: systemPrompt },
      ...messages.value.slice(0, -1) // 排除刚添加的空消息
    ]

    await callLLMAPI(
        messagesWithSystem,
        (chunk) => {
          messages.value[aiMessageIndex].content += chunk
          scrollToBottom()
        },
        { model: props.currentModel }
    )

    // 解析文件结构
    const aiMessage = messages.value[aiMessageIndex]
    const parsed = parseStructuredOutput(aiMessage.content)
    if (parsed && parsed.files && parsed.files.length > 0) {
      aiMessage.fileStructure = {
        files: parsed.files.map(f => ({ path: f.path })),
        mainFile: parsed.mainFile
      }
    }

    scrollToBottom()
  } catch (error) {
    messages.value[aiMessageIndex].content = `Error: ${error.message}`
  } finally {
    isLoading.value = false
  }
}

const editMessage = (index) => {
  const message = messages.value[index]
  if (message.role === 'user') {
    userInput.value = message.content
    messages.value = messages.value.slice(0, index)
  }
}

// 运行代码
const runCode = async (messageIndex) => {
  const message = messages.value[messageIndex]
  if (!message || isExecuting.value) return

  isExecuting.value = true

  // 添加一个临时的"正在执行"消息
  message.executionResult = {
    type: 'pending',
    success: null,
    output: '⏳ 正在准备执行环境...'
  }
  messages.value = [...messages.value]
  scrollToBottom()

  try {
    console.log('🚀 开始智能执行代码...')

    const result = await smartExecute(message.content)

    message.executionResult = {
      type: result.type || 'unknown',
      success: result.success,
      output: result.output,
      exitCode: result.exitCode,
      testPassed: result.testPassed
    }

    messages.value = [...messages.value]
    scrollToBottom()

  } catch (error) {
    console.error('❌ Execution failed:', error)

    let errorMsg = error.message
    if (errorMsg.includes('未找到可执行的代码')) {
      errorMsg = '❌ 未找到可执行的代码\n\n💡 提示: 请使用以下格式:\n\nFILE: filename.py\n```python\n...\n```\n\nMAIN_FILE: filename.py'
    } else if (errorMsg.includes('Docker')) {
      errorMsg = '❌ Docker错误\n\n' + errorMsg + '\n\n请确保:\n1. Docker Desktop已安装并运行\n2. 已执行: docker pull python:3.11-alpine\n3. 已执行: docker pull node:18-alpine'
    }

    message.executionResult = {
      type: 'error',
      success: false,
      output: errorMsg
    }
    messages.value = [...messages.value]
    scrollToBottom()
  } finally {
    isExecuting.value = false
  }
}

const getExecutionTypeLabel = (type) => {
  const labels = {
    'python': 'Python',
    'javascript': 'JavaScript',
    'python-test': 'Python Unit Test',
    'javascript-test': 'JavaScript Test',
    'gherkin': 'Gherkin BDD Test',
    'project': 'Multi-file Project'
  }
  return labels[type] || type
}

const getFileIcon = (path) => {
  if (path.endsWith('.py')) return '🐍'
  if (path.endsWith('.js')) return '📜'
  if (path.endsWith('.feature')) return '🥒'
  if (path.endsWith('.json')) return '📋'
  if (path.endsWith('.md')) return '📝'
  return '📄'
}
</script>

<style scoped>
.chat-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #1e1e1e;
}

.messages-area {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.message-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.message-item.user {
  justify-content: flex-end;
}

.message-item.assistant {
  justify-content: flex-start;
}

.message-content {
  max-width: 70%;
  padding: 12px 16px;
  border-radius: 8px;
  word-wrap: break-word;
  white-space: pre-wrap;
}

.message-item.user .message-content {
  background: #0e639c;
  color: #fff;
}

.message-item.assistant .message-content {
  background: #2d2d30;
  color: #fff;
  border: 1px solid #3e3e42;
}

/* 文件结构展示 */
.file-structure {
  margin-top: 12px;
  padding: 12px;
  background: #1a1a1a;
  border: 1px solid #3e3e42;
  border-radius: 6px;
}

.structure-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #3e3e42;
}

.structure-icon {
  font-size: 16px;
}

.structure-title {
  font-size: 13px;
  font-weight: 600;
  color: #4ec9b0;
}

.structure-count {
  font-size: 12px;
  color: #858585;
  margin-left: auto;
}

.structure-tree {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.structure-file {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: #0d0d0d;
  border-radius: 4px;
  font-size: 12px;
  font-family: 'Courier New', monospace;
  transition: background 0.2s;
}

.structure-file:hover {
  background: #1e1e1e;
}

.structure-file.is-main {
  background: #1e3a1e;
  border: 1px solid #4ec9b0;
}

.file-icon {
  font-size: 14px;
}

.file-path {
  flex: 1;
  color: #d4d4d4;
}

.main-badge {
  padding: 2px 6px;
  background: #4ec9b0;
  color: #1e1e1e;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 600;
}

.message-actions {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.action-btn {
  padding: 6px 12px;
  background: transparent;
  border: 1px solid #3e3e42;
  color: #cccccc;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
  white-space: nowrap;
}

.action-btn:hover:not(:disabled) {
  background: #3e3e42;
  color: #fff;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.run-btn {
  background: #0e639c;
  border-color: #0e639c;
  color: #fff;
}

.run-btn:hover:not(:disabled) {
  background: #1177bb;
  border-color: #1177bb;
}

.execution-result {
  margin-top: 12px;
  padding: 12px;
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  border-radius: 6px;
}

.result-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 500;
}

.result-icon {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}

.result-icon.success {
  background: #4ec9b0;
  color: #1e1e1e;
}

.result-icon.error {
  background: #f48771;
  color: #1e1e1e;
}

.result-type {
  color: #4ec9b0;
}

.result-status {
  color: #cccccc;
}

.result-output {
  margin: 0;
  padding: 8px;
  background: #0d0d0d;
  border-radius: 4px;
  font-size: 12px;
  font-family: 'Courier New', monospace;
  color: #d4d4d4;
  overflow-x: auto;
  white-space: pre-wrap;
  max-height: 300px;
  overflow-y: auto;
}

.input-area {
  display: flex;
  gap: 12px;
  padding: 20px;
  background: #252526;
  border-top: 1px solid #3e3e42;
}

.input-box {
  flex: 1;
  padding: 12px;
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
  font-family: inherit;
  resize: none;
  outline: none;
}

.input-box:focus {
  border-color: #0e639c;
}

.input-box::placeholder {
  color: #6e6e6e;
}

.send-btn {
  padding: 12px 32px;
  background: #0e639c;
  border: none;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.send-btn:hover:not(:disabled) {
  background: #1177bb;
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.messages-area::-webkit-scrollbar,
.result-output::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.messages-area::-webkit-scrollbar-track,
.result-output::-webkit-scrollbar-track {
  background: #1e1e1e;
}

.messages-area::-webkit-scrollbar-thumb,
.result-output::-webkit-scrollbar-thumb {
  background: #3e3e42;
  border-radius: 4px;
}

.messages-area::-webkit-scrollbar-thumb:hover,
.result-output::-webkit-scrollbar-thumb:hover {
  background: #4e4e52;
}

.typing-cursor {
  display: inline-block;
  margin-left: 2px;
  animation: blink 1s infinite;
  color: #4ec9b0;
}

@keyframes blink {
  0%, 50% {
    opacity: 1;
  }
  51%, 100% {
    opacity: 0;
  }
}
</style>