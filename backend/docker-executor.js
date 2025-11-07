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
            'pytest', 'test_script.py', '-v', '--tb=short', '--collect-only'
        ], timeout)

        if (result.exitCode === 0 || result.output.includes('test session starts')) {
            const runResult = await runDockerCommand([
                'run', '--rm',
                '--memory=512m',
                '--cpus=0.5',
                '--network=none',
                '-v', `${tmpDir}:/code`,
                '-w', '/code',
                'llm-python-test:latest',
                'pytest', 'test_script.py', '-v', '--tb=short'
            ], timeout)

            const passed = runResult.output.includes('passed') && !runResult.output.includes('failed')
            return {
                ...runResult,
                testPassed: passed,
                success: passed
            }
        }

        return result
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

        const supportFiles = []

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
                targetPath = path.join(tmpDir, fileName)
                supportFiles.push(fileName)
                console.log(`  ✓ Support: ${fileName}`)
            }

            await fs.writeFile(targetPath, file.content, 'utf-8')
        }

        if (supportFiles.length > 0) {
            const stepsFiles = await fs.readdir(stepsDir)
            for (const stepFile of stepsFiles) {
                const stepPath = path.join(stepsDir, stepFile)
                let content = await fs.readFile(stepPath, 'utf-8')

                content = content.replace(/import sys[\s\S]*?sys\.path\.append[^\n]+\n/g, '')

                const imports = supportFiles
                    .filter(f => f.endsWith('.py'))
                    .map(f => f.replace('.py', ''))

                const importStatements = imports.map(mod =>
                    `import sys\nsys.path.insert(0, '/code')\nfrom ${mod} import *\n`
                ).join('')

                content = importStatements + content

                await fs.writeFile(stepPath, content, 'utf-8')
                console.log(`  ⚙️  修正导入: ${stepFile}`)
            }
        }

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

        // 🎯 新策略：基于文件夹的简单筛选
        // 只包含与主文件在同一文件夹（及其子文件夹）中的文件

        const mainFilePath = mainFile
        const mainFileDir = path.dirname(mainFilePath)

        console.log(`📂 主文件: ${mainFile}`)
        console.log(`📂 主文件夹: ${mainFileDir}`)

        // 筛选同一文件夹中的文件
        const relevantFiles = files.filter(f => {
            const fileDir = path.dirname(f.path)

            // 检查是否在同一文件夹或其子文件夹中
            if (fileDir === mainFileDir || fileDir.startsWith(mainFileDir + '/')) {
                return true
            }

            return false
        })

        console.log(`📊 筛选结果: ${relevantFiles.length} / ${files.length} 个文件`)
        relevantFiles.forEach(f => console.log(`  ✓ ${f.path}`))

        if (relevantFiles.length === 0) {
            return {
                success: false,
                output: `错误: 未找到与 ${mainFile} 在同一文件夹中的文件\n\n请确保相关文件在同一文件夹中`,
                exitCode: -1
            }
        }

        // 检测是否为 Gherkin 测试
        const isMainFileFeature = mainFile.endsWith('.feature')
        const hasStepsFile = relevantFiles.some(f =>
            f.path.includes('steps') ||
            f.content.includes('@given') ||
            f.content.includes('@when') ||
            f.content.includes('@then')
        )

        if (isMainFileFeature && hasStepsFile) {
            console.log('🥒 检测到 Gherkin 测试，使用 behave runner')
            return await executeGherkinTest(relevantFiles, timeout)
        }

        // 普通项目处理
        for (const file of relevantFiles) {
            const filePath = path.join(tmpDir, file.path)
            const fileDir = path.dirname(filePath)

            await fs.mkdir(fileDir, { recursive: true })
            await fs.writeFile(filePath, file.content, 'utf-8')
        }

        console.log(`\n▶️  执行主文件: ${mainFile}`)

        const ext = path.extname(mainFile)
        let dockerImage, command

        if (ext === '.py') {
            dockerImage = 'llm-python-test:latest'

            const mainFilePath = path.join(tmpDir, mainFile)
            const content = await fs.readFile(mainFilePath, 'utf-8')

            if (mainFile.includes('test_') || mainFile.startsWith('test_') ||
                content.includes('import pytest') || content.includes('def test_')) {
                command = ['pytest', mainFile, '-v', '--tb=short']
                console.log('✓ 识别为 pytest 测试文件')
            } else {
                command = ['python3', mainFile]
            }
        } else {
            return {
                success: false,
                output: `不支持的文件类型: ${ext}\n\n此应用仅支持 Python 文件 (.py)`,
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

        if (command[0] === 'pytest') {
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
            case 'python-test':
                return await executePythonTest(code, timeout)
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
                    output: `不支持的执行类型: ${type}。\n\n支持的类型:\n- python\n- python-test\n- gherkin\n- project`,
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