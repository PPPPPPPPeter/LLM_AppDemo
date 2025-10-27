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
          <span v-if="message.role === 'assistant'
          && message.content && isLoading && index === messages.length - 1" class="typing-cursor">▊</span>
        </div>
        <button
            v-if="message.role === 'user'"
            class="edit-btn"
            @click="editMessage(index)"
        >
          Edit
        </button>
      </div>
    </div>

    <!-- 输入区域 -->
    <div class="input-area">
      <textarea
          v-model="userInput"
          class="input-box"
          placeholder="Your Message ...（Enter to send, Shift+Enter to change line）"
          @keydown.enter.exact.prevent="sendMessage"
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
import { ref, nextTick } from 'vue'
import { callLLMAPI } from '../api/llm'

const messages = ref([])
const userInput = ref('')
const isLoading = ref(false)
const messagesArea = ref(null)

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

  // 添加用户消息
  messages.value.push({
    role: 'user',
    content: content
  })

  userInput.value = ''
  scrollToBottom()
  isLoading.value = true

  // 添加一个空的AI消息用于流式显示
  const aiMessageIndex = messages.value.length
  messages.value.push({
    role: 'assistant',
    content: ''
  })

  try {
    // 调用API，使用流式输出
    await callLLMAPI(
        messages.value.slice(0, -1), // 不包含刚添加的空消息
        (chunk) => {
          // 实时更新AI消息内容
          messages.value[aiMessageIndex].content += chunk
          scrollToBottom()
        }
    )

    scrollToBottom()
  } catch (error) {
    // 如果出错，更新消息为错误信息
    messages.value[aiMessageIndex].content = `Error: ${error.message}`
  } finally {
    isLoading.value = false
  }
}

const editMessage = (index) => {
  const message = messages.value[index]
  if (message.role === 'user') {
    userInput.value = message.content
    // 删除该消息及之后的所有消息
    messages.value = messages.value.slice(0, index)
  }
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

.edit-btn {
  padding: 4px 12px;
  background: transparent;
  border: 1px solid #3e3e42;
  color: #cccccc;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.edit-btn:hover {
  background: #3e3e42;
  color: #fff;
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

/* 滚动条样式 */
.messages-area::-webkit-scrollbar {
  width: 8px;
}

.messages-area::-webkit-scrollbar-track {
  background: #1e1e1e;
}

.messages-area::-webkit-scrollbar-thumb {
  background: #3e3e42;
  border-radius: 4px;
}

.messages-area::-webkit-scrollbar-thumb:hover {
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