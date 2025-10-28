/**
 * LLM API 调用模块
 *
 * 现在通过后端服务器调用 API，API Key 保存在后端
 */

// 后端API地址
const BACKEND_API_URL = 'http://localhost:3000/api/chat'

/**
 * 调用LLM API（流式输出）
 * @param {Array} messages - 消息历史数组 [{role: 'user'|'assistant'|'system', content: string}]
 * @param {Function} onChunk - 接收到文本块时的回调函数
 * @param {Object} config - 可选配置
 * @returns {Promise<string>} - 返回完整的AI回复文本
 */
export async function callLLMAPI(messages, onChunk = null, config = {}) {
    const { model = 'deepseek-chat', temperature = 1.0, maxTokens = 4000 } = config

    try {
        const response = await fetch(BACKEND_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messages,
                model,
                temperature,
                maxTokens
            })
        })

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))
            throw new Error(errorData.error || `请求失败: ${response.status}`)
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
                    const data = line.slice(6)

                    if (data === '[DONE]') {
                        continue
                    }

                    try {
                        const json = JSON.parse(data)
                        const content = json.choices?.[0]?.delta?.content

                        if (content) {
                            fullText += content
                            if (onChunk) {
                                onChunk(content)
                            }
                        }
                    } catch (e) {
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
            throw new Error('无法连接到后端服务器，请确保后端已启动')
        }
        throw error
    }
}

/**
 * 设置后端API地址
 * @param {string} url - 后端API地址
 */
export function setBackendURL(url) {
    BACKEND_API_URL = url
}