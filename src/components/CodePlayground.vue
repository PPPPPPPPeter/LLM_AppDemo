<template>
  <div class="code-playground">
    <div class="header">
      <h1>🚀 代码编辑器 Playground</h1>
      <div class="controls">
        <div class="language-tabs">
          <button
              v-for="lang in languages"
              :key="lang.id"
              :class="['tab', { active: currentLanguage === lang.id }]"
              @click="changeLanguage(lang.id)">
            {{ lang.name }}
          </button>
        </div>
        <button class="btn btn-run" @click="runCode" :disabled="isRunning">
          {{ isRunning ? '运行中...' : '▶️ 运行代码' }}
        </button>
        <button class="btn btn-clear" @click="clearOutput">
          🗑️ 清空输出
        </button>
      </div>
    </div>

    <div class="main-content">
      <div class="left-panel">
        <div class="editor-container" ref="editorContainer"></div>
      </div>

      <div class="right-panel">
        <div class="output-section">
          <div class="section-title">📤 输出结果</div>
          <div :class="['output-box', outputType]">{{ output }}</div>
        </div>

        <div class="ai-section">
          <div class="section-title">🤖 AI 助手</div>
          <div class="api-config">
            <label>API Key (可选):</label>
            <input
                v-model="apiKey"
                type="password"
                placeholder="输入你的API密钥，留空使用示例模式">
          </div>
          <div class="ai-chat" ref="chatBox">
            <div v-for="(msg, idx) in messages" :key="idx" :class="['message', msg.role]">
              <div class="message-label">{{ msg.role === 'user' ? '你' : 'AI' }}</div>
              <div>{{ msg.content }}</div>
            </div>
            <div v-if="isAiThinking" class="message assistant">
              <div class="loading"></div> AI 正在思考...
            </div>
          </div>
          <div class="ai-input-group">
            <input
                v-model="aiPrompt"
                class="ai-input"
                placeholder="输入提示词，例如：帮我写一个冒泡排序"
                @keyup.enter="askAI">
            <button class="btn btn-ai" @click="askAI" :disabled="isAiThinking">
              发送
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'CodePlayground',

  data() {
    return {
      currentLanguage: 'javascript',
      languages: [
        { id: 'javascript', name: 'JavaScript', ext: 'js' },
        { id: 'python', name: 'Python', ext: 'py' },
        { id: 'ruby', name: 'Ruby', ext: 'rb' }
      ],
      editor: null,
      output: '等待运行代码...',
      outputType: '',
      isRunning: false,
      pyodide: null,

      apiKey: '',
      aiPrompt: '',
      messages: [],
      isAiThinking: false,

      codeTemplates: {
        javascript: `// JavaScript 示例
console.log('Hello from JavaScript!');

// 简单计算
const numbers = [1, 2, 3, 4, 5];
const sum = numbers.reduce((a, b) => a + b, 0);
console.log('Sum:', sum);

// 对象操作
const person = { name: 'Alice', age: 25 };
console.log('Person:', JSON.stringify(person));`,

        python: `# Python 示例
print('Hello from Python!')

# 使用 pandas
import pandas as pd
import numpy as np

# 创建数据
data = {
    'Name': ['Alice', 'Bob', 'Charlie'],
    'Age': [25, 30, 35],
    'Score': [85, 90, 95]
}

df = pd.DataFrame(data)
print('\\nDataFrame:')
print(df)

# 统计信息
print('\\n平均分:', df['Score'].mean())`,

        ruby: `# Ruby 示例
puts 'Hello from Ruby!'

# 数组操作
numbers = [1, 2, 3, 4, 5]
sum = numbers.reduce(:+)
puts "Sum: #{sum}"

# 哈希操作
person = { name: 'Alice', age: 25 }
puts "Person: #{person}"

# 迭代
(1..5).each do |i|
  puts "Number: #{i}"
end`
      }
    };
  },

  async mounted() {
    await this.$nextTick();
    await this.initMonaco();
    await this.initPyodide();
    this.messages.push({
      role: 'assistant',
      content: '你好！我是 AI 助手。你可以让我帮你生成代码、解释代码或优化代码。'
    });
  },

  beforeUnmount() {
    if (this.editor) {
      this.editor.dispose();
    }
  },

  methods: {
    async initMonaco() {
      try {
        if (window.monaco) {
          this.createEditor();
          return;
        }
        await this.loadMonacoFromCDN();
        this.createEditor();
      } catch (error) {
        console.error('Monaco Editor 初始化失败:', error);
        this.output = 'Monaco Editor 初始化失败，但功能仍可使用';
      }
    },

    async loadMonacoFromCDN() {
      return new Promise((resolve, reject) => {
        if (window.monaco) {
          resolve();
          return;
        }

        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs/editor/editor.main.css';
        document.head.appendChild(link);

        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs/loader.min.js';
        script.onload = () => {
          window.require.config({
            paths: {
              vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs'
            }
          });
          window.require(['vs/editor/editor.main'], () => {
            resolve();
          });
        };
        script.onerror = reject;
        document.head.appendChild(script);
      });
    },

    createEditor() {
      if (!this.$refs.editorContainer) return;

      this.editor = window.monaco.editor.create(this.$refs.editorContainer, {
        value: this.codeTemplates[this.currentLanguage],
        language: this.currentLanguage,
        theme: 'vs-dark',
        fontSize: 14,
        minimap: { enabled: false },
        automaticLayout: true
      });
    },

    async initPyodide() {
      try {
        this.output = 'Python 初始化中...';

        if (!window.loadPyodide) {
          await this.loadScript('https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js');
        }

        this.pyodide = await window.loadPyodide({
          indexURL: "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/"
        });
        await this.pyodide.loadPackage(['pandas', 'numpy']);
        this.output = 'Python 已就绪！';
        setTimeout(() => {
          this.output = '等待运行代码...';
        }, 2000);
      } catch (error) {
        console.error('Pyodide 初始化失败:', error);
        this.output = 'Python 初始化失败，但 JavaScript 可正常使用';
      }
    },

    loadScript(src) {
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    },

    changeLanguage(lang) {
      this.currentLanguage = lang;
      if (this.editor) {
        window.monaco.editor.setModelLanguage(
            this.editor.getModel(),
            lang
        );
        this.editor.setValue(this.codeTemplates[lang]);
      }
    },

    async runCode() {
      this.isRunning = true;
      const code = this.editor ? this.editor.getValue() : this.codeTemplates[this.currentLanguage];

      try {
        switch(this.currentLanguage) {
          case 'javascript':
            await this.runJavaScript(code);
            break;
          case 'python':
            await this.runPython(code);
            break;
          case 'ruby':
            await this.runRuby(code);
            break;
        }
      } catch (error) {
        this.output = `错误: ${error.message}`;
        this.outputType = 'error';
      }

      this.isRunning = false;
    },

    async runJavaScript(code) {
      const logs = [];
      const originalLog = console.log;
      const originalError = console.error;

      console.log = (...args) => {
        logs.push(args.map(arg =>
            typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' '));
      };
      console.error = (...args) => {
        logs.push('ERROR: ' + args.join(' '));
      };

      try {
        eval(code);
        this.output = logs.join('\n') || '代码执行完成（无输出）';
        this.outputType = 'success';
      } catch (error) {
        this.output = `错误: ${error.message}`;
        this.outputType = 'error';
      } finally {
        console.log = originalLog;
        console.error = originalError;
      }
    },

    async runPython(code) {
      if (!this.pyodide) {
        this.output = 'Python 环境未初始化';
        this.outputType = 'error';
        return;
      }

      try {
        this.pyodide.runPython(`
          import sys
          from io import StringIO
          sys.stdout = StringIO()
        `);

        await this.pyodide.runPythonAsync(code);

        const stdout = this.pyodide.runPython("sys.stdout.getvalue()");
        this.output = stdout || '代码执行完成（无输出）';
        this.outputType = 'success';
      } catch (error) {
        this.output = `Python 错误:\n${error.message}`;
        this.outputType = 'error';
      }
    },

    async runRuby(code) {
      this.output = '提示: Ruby 执行需要 ruby.wasm，当前为演示模式\n\n' +
          '你的 Ruby 代码:\n' + code;
      this.outputType = 'success';
    },

    clearOutput() {
      this.output = '输出已清空';
      this.outputType = '';
    },

    async askAI() {
      if (!this.aiPrompt.trim()) return;

      const userMessage = this.aiPrompt.trim();
      this.messages.push({
        role: 'user',
        content: userMessage
      });

      this.aiPrompt = '';
      this.isAiThinking = true;

      this.$nextTick(() => {
        if (this.$refs.chatBox) {
          this.$refs.chatBox.scrollTop = this.$refs.chatBox.scrollHeight;
        }
      });

      try {
        if (this.apiKey) {
          await this.callRealAPI(userMessage);
        } else {
          await this.demoAIResponse(userMessage);
        }
      } catch (error) {
        this.messages.push({
          role: 'assistant',
          content: `错误: ${error.message}`
        });
      }

      this.isAiThinking = false;
      this.$nextTick(() => {
        if (this.$refs.chatBox) {
          this.$refs.chatBox.scrollTop = this.$refs.chatBox.scrollHeight;
        }
      });
    },

    async callRealAPI(userMessage) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: `你是一个编程助手。当前语言是 ${this.currentLanguage}。帮助用户编写和理解代码。`
            },
            ...this.messages.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: userMessage }
          ]
        })
      });

      const data = await response.json();
      const aiResponse = data.choices[0].message.content;

      this.messages.push({
        role: 'assistant',
        content: aiResponse
      });

      const codeMatch = aiResponse.match(/```[\w]*\n([\s\S]*?)```/);
      if (codeMatch && codeMatch[1]) {
        const shouldInsert = confirm('AI 生成了代码，是否插入到编辑器？');
        if (shouldInsert && this.editor) {
          this.editor.setValue(codeMatch[1].trim());
        }
      }
    },

    async demoAIResponse(userMessage) {
      await new Promise(resolve => setTimeout(resolve, 1500));

      let response = '';
      const lower = userMessage.toLowerCase();

      if (lower.includes('冒泡排序') || lower.includes('排序')) {
        if (this.currentLanguage === 'javascript') {
          response = `好的，这是 JavaScript 的冒泡排序实现：

\`\`\`javascript
function bubbleSort(arr) {
    const n = arr.length;
    for (let i = 0; i < n - 1; i++) {
        for (let j = 0; j < n - i - 1; j++) {
            if (arr[j] > arr[j + 1]) {
                [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
            }
        }
    }
    return arr;
}

const numbers = [64, 34, 25, 12, 22, 11, 90];
console.log('排序前:', numbers);
console.log('排序后:', bubbleSort([...numbers]));
\`\`\`

是否要我插入到编辑器？`;
        } else if (this.currentLanguage === 'python') {
          response = `好的，这是 Python 的冒泡排序实现：

\`\`\`python
def bubble_sort(arr):
    n = len(arr)
    for i in range(n - 1):
        for j in range(n - i - 1):
            if arr[j] > arr[j + 1]:
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
    return arr

numbers = [64, 34, 25, 12, 22, 11, 90]
print('排序前:', numbers)
sorted_numbers = bubble_sort(numbers.copy())
print('排序后:', sorted_numbers)
\`\`\``;
        }

        this.messages.push({
          role: 'assistant',
          content: response
        });

        const codeMatch = response.match(/```[\w]*\n([\s\S]*?)```/);
        if (codeMatch && codeMatch[1] && this.editor) {
          const shouldInsert = confirm('是否将代码插入到编辑器？');
          if (shouldInsert) {
            this.editor.setValue(codeMatch[1].trim());
          }
        }
      } else if (lower.includes('pandas') || lower.includes('数据')) {
        response = `我可以帮你使用 Pandas 处理数据。这里有一个示例：

\`\`\`python
import pandas as pd
import numpy as np

# 创建示例数据
data = {
    '姓名': ['张三', '李四', '王五', '赵六'],
    '年龄': [25, 30, 35, 28],
    '薪资': [8000, 12000, 15000, 10000]
}

df = pd.DataFrame(data)
print('数据表:')
print(df)

print('\\n统计信息:')
print(df.describe())

print('\\n平均薪资:', df['薪资'].mean())
\`\`\``;

        this.messages.push({
          role: 'assistant',
          content: response
        });
      } else {
        response = `收到你的消息！当前语言是 ${this.currentLanguage}。

提示：你可以尝试：
- "帮我写一个冒泡排序"
- "生成一个 pandas 数据分析示例"
- "优化我的代码"

注意：这是演示模式。如果需要真实的 AI 响应，请在上方输入你的 API Key。`;

        this.messages.push({
          role: 'assistant',
          content: response
        });
      }
    }
  }
};
</script>

<style scoped>
.code-playground {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #1e1e1e;
  color: #fff;
}

.header {
  background: #2d2d30;
  padding: 15px 20px;
  border-bottom: 1px solid #3e3e42;
}

.header h1 {
  font-size: 20px;
  margin-bottom: 10px;
}

.controls {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.language-tabs {
  display: flex;
  gap: 5px;
}

.tab {
  padding: 8px 16px;
  background: #3e3e42;
  border: none;
  color: #fff;
  cursor: pointer;
  border-radius: 4px;
  font-size: 14px;
  transition: background 0.2s;
}

.tab:hover {
  background: #4e4e52;
}

.tab.active {
  background: #0e639c;
}

.btn {
  padding: 8px 20px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
}

.btn-run {
  background: #16825d;
  color: white;
}

.btn-run:hover {
  background: #1a9e6f;
}

.btn-clear {
  background: #d13438;
  color: white;
}

.btn-clear:hover {
  background: #e13d41;
}

.btn-ai {
  background: #8b5cf6;
  color: white;
}

.btn-ai:hover {
  background: #9d6ff7;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.main-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.left-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #3e3e42;
}

.right-panel {
  width: 400px;
  display: flex;
  flex-direction: column;
  background: #252526;
}

.editor-container {
  flex: 1;
  overflow: hidden;
}

.output-section, .ai-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 15px;
  overflow: hidden;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 10px;
  color: #ccc;
}

.output-box, .ai-chat {
  flex: 1;
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  padding: 15px;
  overflow-y: auto;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 13px;
  line-height: 1.5;
}

.output-box.success {
  color: #4ec9b0;
}

.output-box.error {
  color: #f48771;
}

.ai-input-group {
  margin-top: 10px;
  display: flex;
  gap: 10px;
}

.ai-input {
  flex: 1;
  padding: 10px;
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  color: #fff;
  font-size: 14px;
}

.ai-chat {
  white-space: pre-wrap;
  word-wrap: break-word;
}

.message {
  margin-bottom: 15px;
  padding: 10px;
  border-radius: 4px;
}

.message.user {
  background: #2d2d30;
  border-left: 3px solid #8b5cf6;
}

.message.assistant {
  background: #1e1e1e;
  border-left: 3px solid #16825d;
}

.message-label {
  font-weight: 600;
  margin-bottom: 5px;
  font-size: 12px;
  opacity: 0.7;
}

.loading {
  display: inline-block;
  width: 20px;
  height: 20px;
  border: 3px solid #3e3e42;
  border-top-color: #8b5cf6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.api-config {
  background: #2d2d30;
  padding: 10px;
  margin-bottom: 10px;
  border-radius: 4px;
  font-size: 12px;
}

.api-config input {
  width: 100%;
  padding: 6px;
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  color: #fff;
  font-size: 12px;
  margin-top: 5px;
}
</style>