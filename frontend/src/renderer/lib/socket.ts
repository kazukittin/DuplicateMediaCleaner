import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null
let currentPort = 8765

export function getSocket(port?: number): Socket {
  if (port && port !== currentPort) {
    // ポートが変わった場合のみ再接続
    socket?.disconnect()
    socket = null
    currentPort = port
  }
  if (!socket) {
    // ソケットが存在しない場合のみ作成（connecting 中でも再作成しない）
    socket = io(`http://127.0.0.1:${currentPort}`, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    })
  }
  return socket
}

export function disconnectSocket() {
  socket?.disconnect()
  socket = null
}
