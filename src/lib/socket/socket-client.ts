import { io, type Socket } from 'socket.io-client';
import { useEditorStore } from '../store/editor-store';
import type { LocalOperation } from '../dexie/db';

interface PresenceUser {
  userId: string;
  name: string;
  email: string;
  avatar: string;
  color: string;
  typing: boolean;
}

class DocumentSocketClient {
  private socket: Socket | null = null;
  private currentDocId: string | null = null;

  /**
   * Connects to the Socket.IO server and joins the document room.
   */
  public connect(documentId: string, user: { id: string; name: string; email: string; image?: string | null }) {
    if (this.socket) {
      this.disconnect();
    }

    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';
    console.log(`Connecting to Socket.IO server at ${socketUrl}...`);

    this.currentDocId = documentId;
    
    // Connect to server
    this.socket = io(socketUrl, {
      transports: ['websocket'],
      autoConnect: true,
    });

    this.socket.on('connect', () => {
      console.log('Connected to collaboration server.');
      
      // Join room
      this.socket?.emit('join-document', {
        documentId,
        userId: user.id,
        name: user.name,
        email: user.email,
        avatar: user.image || '',
      });
    });

    // Handle collaborators list updates
    this.socket.on('presence-update', (users: PresenceUser[]) => {
      // Filter out current client from collaborator list
      const collaborators = users
        .filter(u => u.userId !== user.id) // Filter by user ID
        .map(u => ({
          userId: u.userId,
          name: u.name,
          email: u.email,
          avatar: u.avatar,
          color: u.color,
          typing: u.typing,
        }));

      useEditorStore.getState().setCollaborators(collaborators);
    });

    // Handle real-time operation broadcasts from other clients
    this.socket.on('operations-broadcast', async (operations: LocalOperation[]) => {
      console.log(`Received ${operations.length} real-time operations over WebSockets.`);
      await useEditorStore.getState().applyRemoteOperations(operations);
    });

    // Log connection failures
    this.socket.on('connect_error', (error) => {
      console.warn('Collaboration connection error:', error.message);
    });
  }

  /**
   * Broadcasts newly created operations in real time to online room members.
   */
  public broadcastOperations(operations: LocalOperation[]) {
    if (!this.socket?.connected) return;
    this.socket.emit('new-operations', { operations });
  }

  /**
   * Updates typing indicator status.
   */
  public sendTypingStatus(isTyping: boolean) {
    if (!this.socket?.connected) return;
    this.socket.emit('typing-status', { isTyping });
  }

  /**
   * Updates cursor coordinates.
   */
  public sendCursorMove(x: number, y: number) {
    if (!this.socket?.connected) return;
    this.socket.emit('cursor-move', { x, y });
  }

  /**
   * Disconnects from the socket server and resets store collaborators.
   */
  public disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.currentDocId = null;
    useEditorStore.getState().setCollaborators([]);
  }
}

export const socketClient = new DocumentSocketClient();
