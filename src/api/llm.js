/**
 * LLM API 调用模块
 *
 * 使用说明：
 * 1. 在下方 DEFAULT_CONFIG 中配置你的 API_KEY
 * 2. 或者在调用时传入配置参数
 */

// 默认配置
const DEFAULT_CONFIG = {
    apiUrl: 'https://api.deepseek.com/chat/completions',
    apiKey: '', // 在这里填入你的 DeepSeek API Key
    model: 'deepseek-chat',
    temperature: 1.0,
    maxTokens: 4000
}

/**
 * 调用LLM API（流式输出）
 * @param {Array} messages - 消息历史数组 [{role: 'user'|'assistant'|'system', content: string}]
 * @param {Function} onChunk - 接收到文本块时的回调函数
 * @param {Object} config - 可选配置，覆盖默认配置
 * @returns {Promise<string>} - 返回完整的AI回复文本
 */
export async function callLLMAPI(messages, onChunk = null, config = {}) {
    const finalConfig = { ...DEFAULT_CONFIG, ...config }

    // 检查API Key
    if (!finalConfig.apiKey) {
        throw new Error('API Key 未配置，请在 src/api/llm.js 中设置 apiKey')
    }

    // 构建请求体
    const requestBody = {
        model: finalConfig.model,
        messages: messages,
        temperature: finalConfig.temperature,
        max_tokens: finalConfig.maxTokens,
        stream: true // 启用流式输出
    }

    try {
        const response = await fetch(finalConfig.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${finalConfig.apiKey}`
            },
            body: JSON.stringify(requestBody)
        })

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))
            throw new Error(
                errorData.error?.message ||
                `API请求失败: ${response.status} ${response.statusText}`
            )
        }

        // 处理流式响应
        const reader = response.body.getReader()
        const decoder = new TextDecoder('utf-8')
        let fullText = ''

        while (true) {
            const { done, value } = await reader.read()
            if (done) break

            const chunk = decoder.decode(value, { stream: true })
            const lines = chunk.split('\n').filter(line => line.trim() !== '')

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6) // 移除 'data: ' 前缀

                    if (data === '[DONE]') {
                        continue
                    }

                    try {
                        const json = JSON.parse(data)
                        const content = json.choices?.[0]?.delta?.content

                        if (content) {
                            fullText += content
                            // 调用回调函数，实时更新UI
                            if (onChunk) {
                                onChunk(content)
                            }
                        }
                    } catch (e) {
                        // 忽略解析错误
                        console.warn('解析SSE数据失败:', e)
                    }
                }
            }
        }

        if (!fullText) {
            throw new Error('API返回数据格式错误')
        }

        return fullText

    } catch (error) {
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            throw new Error('网络请求失败，请检查网络连接')
        }
        throw error
    }
}

/**
 * 设置全局API配置
 * @param {Object} config - 配置对象
 */
export function setAPIConfig(config) {
    Object.assign(DEFAULT_CONFIG, config)
}

/**
 * 获取当前API配置
 * @returns {Object} - 当前配置
 */
export function getAPIConfig() {
    return { ...DEFAULT_CONFIG }
}