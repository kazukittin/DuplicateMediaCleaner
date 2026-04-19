import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null
let currentPort = 8765

export function getSocket(port?: number): Socket {
  if (port && port !== currentPort) {
    socket?.disconnect()
    socket = null
    currentPort = port
  }
  if (!socket || !socket.connected) {
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
