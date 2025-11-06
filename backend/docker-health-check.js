const { spawn } = require('child_process')

function checkDocker() {
    return new Promise((resolve) => {
        const process = spawn('docker', ['ps'])
        let output = ''

        process.stdout.on('data', (data) => {
            output += data.toString()
        })

        process.on('close', (code) => {
            resolve(code === 0)
        })

        process.on('error', () => {
            resolve(false)
        })
    })
}

async function checkImages() {
    const requiredImages = [
        'python:3.11-alpine',
        'llm-python-test:latest'
    ]

    for (const image of requiredImages) {
        const exists = await new Promise((resolve) => {
            const process = spawn('docker', ['images', '-q', image])
            let output = ''

            process.stdout.on('data', (data) => {
                output += data.toString()
            })

            process.on('close', () => {
                resolve(output.trim().length > 0)
            })
        })

        if (!exists) {
            console.log(`❌ 缺少镜像: ${image}`)
            return false
        } else {
            console.log(`✓ 镜像存在: ${image}`)
        }
    }

    return true
}

async function main() {
    console.log('检查Docker环境...\n')

    const dockerRunning = await checkDocker()
    if (!dockerRunning) {
        console.log('❌ Docker未运行或未安装')
        console.log('\n请确保:')
        console.log('1. 已安装Docker Desktop')
        console.log('2. Docker Desktop正在运行')
        process.exit(1)
    }

    console.log('✓ Docker正在运行\n')

    const imagesOk = await checkImages()
    if (!imagesOk) {
        console.log('\n请运行以下命令拉取/构建镜像:')
        console.log('docker pull python:3.11-alpine')
        console.log('docker build -t llm-python-test:latest -f docker/python-test.Dockerfile .')
        process.exit(1)
    }

    console.log('\n✓ 所有检查通过！环境配置正确')
}

main()