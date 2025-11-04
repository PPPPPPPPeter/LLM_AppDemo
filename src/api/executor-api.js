/**
 * 代码执行API模块 - 增强版
 * 支持完整项目结构和模块导入
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
 * 从消息中提取代码块（fallback用）
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
 * 根据语言判断执行类型（单文件fallback用）
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
 * 智能识别并执行代码 - 增强版
 * 优先解析完整项目结构，支持模块导入
 */
export async function smartExecute(message) {
    console.log('🔍 开始智能解析和执行...')

    // 1. 优先尝试解析结构化输出（完整项目）
    if (hasStructuredFiles(message)) {
        console.log('✓ 检测到结构化输出')

        const parsed = parseStructuredOutput(message)

        if (parsed && parsed.files && parsed.files.length > 0) {
            const { files, mainFile: specifiedMainFile } = parsed

            console.log('📁 项目文件结构:')
            files.forEach(f => console.log(`  - ${f.path}`))

            const execType = detectExecutionType(files)
            console.log(`🎯 执行类型: ${execType}`)

            // 确定主文件
            const mainFile = findMainFile(files, specifiedMainFile)
            console.log(`▶️  主文件: ${mainFile}`)

            // Gherkin特殊处理：需要提取所有相关文件
            if (execType === 'gherkin') {
                const gherkinFiles = extractGherkinFromFiles(files)
                if (gherkinFiles) {
                    console.log('🥒 Gherkin测试文件:')
                    gherkinFiles.forEach(f => console.log(`  - ${f.path || f.filename} (${f.type})`))

                    return await executeCode('gherkin', '', {
                        files: gherkinFiles,
                        mainFile
                    })
                }
            }

            // 统一使用 project 模式执行
            return await executeCode('project', '', {
                files,
                mainFile
            })
        }
    }

    // 2. Fallback: 尝试旧的Gherkin提取方法（兼容性）
    const gherkinFiles = extractGherkinFilesOldWay(message)
    if (gherkinFiles) {
        console.log('🥒 使用旧方式提取的Gherkin文件')
        return await executeCode('gherkin', gherkinFiles.featureCode, {
            stepsCode: gherkinFiles.stepsCode
        })
    }

    // 3. Fallback: 执行第一个可识别的代码块（单文件）
    console.log('⚠️  未检测到结构化输出，尝试单文件执行')
    const codeBlocks = extractCodeBlocks(message)
    for (const block of codeBlocks) {
        const type = determineExecutionType(block.language, block.code)
        if (type && type !== 'gherkin') {
            console.log(`📝 单文件执行: ${type}`)
            return await executeCode(type, block.code)
        }
    }

    throw new Error('未找到可执行的代码。请确保使用 FILE: 格式并指定 MAIN_FILE。')
}

/**
 * 旧的Gherkin提取方法（兼容性保留）
 */
function extractGherkinFilesOldWay(message) {
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
 * 检查消息是否包含可执行代码
 */
export function hasExecutableCode(message) {
    // 检查结构化输出
    if (hasStructuredFiles(message)) {
        return true
    }

    // 检查Gherkin
    if (extractGherkinFilesOldWay(message)) {
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