const { spawn } = require('child_process')
const fs = require('fs').promises
const path = require('path')
const os = require('os')

// 创建临时目录
async function createTempDir(prefix = 'llm-exec-') {
    return await fs.mkdtemp(path.join(os.tmpdir(), prefix))
}

// 清理临时文件
async function cleanup(tmpDir) {
    try {
        await fs.rm(tmpDir, { recursive: true, force: true })
    } catch (err) {
        console.error('清理临时文件失败:', err)
    }
}

// 执行Python代码
async function executePython(code, timeout = 30000) {
    const tmpDir = await createTempDir()
    const filePath = path.join(tmpDir, 'script.py')
    await fs.writeFile(filePath, code, 'utf-8')

    return new Promise((resolve) => {
        let output = ''
        let errorOutput = ''

        const process = spawn('python3', [filePath], {
            timeout,
            killSignal: 'SIGTERM'
        })

        process.stdout.on('data', (data) => {
            output += data.toString()
        })

        process.stderr.on('data', (data) => {
            errorOutput += data.toString()
        })

        process.on('close', async (code) => {
            await cleanup(tmpDir)
            resolve({
                success: code === 0,
                output: output || errorOutput,
                exitCode: code
            })
        })

        process.on('error', async (err) => {
            await cleanup(tmpDir)
            resolve({
                success: false,
                output: `执行错误: ${err.message}`,
                exitCode: -1
            })
        })

        setTimeout(() => {
            process.kill()
            resolve({
                success: false,
                output: '执行超时',
                exitCode: -1
            })
        }, timeout)
    })
}

// 执行JavaScript代码
async function executeJavaScript(code, timeout = 30000) {
    const tmpDir = await createTempDir()
    const filePath = path.join(tmpDir, 'script.js')
    await fs.writeFile(filePath, code, 'utf-8')

    return new Promise((resolve) => {
        let output = ''
        let errorOutput = ''

        const process = spawn('node', [filePath], {
            timeout,
            killSignal: 'SIGTERM'
        })

        process.stdout.on('data', (data) => {
            output += data.toString()
        })

        process.stderr.on('data', (data) => {
            errorOutput += data.toString()
        })

        process.on('close', async (code) => {
            await cleanup(tmpDir)
            resolve({
                success: code === 0,
                output: output || errorOutput,
                exitCode: code
            })
        })

        process.on('error', async (err) => {
            await cleanup(tmpDir)
            resolve({
                success: false,
                output: `执行错误: ${err.message}`,
                exitCode: -1
            })
        })

        setTimeout(() => {
            process.kill()
            resolve({
                success: false,
                output: '执行超时',
                exitCode: -1
            })
        }, timeout)
    })
}

// 执行Python单元测试
async function executePythonTest(code, timeout = 60000) {
    const tmpDir = await createTempDir()
    const filePath = path.join(tmpDir, 'test_script.py')
    await fs.writeFile(filePath, code, 'utf-8')

    return new Promise((resolve) => {
        let output = ''
        let errorOutput = ''

        const process = spawn('pytest', [filePath, '-v', '--tb=short'], {
            timeout,
            killSignal: 'SIGTERM',
            cwd: tmpDir
        })

        process.stdout.on('data', (data) => {
            output += data.toString()
        })

        process.stderr.on('data', (data) => {
            errorOutput += data.toString()
        })

        process.on('close', async (code) => {
            await cleanup(tmpDir)
            resolve({
                success: code === 0,
                output: output || errorOutput,
                exitCode: code,
                testPassed: code === 0
            })
        })

        process.on('error', async (err) => {
            await cleanup(tmpDir)
            resolve({
                success: false,
                output: `测试执行错误: ${err.message}`,
                exitCode: -1,
                testPassed: false
            })
        })

        setTimeout(() => {
            process.kill()
            resolve({
                success: false,
                output: '测试执行超时',
                exitCode: -1,
                testPassed: false
            })
        }, timeout)
    })
}

// 执行JavaScript单元测试
async function executeJavaScriptTest(code, timeout = 60000) {
    const tmpDir = await createTempDir()
    const filePath = path.join(tmpDir, 'test_script.js')
    await fs.writeFile(filePath, code, 'utf-8')

    return new Promise((resolve) => {
        let output = ''
        let errorOutput = ''

        const process = spawn('node', [filePath], {
            timeout,
            killSignal: 'SIGTERM',
            cwd: tmpDir
        })

        process.stdout.on('data', (data) => {
            output += data.toString()
        })

        process.stderr.on('data', (data) => {
            errorOutput += data.toString()
        })

        process.on('close', async (code) => {
            await cleanup(tmpDir)
            resolve({
                success: code === 0,
                output: output || errorOutput,
                exitCode: code,
                testPassed: code === 0
            })
        })

        process.on('error', async (err) => {
            await cleanup(tmpDir)
            resolve({
                success: false,
                output: `测试执行错误: ${err.message}`,
                exitCode: -1,
                testPassed: false
            })
        })

        setTimeout(() => {
            process.kill()
            resolve({
                success: false,
                output: '测试执行超时',
                exitCode: -1,
                testPassed: false
            })
        }, timeout)
    })
}

// 执行Gherkin测试（支持多文件）
async function executeGherkinTest(files, timeout = 60000) {
    const tmpDir = await createTempDir('llm-gherkin-')

    try {
        // 创建features目录结构
        const featuresDir = path.join(tmpDir, 'features')
        const stepsDir = path.join(featuresDir, 'steps')
        await fs.mkdir(featuresDir, { recursive: true })
        await fs.mkdir(stepsDir, { recursive: true })

        // 写入所有文件
        for (const file of files) {
            const targetDir = file.type === 'feature' ? featuresDir : stepsDir
            const filePath = path.join(targetDir, file.filename)
            await fs.writeFile(filePath, file.content, 'utf-8')
        }

        return new Promise((resolve) => {
            let output = ''
            let errorOutput = ''

            const process = spawn('behave', [featuresDir, '--no-color'], {
                timeout,
                killSignal: 'SIGTERM',
                cwd: tmpDir
            })

            process.stdout.on('data', (data) => {
                output += data.toString()
            })

            process.stderr.on('data', (data) => {
                errorOutput += data.toString()
            })

            process.on('close', async (code) => {
                await cleanup(tmpDir)
                resolve({
                    success: code === 0,
                    output: output || errorOutput,
                    exitCode: code,
                    testPassed: code === 0
                })
            })

            process.on('error', async (err) => {
                await cleanup(tmpDir)
                resolve({
                    success: false,
                    output: `Gherkin测试执行错误: ${err.message}\n提示：请确保已安装behave (pip install behave)`,
                    exitCode: -1,
                    testPassed: false
                })
            })

            setTimeout(() => {
                process.kill()
                resolve({
                    success: false,
                    output: 'Gherkin测试执行超时',
                    exitCode: -1,
                    testPassed: false
                })
            }, timeout)
        })
    } catch (err) {
        await cleanup(tmpDir)
        return {
            success: false,
            output: `创建测试环境失败: ${err.message}`,
            exitCode: -1,
            testPassed: false
        }
    }
}

// 执行带依赖的项目（支持多文件结构）
async function executeProject(files, mainFile, timeout = 60000) {
    const tmpDir = await createTempDir('llm-project-')

    try {
        // 写入所有文件到对应目录
        for (const file of files) {
            const filePath = path.join(tmpDir, file.path)
            const fileDir = path.dirname(filePath)

            // 确保目录存在
            await fs.mkdir(fileDir, { recursive: true })
            await fs.writeFile(filePath, file.content, 'utf-8')
        }

        // 确定执行命令
        const ext = path.extname(mainFile)
        const mainFilePath = path.join(tmpDir, mainFile)
        let command, args

        if (ext === '.py') {
            command = 'python3'
            args = [mainFilePath]
        } else if (ext === '.js') {
            command = 'node'
            args = [mainFilePath]
        } else {
            return {
                success: false,
                output: `不支持的文件类型: ${ext}`,
                exitCode: -1
            }
        }

        return new Promise((resolve) => {
            let output = ''
            let errorOutput = ''

            const process = spawn(command, args, {
                timeout,
                killSignal: 'SIGTERM',
                cwd: tmpDir
            })

            process.stdout.on('data', (data) => {
                output += data.toString()
            })

            process.stderr.on('data', (data) => {
                errorOutput += data.toString()
            })

            process.on('close', async (code) => {
                await cleanup(tmpDir)
                resolve({
                    success: code === 0,
                    output: output || errorOutput,
                    exitCode: code
                })
            })

            process.on('error', async (err) => {
                await cleanup(tmpDir)
                resolve({
                    success: false,
                    output: `执行错误: ${err.message}`,
                    exitCode: -1
                })
            })

            setTimeout(() => {
                process.kill()
                resolve({
                    success: false,
                    output: '执行超时',
                    exitCode: -1
                })
            }, timeout)
        })
    } catch (err) {
        await cleanup(tmpDir)
        return {
            success: false,
            output: `创建项目环境失败: ${err.message}`,
            exitCode: -1
        }
    }
}

// 统一的执行入口
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
                // 支持两种方式：旧的featureCode+stepsCode，或新的files数组
                if (files && files.length > 0) {
                    return await executeGherkinTest(files, timeout)
                } else if (stepsCode) {
                    // 兼容旧方式
                    const gherkinFiles = [
                        { type: 'feature', filename: 'test.feature', content: code },
                        { type: 'steps', filename: 'steps.py', content: stepsCode }
                    ]
                    return await executeGherkinTest(gherkinFiles, timeout)
                } else {
                    return {
                        success: false,
                        output: 'Gherkin测试需要提供files数组或stepsCode',
                        exitCode: -1
                    }
                }
            case 'project':
                if (!files || files.length === 0) {
                    return {
                        success: false,
                        output: '项目执行需要提供files数组',
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

module.exports = {
    executeCode
}