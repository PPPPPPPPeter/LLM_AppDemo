const API = 'http://localhost:3000/api/execute'

export async function executeCode(type, code, options = {}) {
    try {
        const res = await fetch(API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type,
                code,
                files: options.files,
                mainFile: options.mainFile,
                timeout: options.timeout || 30000
            })
        })

        if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            throw new Error(err.error || `HTTP ${res.status}`)
        }

        return await res.json()
    } catch (error) {
        if (error.message.includes('fetch')) {
            throw new Error('Backend not running on port 3000')
        }
        throw error
    }
}