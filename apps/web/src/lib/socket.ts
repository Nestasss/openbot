import { io, type Socket } from 'socket.io-client';
import { getApiUrl, getToken } from './api';

let socket: Socket | null = null;

export function getSocket() {
  return socket;
}

export function connectSocket(onMessageNew: (msg: any) => void) {
  const token = getToken();
  if (!token) return null;

  const url = getApiUrl();
  socket = io(url, {
    transports: ['websocket'],
    auth: { token },
  });

  socket.on('connect', () => {
    // noop
  });

  socket.on('ready', () => {
    // noop
  });

  socket.on('message:new', (payload) => {
    onMessageNew(payload);
  });

  socket.on('disconnect', () => {
    // noop
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
