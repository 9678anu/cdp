// server.js
const WebSocket = require('ws');
const server = new WebSocket.Server({ port: 8080 });

const users = new Map();
const pendingRequests = new Map();

function generateUniqueId(email) {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = (hash << 5) - hash + email.charCodeAt(i);
    hash |= 0;
  }
  return `${Math.abs(hash % 1000)}-${Math.abs((hash >> 10) % 1000)}-${Math.abs((hash >> 20) % 1000)}`;
}

function broadcastUserStatus() {
  const userList = Array.from(users.entries()).map(([email, user]) => ({
    email,
    id: user.id,
    status: user.status,
  }));
  users.forEach(user => {
    user.ws.send(JSON.stringify({ type: 'user-status', users: userList }));
  });
}

server.on('connection', (ws) => {
  console.log('New client connected');

  ws.on('message', (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch (error) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message' }));
      return;
    }

    if (data.type === 'register') {
      if (users.has(data.email)) {
        ws.send(JSON.stringify({ type: 'error', message: 'User exists' }));
        return;
      }
      users.set(data.email, { ws, id: generateUniqueId(data.email), status: 'online' });
      ws.send(JSON.stringify({ type: 'registered', id: generateUniqueId(data.email) }));
      broadcastUserStatus();
    }

    if (data.type === 'connection-request') {
      const targetUser = Array.from(users.entries()).find(([_, user]) => user.id === data.to);
      if (targetUser) {
        const [targetEmail, target] = targetUser;
        pendingRequests.set(data.from, { to: data.to, from: data.from });
        target.ws.send(JSON.stringify({
          type: 'connection-request',
          from: data.from,
          fromId: users.get(data.from)?.id,
        }));
      } else {
        ws.send(JSON.stringify({ type: 'error', message: 'User not found' }));
      }
    }

    if (data.type === 'connection-response') {
      const requester = users.get(data.to);
      if (requester) {
        requester.ws.send(JSON.stringify({
          type: 'connection-response',
          from: data.from,
          accepted: data.accepted,
        }));
        if (data.accepted) {
          pendingRequests.delete(data.to);
          ws.send(JSON.stringify({ type: 'connection-established', partner: data.to }));
          requester.ws.send(JSON.stringify({ type: 'connection-established', partner: data.from }));
        }
      }
    }

    if (data.type === 'disconnect') {
      const targetUser = users.get(data.to);
      if (targetUser) {
        targetUser.ws.send(JSON.stringify({ type: 'connection-terminated', partner: data.from }));
      }
    }
  });

  ws.on('close', () => {
    const userEmail = Array.from(users.entries()).find(([_, user]) => user.ws === ws)?.[0];
    if (userEmail) {
      users.delete(userEmail);
      broadcastUserStatus();
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

console.log('Server running on ws://localhost:8080');