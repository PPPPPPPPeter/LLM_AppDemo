/**
 * 代码执行API模块
 */

import {
    parseStructuredOutput,
    extractGherkinFromFiles,
    hasStructuredFiles,
    findMainFile,
    detectExecutionType
} from './structured-parser'

const BACKEND_EXECUTE_URL = 'http://localhost:3000/api/execute'

/**
 * 执行代码
 * @param {string} type - 执行类型
 * @param {string} code - 代码内容（单文件）
 * @param {Object} options - 可选配置
 * @returns {Promise<Object>} 执行结果
 */
export async function executeCode(type, code, options = {}) {
    const { stepsCode, timeout = 30000, files, mainFile } = options

    try {
        const response = await fetch(BACKEND_EXECUTE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type,
                code,
                stepsCode,
                files,
                mainFile,
                timeout
            })
        })

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))
            throw new Error(errorData.error || `请求失败: ${response.status}`)
        }

        const result = await response.json()
        return result

    } catch (error) {
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            throw new Error('无法连接到后端服务器，请确保后端已启动')
        }
        throw error
    }
}

/**
 * 从消息中提取代码块
 */
export function extractCodeBlocks(message) {
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g
    const blocks = []
    let match

    while ((match = codeBlockRegex.exec(message)) !== null) {
        const language = match[1] || 'text'
        const code = match[2].trim()
        blocks.push({ language, code })
    }

    return blocks
}

/**
 * 根据语言判断执行类型（单文件）
 */
export function determineExecutionType(language, code) {
    const lowerLang = language.toLowerCase()
    const codeContent = code.toLowerCase()

    const isPythonTest = (lowerLang === 'python' || lowerLang === 'py') &&
        (codeContent.includes('import unittest') ||
            codeContent.includes('import pytest') ||
            codeContent.includes('def test_'))

    const isJSTest = (lowerLang === 'javascript' || lowerLang === 'js') &&
        (codeContent.includes('assert') ||
            codeContent.includes('test(') ||
            codeContent.includes('describe('))

    const isGherkin = lowerLang === 'gherkin' || lowerLang === 'feature'

    if (isPythonTest) return 'python-test'
    if (isJSTest) return 'javascript-test'
    if (isGherkin) return 'gherkin'
    if (lowerLang === 'python' || lowerLang === 'py') return 'python'
    if (lowerLang === 'javascript' || lowerLang === 'js') return 'javascript'

    return null
}

/**
 * 从消息中提取Gherkin的feature和steps（旧方法，兼容）
 */
export function extractGherkinFiles(message) {
    const blocks = extractCodeBlocks(message)

    let featureCode = null
    let stepsCode = null

    for (const block of blocks) {
        const lang = block.language.toLowerCase()
        const code = block.code

        if (lang === 'gherkin' || lang === 'feature' ||
            code.trim().startsWith('Feature:') ||
            code.trim().startsWith('功能:')) {
            featureCode = code
        }

        if ((lang === 'python' || lang === 'py') &&
            (code.includes('from behave import') ||
                code.includes('@given') ||
                code.includes('@when') ||
                code.includes('@then'))) {
            stepsCode = code
        }
    }

    if (featureCode && stepsCode) {
        return { featureCode, stepsCode }
    }

    return null
}

/**
 * 智能识别并执行代码
 * 优先检查结构化输出，再fallback到普通代码块
 */
export async function smartExecute(message) {
    // 1. 优先尝试解析结构化输出
    if (hasStructuredFiles(message)) {
        const files = parseStructuredOutput(message)

        if (files && files.length > 0) {
            const execType = detectExecutionType(files)

            if (execType === 'gherkin') {
                const gherkinFiles = extractGherkinFromFiles(files)
                if (gherkinFiles) {
                    return await executeCode('gherkin', '', { files: gherkinFiles })
                }
            } else if (execType === 'project') {
                const mainFile = findMainFile(files)
                return await executeCode('project', '', { files, mainFile })
            } else if (execType) {
                // 单文件测试或普通代码
                return await executeCode(execType, files[0].content)
            }
        }
    }

    // 2. Fallback: 尝试旧的Gherkin提取方法
    const gherkinFiles = extractGherkinFiles(message)
    if (gherkinFiles) {
        return await executeCode('gherkin', gherkinFiles.featureCode, {
            stepsCode: gherkinFiles.stepsCode
        })
    }

    // 3. Fallback: 执行第一个可识别的代码块
    const codeBlocks = extractCodeBlocks(message)
    for (const block of codeBlocks) {
        const type = determineExecutionType(block.language, block.code)
        if (type && type !== 'gherkin') {
            return await executeCode(type, block.code)
        }
    }

    throw new Error('未找到可执行的代码')
}

/**
 * 检查消息是否包含可执行代码
 */
export function hasExecutableCode(message) {
    // 检查结构化输出
    if (hasStructuredFiles(message)) {
        return true
    }

    // 检查Gherkin
    if (extractGherkinFiles(message)) {
        return true
    }

    // 检查普通代码块
    const blocks = extractCodeBlocks(message)
    return blocks.some(block => {
        const type = determineExecutionType(block.language, block.code)
        return type !== null
    })
}

// 导出解析器功能供外部使用
export {
    parseStructuredOutput,
    extractGherkinFromFiles,
    hasStructuredFiles,
    findMainFile,
    detectExecutionType
}