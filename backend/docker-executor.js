const { spawn } = require('child_process')
const fs = require('fs').promises
const path = require('path')
const os = require('os')

// 临时目录前缀
const TMP_PREFIX = 'llm-exec-'

// 创建临时目录
async function createTempDir() {
    return await fs.mkdtemp(path.join(os.tmpdir(), TMP_PREFIX))
}

// 清理临时文件
async function cleanup(tmpDir) {
    try {
        await fs.rm(tmpDir, { recursive: true, force: true })
    } catch (err) {
        console.error('清理失败:', err)
    }
}

// 执行Docker命令的通用函数
function runDockerCommand(dockerArgs, timeout = 30000) {
    return new Promise((resolve) => {
        let output = ''
        let errorOutput = ''
        let timedOut = false

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
                    output: '执行超时',
                    exitCode: -1
                })
            } else {
                resolve({
                    success: code === 0,
                    output: output || errorOutput,
                    exitCode: code
                })
            }
        })

        process.on('error', (err) => {
            clearTimeout(timer)
            resolve({
                success: false,
                output: `Docker执行错误: ${err.message}`,
                exitCode: -1
            })
        })
    })
}

// 执行Python代码
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

// 执行JavaScript代码
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

// 执行Python测试
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
            '-v', `${tmpDir}:/code:ro`,
            '-w', '/code',
            'python:3.11-alpine',
            'sh', '-c', 'pip install --break-system-packages pytest && pytest test_script.py -v'
        ], timeout)

        return {
            ...result,
            testPassed: result.success
        }
    } finally {
        await cleanup(tmpDir)
    }
}

// 执行JavaScript测试
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
            '-v', `${tmpDir}:/code:ro`,
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

// 执行Gherkin测试
async function executeGherkinTest(files, timeout = 60000) {
    const tmpDir = await createTempDir()

    try {
        const featuresDir = path.join(tmpDir, 'features')
        const stepsDir = path.join(featuresDir, 'steps')
        await fs.mkdir(featuresDir, { recursive: true })
        await fs.mkdir(stepsDir, { recursive: true })

        for (const file of files) {
            const targetDir = file.type === 'feature' ? featuresDir : stepsDir
            const filePath = path.join(targetDir, file.filename)
            await fs.writeFile(filePath, file.content, 'utf-8')
        }

        const result = await runDockerCommand([
            'run', '--rm',
            '--memory=512m',
            '--cpus=0.5',
            '--network=none',
            '-v', `${tmpDir}:/code:ro`,
            '-w', '/code',
            'python:3.11-alpine',
            'sh', '-c', 'pip install --break-system-packages behave && behave features'
        ], timeout)

        return {
            ...result,
            testPassed: result.success
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

// 执行项目（多文件）
async function executeProject(files, mainFile, timeout = 60000) {
    const tmpDir = await createTempDir()

    try {
        for (const file of files) {
            const filePath = path.join(tmpDir, file.path)
            const fileDir = path.dirname(filePath)
            await fs.mkdir(fileDir, { recursive: true })
            await fs.writeFile(filePath, file.content, 'utf-8')
        }

        const ext = path.extname(mainFile)
        let dockerImage, command

        if (ext === '.py') {
            dockerImage = 'python:3.11-alpine'
            command = ['python3', mainFile]
        } else if (ext === '.js') {
            dockerImage = 'node:18-alpine'
            command = ['node', mainFile]
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
            '-v', `${tmpDir}:/code:ro`,
            '-w', '/code',
            dockerImage,
            ...command
        ], timeout)

        return result
    } catch (err) {
        return {
            success: false,
            output: `项目环境创建失败: ${err.message}`,
            exitCode: -1
        }
    } finally {
        await cleanup(tmpDir)
    }
}

// 统一执行入口
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