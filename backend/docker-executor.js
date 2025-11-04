const { spawn } = require('child_process')
const fs = require('fs').promises
const path = require('path')
const os = require('os')

async function createTempDir() {
    return await fs.mkdtemp(path.join(os.tmpdir(), 'llm-exec-'))
}

async function cleanup(tmpDir) {
    try {
        await fs.rm(tmpDir, { recursive: true, force: true })
    } catch (err) {
        console.error('清理失败:', err)
    }
}

function runDockerCommand(dockerArgs, timeout = 30000) {
    return new Promise((resolve) => {
        let output = ''
        let errorOutput = ''
        let timedOut = false

        console.log('Running docker:', dockerArgs.join(' '))

        const process = spawn('docker', dockerArgs)

        const timer = setTimeout(() => {
            timedOut = true
            process.kill('SIGTERM')
            setTimeout(() => process.kill('SIGKILL'), 2000)
        }, timeout)

        process.stdout.on('data', (data) => {
            output += data.toString()
        })

        process.stderr.on('data', (data) => {
            errorOutput += data.toString()
        })

        process.on('close', (code) => {
            clearTimeout(timer)

            if (timedOut) {
                resolve({
                    success: false,
                    output: '⏱️ 执行超时 (超过 ' + (timeout/1000) + ' 秒)\n\n可能原因:\n- 代码存在死循环\n- 计算量过大\n- 程序等待输入',
                    exitCode: -1
                })
            } else {
                // 合并stdout和stderr，但标记哪个是错误输出
                let fullOutput = output
                if (errorOutput && code !== 0) {
                    fullOutput += '\n--- Errors ---\n' + errorOutput
                }

                resolve({
                    success: code === 0,
                    output: fullOutput.trim() || (code === 0 ? '✓ 执行成功，无输出' : '✗ 执行失败'),
                    exitCode: code
                })
            }
        })

        process.on('error', (err) => {
            clearTimeout(timer)
            resolve({
                success: false,
                output: `Docker执行错误: ${err.message}\n\n请确保Docker已安装并正在运行`,
                exitCode: -1
            })
        })
    })
}

async function executePython(code, timeout = 30000) {
    const tmpDir = await createTempDir()
    const filePath = path.join(tmpDir, 'script.py')

    try {
        await fs.writeFile(filePath, code, 'utf-8')

        const result = await runDockerCommand([
            'run', '--rm',
            '--memory=512m',
            '--cpus=0.5',
            '--network=none',
            '--read-only',
            '--tmpfs', '/tmp',
            '-v', `${tmpDir}:/code:ro`,
            '-w', '/code',
            'python:3.11-alpine',
            'python3', 'script.py'
        ], timeout)

        return result
    } finally {
        await cleanup(tmpDir)
    }
}

async function executeJavaScript(code, timeout = 30000) {
    const tmpDir = await createTempDir()
    const filePath = path.join(tmpDir, 'script.js')

    try {
        await fs.writeFile(filePath, code, 'utf-8')

        const result = await runDockerCommand([
            'run', '--rm',
            '--memory=512m',
            '--cpus=0.5',
            '--network=none',
            '--read-only',
            '--tmpfs', '/tmp',
            '-v', `${tmpDir}:/code:ro`,
            '-w', '/code',
            'node:18-alpine',
            'node', 'script.js'
        ], timeout)

        return result
    } finally {
        await cleanup(tmpDir)
    }
}

async function executePythonTest(code, timeout = 60000) {
    const tmpDir = await createTempDir()
    const filePath = path.join(tmpDir, 'test_script.py')

    try {
        await fs.writeFile(filePath, code, 'utf-8')

        const result = await runDockerCommand([
            'run', '--rm',
            '--memory=512m',
            '--cpus=0.5',
            '--network=none',
            '-v', `${tmpDir}:/code`,
            '-w', '/code',
            'llm-python-test:latest',
            'pytest', 'test_script.py', '-v', '--tb=short'
        ], timeout)

        // 解析pytest输出判断测试是否通过
        const passed = result.output.includes('passed') && !result.output.includes('failed')

        return {
            ...result,
            testPassed: passed,
            success: passed
        }
    } finally {
        await cleanup(tmpDir)
    }
}

async function executeJavaScriptTest(code, timeout = 60000) {
    const tmpDir = await createTempDir()
    const filePath = path.join(tmpDir, 'test_script.js')

    try {
        await fs.writeFile(filePath, code, 'utf-8')

        const result = await runDockerCommand([
            'run', '--rm',
            '--memory=512m',
            '--cpus=0.5',
            '--network=none',
            '-v', `${tmpDir}:/code`,
            '-w', '/code',
            'node:18-alpine',
            'node', 'test_script.js'
        ], timeout)

        return {
            ...result,
            testPassed: result.success
        }
    } finally {
        await cleanup(tmpDir)
    }
}

async function executeGherkinTest(files, timeout = 60000) {
    const tmpDir = await createTempDir()

    try {
        const featuresDir = path.join(tmpDir, 'features')
        const stepsDir = path.join(featuresDir, 'steps')
        await fs.mkdir(featuresDir, { recursive: true })
        await fs.mkdir(stepsDir, { recursive: true })

        console.log('🥒 准备Gherkin测试文件:')

        // 分类文件
        const supportFiles = []  // 被steps导入的文件（如calculator.py）

        for (const file of files) {
            let targetPath
            const fileName = file.filename || file.path.split('/').pop()

            if (file.type === 'feature' || file.path.endsWith('.feature')) {
                targetPath = path.join(featuresDir, fileName)
                console.log(`  ✓ Feature: ${fileName}`)
            } else if (file.type === 'steps' || file.path.includes('steps')) {
                targetPath = path.join(stepsDir, fileName)
                console.log(`  ✓ Steps: ${fileName}`)
            } else {
                // 支持文件放在根目录（供import）
                targetPath = path.join(tmpDir, fileName)
                supportFiles.push(fileName)
                console.log(`  ✓ Support: ${fileName}`)
            }

            await fs.writeFile(targetPath, file.content, 'utf-8')
        }

        // 修改steps文件，移除路径操作
        if (supportFiles.length > 0) {
            const stepsFiles = await fs.readdir(stepsDir)
            for (const stepFile of stepsFiles) {
                const stepPath = path.join(stepsDir, stepFile)
                let content = await fs.readFile(stepPath, 'utf-8')

                // 移除sys.path操作
                content = content.replace(/import sys[\s\S]*?sys\.path\.append[^\n]+\n/g, '')

                // 添加正确的import路径
                const imports = supportFiles
                    .filter(f => f.endsWith('.py'))
                    .map(f => f.replace('.py', ''))

                // 在文件开头添加
                const importStatements = imports.map(mod =>
                    `import sys\nsys.path.insert(0, '/code')\nfrom ${mod} import *\n`
                ).join('')

                content = importStatements + content

                await fs.writeFile(stepPath, content, 'utf-8')
                console.log(`  ⚙️  修正导入: ${stepFile}`)
            }
        }

        // 创建environment.py
        const envContent = `
def before_all(context):
    pass

def after_all(context):
    pass
`
        await fs.writeFile(path.join(featuresDir, 'environment.py'), envContent, 'utf-8')

        console.log('\n▶️  运行 behave tests...')

        const result = await runDockerCommand([
            'run', '--rm',
            '--memory=512m',
            '--cpus=0.5',
            '--network=none',
            '-v', `${tmpDir}:/code`,
            '-w', '/code',
            'llm-python-test:latest',
            'behave', 'features', '--no-capture', '--format', 'plain'
        ], timeout)

        const output = result.output || ''
        const hasPassed = output.includes('passed')
        const hasFailed = output.includes('failed')
        const passed = result.exitCode === 0 || (hasPassed && !hasFailed)

        return {
            ...result,
            testPassed: passed,
            success: passed
        }
    } catch (err) {
        return {
            success: false,
            output: `环境创建失败: ${err.message}`,
            exitCode: -1,
            testPassed: false
        }
    } finally {
        await cleanup(tmpDir)
    }
}

async function executeProject(files, mainFile, timeout = 60000) {
    const tmpDir = await createTempDir()

    try {
        console.log('📁 创建项目结构:')

        // 写入所有文件（保持目录结构）
        for (const file of files) {
            const filePath = path.join(tmpDir, file.path)
            const fileDir = path.dirname(filePath)

            // 创建必要的子目录
            await fs.mkdir(fileDir, { recursive: true })
            await fs.writeFile(filePath, file.content, 'utf-8')

            console.log(`  ✓ ${file.path}`)
        }

        console.log(`\n▶️  执行主文件: ${mainFile}`)

        // 判断语言
        const ext = path.extname(mainFile)
        let dockerImage, command

        if (ext === '.py') {
            dockerImage = 'llm-python-test:latest'

            // 检查是否是pytest测试
            const mainFilePath = path.join(tmpDir, mainFile)
            const content = await fs.readFile(mainFilePath, 'utf-8')

            if (content.includes('import pytest') || mainFile.includes('test_')) {
                command = ['pytest', mainFile, '-v', '--tb=short']
            } else {
                command = ['python3', mainFile]
            }
        } else if (ext === '.js') {
            dockerImage = 'node:18-alpine'
            command = ['node', mainFile]
        } else if (ext === '.feature') {
            // Gherkin测试
            dockerImage = 'llm-python-test:latest'
            command = ['behave', path.dirname(mainFile) || 'features', '--no-capture', '--format', 'plain']
        } else {
            return {
                success: false,
                output: `不支持的文件类型: ${ext}`,
                exitCode: -1
            }
        }

        const result = await runDockerCommand([
            'run', '--rm',
            '--memory=512m',
            '--cpus=0.5',
            '--network=none',
            '-v', `${tmpDir}:/code`,
            '-w', '/code',
            dockerImage,
            ...command
        ], timeout)

        console.log(`\n✅ 执行完成 (exit code: ${result.exitCode})`)

        // 对pytest和behave改进判断
        if (command[0] === 'pytest' || command[0] === 'behave') {
            const hasPassed = result.output.includes('passed')
            const hasFailed = result.output.includes('failed')
            const success = result.exitCode === 0 || (hasPassed && !hasFailed)

            return {
                ...result,
                success,
                testPassed: success
            }
        }

        return result
    } catch (err) {
        return {
            success: false,
            output: `项目执行失败: ${err.message}`,
            exitCode: -1
        }
    } finally {
        await cleanup(tmpDir)
    }
}

async function executeCode(type, code, options = {}) {
    const { timeout = 30000, stepsCode, files, mainFile } = options

    try {
        switch (type) {
            case 'python':
                return await executePython(code, timeout)
            case 'javascript':
                return await executeJavaScript(code, timeout)
            case 'python-test':
                return await executePythonTest(code, timeout)
            case 'javascript-test':
                return await executeJavaScriptTest(code, timeout)
            case 'gherkin':
                if (files && files.length > 0) {
                    return await executeGherkinTest(files, timeout)
                } else if (stepsCode) {
                    const gherkinFiles = [
                        { type: 'feature', filename: 'test.feature', content: code },
                        { type: 'steps', filename: 'steps.py', content: stepsCode }
                    ]
                    return await executeGherkinTest(gherkinFiles, timeout)
                } else {
                    return {
                        success: false,
                        output: 'Gherkin测试需要提供files或stepsCode',
                        exitCode: -1
                    }
                }
            case 'project':
                if (!files || files.length === 0) {
                    return {
                        success: false,
                        output: '项目执行需要提供files',
                        exitCode: -1
                    }
                }
                return await executeProject(files, mainFile, timeout)
            default:
                return {
                    success: false,
                    output: `不支持的执行类型: ${type}`,
                    exitCode: -1
                }
        }
    } catch (err) {
        return {
            success: false,
            output: `执行失败: ${err.message}`,
            exitCode: -1
        }
    }
}

module.exports = { executeCode }