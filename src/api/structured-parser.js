/**
 * 结构化输出解析器
 * 用于从LLM的格式化输出中提取代码文件
 */

/**
 * 解析结构化的文件输出
 * 支持格式：
 *
 * FILE: path/to/file.py
 * ```python
 * code here
 * ```
 *
 * 或者：
 *
 * ## 文件：features/test.feature
 * ```gherkin
 * code here
 * ```
 */
export function parseStructuredOutput(message) {
    const files = []

    // 方式1: FILE: filename 格式
    const filePattern1 = /FILE:\s*([^\n]+)\s*\n```(\w+)?\n([\s\S]*?)```/g
    let match1
    while ((match1 = filePattern1.exec(message)) !== null) {
        files.push({
            path: match1[1].trim(),
            language: match1[2] || 'text',
            content: match1[3].trim()
        })
    }

    // 方式2: ## 文件：filename 格式
    const filePattern2 = /##\s*文件[：:]\s*([^\n]+)\s*\n```(\w+)?\n([\s\S]*?)```/g
    let match2
    while ((match2 = filePattern2.exec(message)) !== null) {
        files.push({
            path: match2[1].trim(),
            language: match2[2] || 'text',
            content: match2[3].trim()
        })
    }

    // 方式3: **filename** 格式
    const filePattern3 = /\*\*([^\*]+)\*\*\s*\n```(\w+)?\n([\s\S]*?)```/g
    let match3
    while ((match3 = filePattern3.exec(message)) !== null) {
        const filename = match3[1].trim()
        // 只有看起来像文件名的才处理
        if (filename.includes('.') || filename.includes('/')) {
            files.push({
                path: filename,
                language: match3[2] || 'text',
                content: match3[3].trim()
            })
        }
    }

    return files.length > 0 ? files : null
}

/**
 * 从解析的文件中提取Gherkin相关文件
 */
export function extractGherkinFromFiles(files) {
    const featureFiles = []
    const stepFiles = []

    for (const file of files) {
        const path = file.path.toLowerCase()
        const content = file.content

        // 识别feature文件
        if (path.endsWith('.feature') ||
            file.language === 'gherkin' ||
            file.language === 'feature' ||
            content.trim().startsWith('Feature:') ||
            content.trim().startsWith('功能:')) {
            featureFiles.push({
                type: 'feature',
                filename: file.path.split('/').pop() || 'test.feature',
                content: file.content
            })
        }

        // 识别steps文件
        if ((path.endsWith('.py') || file.language === 'python') &&
            (content.includes('from behave import') ||
                content.includes('@given') ||
                content.includes('@when') ||
                content.includes('@then'))) {
            stepFiles.push({
                type: 'steps',
                filename: file.path.split('/').pop() || 'steps.py',
                content: file.content
            })
        }
    }

    if (featureFiles.length > 0 && stepFiles.length > 0) {
        return [...featureFiles, ...stepFiles]
    }

    return null
}

/**
 * 判断消息是否包含结构化的文件输出
 */
export function hasStructuredFiles(message) {
    return /FILE:\s*[^\n]+\s*\n```/.test(message) ||
        /##\s*文件[：:]\s*[^\n]+\s*\n```/.test(message) ||
        /\*\*[^\*]+\.(py|js|feature|gherkin)\*\*\s*\n```/.test(message)
}

/**
 * 从文件列表中找主文件
 */
export function findMainFile(files) {
    // 查找包含main, test, __main__的文件
    for (const file of files) {
        const filename = file.path.toLowerCase()
        const content = file.content.toLowerCase()

        if (filename.includes('main') ||
            filename.includes('test') ||
            content.includes('if __name__ == "__main__"') ||
            content.includes('if __name__ == \'__main__\'')) {
            return file.path
        }
    }

    // 默认返回第一个可执行文件
    for (const file of files) {
        if (file.path.endsWith('.py') || file.path.endsWith('.js')) {
            return file.path
        }
    }

    return files[0]?.path || 'main.py'
}

/**
 * 智能识别执行类型
 */
export function detectExecutionType(files) {
    // 检查是否是Gherkin测试
    const hasFeature = files.some(f =>
        f.path.endsWith('.feature') ||
        f.content.trim().startsWith('Feature:')
    )
    const hasSteps = files.some(f =>
        f.content.includes('from behave import') ||
        f.content.includes('@given')
    )
    if (hasFeature && hasSteps) {
        return 'gherkin'
    }

    // 检查是否是测试文件
    const hasTest = files.some(f => {
        const content = f.content.toLowerCase()
        return content.includes('import pytest') ||
            content.includes('import unittest') ||
            content.includes('def test_') ||
            (content.includes('assert') && f.path.includes('test'))
    })
    if (hasTest) {
        const isPython = files.some(f => f.path.endsWith('.py'))
        return isPython ? 'python-test' : 'javascript-test'
    }

    // 多文件项目
    if (files.length > 1) {
        return 'project'
    }

    // 单文件
    if (files[0].path.endsWith('.py')) {
        return 'python'
    }
    if (files[0].path.endsWith('.js')) {
        return 'javascript'
    }

    return null
}

/**
 * 生成提示用户使用结构化输出的消息
 */
export function generateStructuredPrompt(type = 'gherkin') {
    const prompts = {
        gherkin: `
请按以下格式输出：

FILE: features/login.feature
\`\`\`gherkin
Feature: 登录功能
  Scenario: 成功登录
    Given 用户打开登录页面
    When 输入正确的用户名和密码
    Then 应该成功登录
\`\`\`

FILE: features/steps/login_steps.py
\`\`\`python
from behave import given, when, then

@given('用户打开登录页面')
def step_impl(context):
    pass
\`\`\`
`,
        project: `
请按以下格式输出多个文件：

FILE: main.py
\`\`\`python
from utils import helper
print(helper())
\`\`\`

FILE: utils.py
\`\`\`python
def helper():
    return "Hello"
\`\`\`
`
    }

    return prompts[type] || prompts.project
}