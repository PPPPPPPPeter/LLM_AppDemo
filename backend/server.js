const express = require('express')
const cors = require('cors')
const { executeCode } = require('./executor')
const app = express()

// 中间件
app.use(cors())
app.use(express.json())

// API 配置
const API_KEYS = {
    deepseek: '', // DeepSeek API Key
    openai: '',   // OpenAI API Key
    google: ''    // Google API Key
}

// API 端点配置
const API_ENDPOINTS = {
    deepseek: 'https://api.deepseek.com/chat/completions',
    openai: 'https://api.openai.com/v1/chat/completions',
    google: 'https://generativelanguage.googleapis.com/v1beta/models'
}

// 模型到提供商的映射
const MODEL_PROVIDER_MAP = {
    'deepseek-chat': 'deepseek',
    'deepseek-reasoner': 'deepseek',
    'gpt-4': 'openai',
    'gpt-4-turbo': 'openai',
    'gpt-3.5-turbo': 'openai',
    'gemini-2.0-flash-exp': 'google',
    'gemini-1.5-pro': 'google',
    'gemini-1.5-flash': 'google'
}

// 聊天接口 - 流式输出
app.post('/api/chat', async (req, res) => {
    try {
        const { messages, model = 'deepseek-chat', temperature = 1.0, maxTokens = 4000 } = req.body

        // 获取模型对应的提供商
        const provider = MODEL_PROVIDER_MAP[model]
        if (!provider) {
            return res.status(400).json({ error: `Unsupported model: ${model}` })
        }

        // 检查 API Key
        const apiKey = API_KEYS[provider]
        if (!apiKey) {
            return res.status(500).json({ error: `${provider} API Key not configured` })
        }

        // 根据提供商调用不同的API
        if (provider === 'google') {
            await handleGoogleAPI(res, model, messages, temperature, maxTokens, apiKey)
        } else {
            await handleOpenAICompatibleAPI(res, provider, model, messages, temperature, maxTokens, apiKey)
        }

    } catch (error) {
        console.error('API 调用错误:', error)
        if (!res.headersSent) {
            res.status(500).json({ error: error.message })
        }
    }
})

// 处理 OpenAI 兼容的 API (DeepSeek, OpenAI)
async function handleOpenAICompatibleAPI(res, provider, model,
                                         messages, temperature,
                                         maxTokens, apiKey) {
    const apiUrl = API_ENDPOINTS[provider]

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model,
            messages,
            temperature,
            max_tokens: maxTokens,
            stream: true
        })
    })

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        return res.status(response.status).json({
            error: errorData.error?.message || 'API request failed'
        })
    }

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    // 转发流式响应
    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')

    while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        res.write(chunk)
    }

    res.end()
}

// 处理 Google Gemini API
async function handleGoogleAPI(res, model, messages,
                               temperature, maxTokens, apiKey) {
    const apiUrl = `${API_ENDPOINTS.google}/${model}:streamGenerateContent?key=${apiKey}`

    // 转换消息格式为 Gemini 格式
    const contents = messages.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
    }))

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents,
            generationConfig: {
                temperature,
                maxOutputTokens: maxTokens
            }
        })
    })

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        return res.status(response.status).json({
            error: errorData.error?.message || 'API request failed'
        })
    }

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    // 转发流式响应，转换为 OpenAI 格式
    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')

    while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n').filter(line => line.trim())

        for (const line of lines) {
            try {
                const json = JSON.parse(line)
                const text = json.candidates?.[0]?.content?.parts?.[0]?.text

                if (text) {
                    // 转换为 OpenAI 格式
                    const openaiFormat = {
                        choices: [{
                            delta: { content: text }
                        }]
                    }
                    res.write(`data: ${JSON.stringify(openaiFormat)}\n\n`)
                }
            } catch (e) {
                // 忽略解析错误
            }
        }
    }

    res.write('data: [DONE]\n\n')
    res.end()
}

// 代码执行接口
app.post('/api/execute', async (req, res) => {
    try {
        const { type, code, stepsCode, timeout } = req.body

        if (!type || !code) {
            return res.status(400).json({
                error: '缺少必要参数: type 和 code'
            })
        }

        console.log(`执行代码类型: ${type}`)

        // 执行代码
        const result = await executeCode(type, code, {
            timeout: timeout || 30000,
            stepsCode
        })

        res.json(result)
    } catch (error) {
        console.error('代码执行错误:', error)
        res.status(500).json({
            success: false,
            error: error.message,
            output: `服务器错误: ${error.message}`
        })
    }
})

// 健康检查接口
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' })
})

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
    console.log(`🚀 后端服务器运行在 http://localhost:${PORT}`)
    console.log(`📡 API 端点: http://localhost:${PORT}/api/chat`)
    console.log(`⚙️  代码执行端点: http://localhost:${PORT}/api/execute`)
})