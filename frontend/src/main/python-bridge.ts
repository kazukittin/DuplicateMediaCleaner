import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import { app } from 'electron'
import net from 'net'

export class PythonBridge {
  private process: ChildProcess | null = null
  port: number = 8765

  private async findFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer()
      server.listen(0, () => {
        const address = server.address()
        const port = typeof address === 'object' && address ? address.port : 8765
        server.close(() => resolve(port))
      })
      server.on('error', reject)
    })
  }

  async start(): Promise<void> {
    this.port = await this.findFreePort()

    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

    let pythonExecutable: string
    let scriptPath: string

    const projectRoot = path.join(app.getAppPath(), '..')

    let args: string[]
    let cwd: string

    if (isDev) {
      pythonExecutable = 'python'
      // Run as module from project root so relative imports work
      args = ['-m', 'backend.src.main', '--port', String(this.port)]
      cwd = projectRoot
    } else {
      pythonExecutable = path.join(process.resourcesPath, 'backend', 'main.exe')
      args = ['--port', String(this.port)]
      cwd = process.resourcesPath
    }

    this.process = spawn(pythonExecutable, args, {
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
      cwd,
    })

    this.process.stdout?.on('data', (data: Buffer) => {
      console.log('[Python]', data.toString())
    })

    this.process.stderr?.on('data', (data: Buffer) => {
      console.error('[Python Error]', data.toString())
    })

    this.process.on('error', (err) => {
      console.error('Failed to start Python process:', err)
    })

    // Wait for backend to be ready
    await this.waitForPort(this.port)
  }

  private waitForPort(port: number, timeout = 30000): Promise<void> {
    return new Promise((resolve, reject) => {
      const start = Date.now()
      const check = () => {
        const socket = net.connect(port, '127.0.0.1')
        socket.on('connect', () => {
          socket.destroy()
          resolve()
        })
        socket.on('error', () => {
          socket.destroy()
          if (Date.now() - start > timeout) {
            reject(new Error('Python backend failed to start'))
          } else {
            setTimeout(check, 500)
          }
        })
      }
      check()
    })
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill()
      this.process = null
    }
  }
}
