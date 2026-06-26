import { createServer } from 'http';
import { Server } from 'socket.io';

const PORT = process.env.PORT || 3001;

const httpServer = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('SyncForge Standalone Socket.IO Server is running\n');
});

const io = new Server(httpServer, {
  cors: {
    origin: '*', // Allow connections from Next.js (port 3000)
    methods: ['GET', 'POST'],
  },
});

interface UserPresence {
  socketId: string;
  userId: string;
  name: string;
  email: string;
  avatar: string;
  color: string;
  typing: boolean;
  cursor?: { x: number; y: number } | null;
}

// Map from documentId -> Map from socketId -> UserPresence
const documentRooms = new Map<string, Map<string, UserPresence>>();

// Simple color generator for collaborator cursors
const COLORS = [
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#f43f5e', // Rose
  '#10b981', // Emerald
  '#06b6d4', // Cyan
  '#f59e0b', // Amber
  '#ef4444', // Red
];

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  let currentDocId: string | null = null;
  let currentUserId: string | null = null;

  // 1. User joins a document room
  socket.on('join-document', ({ documentId, userId, name, email, avatar }) => {
    if (!documentId || !userId) return;

    socket.join(`doc:${documentId}`);
    currentDocId = documentId;
    currentUserId = userId;

    if (!documentRooms.has(documentId)) {
      documentRooms.set(documentId, new Map());
    }

    const roomUsers = documentRooms.get(documentId)!;
    const colorIndex = roomUsers.size % COLORS.length;
    
    roomUsers.set(socket.id, {
      socketId: socket.id,
      userId,
      name: name || 'Anonymous',
      email: email || '',
      avatar: avatar || '',
      color: COLORS[colorIndex],
      typing: false,
    });

    console.log(`User ${name} joined doc ${documentId} on socket ${socket.id}`);

    // Broadcast updated presence list to everyone in this room
    const usersList = Array.from(roomUsers.values());
    io.to(`doc:${documentId}`).emit('presence-update', usersList);
  });

  // 2. Cursor coordinate updates
  socket.on('cursor-move', ({ x, y }) => {
    if (!currentDocId || !currentUserId) return;

    const roomUsers = documentRooms.get(currentDocId);
    if (roomUsers) {
      const user = roomUsers.get(socket.id);
      if (user) {
        user.cursor = { x, y };
        // Broadcast cursor update to other users in the room
        socket.to(`doc:${currentDocId}`).emit('cursor-update', {
          socketId: socket.id,
          userId: currentUserId,
          name: user.name,
          color: user.color,
          cursor: { x, y },
        });
      }
    }
  });

  // 3. Typing indicator updates
  socket.on('typing-status', ({ isTyping }) => {
    if (!currentDocId) return;

    const roomUsers = documentRooms.get(currentDocId);
    if (roomUsers) {
      const user = roomUsers.get(socket.id);
      if (user) {
        user.typing = isTyping;
        const usersList = Array.from(roomUsers.values());
        // Emit presence list update containing updated typing status
        io.to(`doc:${currentDocId}`).emit('presence-update', usersList);
      }
    }
  });

  // 4. Real-time Operation broadcast
  socket.on('new-operations', ({ operations }) => {
    if (!currentDocId || !Array.isArray(operations) || operations.length === 0) return;

    // Broadcast operations to all other clients in the document room
    socket.to(`doc:${currentDocId}`).emit('operations-broadcast', operations);
  });

  // 5. Disconnect handling
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);

    if (currentDocId && documentRooms.has(currentDocId)) {
      const roomUsers = documentRooms.get(currentDocId)!;
      roomUsers.delete(socket.id);

      if (roomUsers.size === 0) {
        documentRooms.delete(currentDocId);
      } else {
        const usersList = Array.from(roomUsers.values());
        io.to(`doc:${currentDocId}`).emit('presence-update', usersList);
      }

      socket.leave(`doc:${currentDocId}`);
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Socket.IO Server listening on port ${PORT}`);
});
