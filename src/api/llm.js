/**
 * LLM API 调用模块
 *
 * 使用说明：
 * 1. 在 src/config.js 中配置你的 API_KEY 和 API_URL
 * 2. 或者在调用时传入配置参数
 */

// 默认配置
const DEFAULT_CONFIG = {
    apiUrl: 'https://api.openai.com/v1/chat/completions',
    apiKey: '', // 在这里填入你的API Key，或从环境变量获取
    model: 'gpt-3.5-turbo',
    temperature: 0.7,
    maxTokens: 2000
}

/**
 * 调用LLM API
 * @param {Array} messages - 消息历史数组 [{role: 'user'|'assistant', content: string}]
 * @param {Object} config - 可选配置，覆盖默认配置
 * @returns {Promise<string>} - 返回AI的回复文本
 */
export async function callLLMAPI(messages, config = {}) {
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
        max_tokens: finalConfig.maxTokens
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

        const data = await response.json()

        // 提取回复内容
        const reply = data.choices?.[0]?.message?.content

        if (!reply) {
            throw new Error('API返回数据格式错误')
        }

        return reply

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