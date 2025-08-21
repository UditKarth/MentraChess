import { WebSocket, WebSocketServer } from 'ws';
import { NetworkService, NetworkMessage, GameRequestMessage, GameResponseMessage, MoveMessage, GameStateMessage, ChatMessage, GameEndMessage } from './NetworkService';
import { GameMove, SessionState } from '../utils/types';
import { Server } from 'http';

/**
 * WebSocket implementation of NetworkService for real-time chess communication
 */
export class WebSocketNetworkService implements NetworkService {
  private wss: WebSocketServer;
  private connections: Map<string, WebSocket> = new Map();
  private messageQueues: Map<string, NetworkMessage[]> = new Map();
  private gameParticipants: Map<string, Set<string>> = new Map();
  private eventHandlers: Map<string, Array<(data: any) => void>> = new Map();
  private userNicknames: Map<string, string> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  
  // Memory management constants
  private readonly MAX_CONNECTIONS = 1000;
  private readonly MAX_QUEUE_SIZE = 50; // Maximum messages per user queue
  private readonly MAX_QUEUE_AGE = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_GAME_PARTICIPANTS = 100;
  private readonly MAX_EVENT_HANDLERS = 20; // Maximum handlers per event type
  
  constructor(portOrServer?: number | Server) {
    if (typeof portOrServer === 'number') {
      // Port-based initialization (for testing)
      this.wss = new WebSocketServer({ port: portOrServer });
      console.log(`[WebSocketNetworkService] WebSocket server started on port ${portOrServer}`);
    } else if (portOrServer) {
      // Server-based initialization (for production)
      this.wss = new WebSocketServer({ server: portOrServer });
      console.log(`[WebSocketNetworkService] WebSocket server attached to HTTP server`);
    } else {
      // Default port for backward compatibility
      this.wss = new WebSocketServer({ port: 8080 });
      console.log(`[WebSocketNetworkService] WebSocket server started on default port 8080`);
    }
    this.setupWebSocketServer();
    this.setupPeriodicCleanup();
  }
  
  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws: WebSocket, req: any) => {
      // Check connection limit
      if (this.connections.size >= this.MAX_CONNECTIONS) {
        console.warn(`[WebSocketNetworkService] Connection limit reached (${this.MAX_CONNECTIONS}), rejecting new connection`);
        ws.close(1013, 'Server overloaded'); // Try again later
        return;
      }
      
      const userId = this.extractUserIdFromRequest(req);
      if (userId) {
        this.connections.set(userId, ws);
        this.setupMessageHandlers(ws, userId);
        console.log(`[WebSocketNetworkService] User ${userId} connected (${this.connections.size}/${this.MAX_CONNECTIONS})`);
        
        // Send queued messages if any
        this.sendQueuedMessages(userId);
      } else {
        console.warn('[WebSocketNetworkService] Connection attempt without valid userId');
        ws.close();
      }
    });
    
    this.wss.on('error', (error) => {
      console.error('[WebSocketNetworkService] WebSocket server error:', error);
    });
  }
  
  private setupPeriodicCleanup(): void {
    // Clean up old message queues every 2 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupMessageQueues();
    }, 2 * 60 * 1000);
  }
  
  private cleanupMessageQueues(): void {
    const now = Date.now();
    let cleanedQueues = 0;
    let cleanedMessages = 0;
    
    for (const [userId, queue] of this.messageQueues.entries()) {
      // Remove old messages
      const originalLength = queue.length;
      const filteredQueue = queue.filter(msg => (now - msg.timestamp) < this.MAX_QUEUE_AGE);
      
      if (filteredQueue.length !== originalLength) {
        this.messageQueues.set(userId, filteredQueue);
        cleanedMessages += (originalLength - filteredQueue.length);
      }
      
      // Remove empty queues
      if (filteredQueue.length === 0) {
        this.messageQueues.delete(userId);
        cleanedQueues++;
      }
    }
    
    if (cleanedQueues > 0 || cleanedMessages > 0) {
      console.log(`[WebSocketNetworkService] Cleaned up ${cleanedQueues} empty queues and ${cleanedMessages} old messages`);
    }
  }
  
  private extractUserIdFromRequest(req: any): string | null {
    try {
      // Extract userId from query parameters or headers
      const url = new URL(req.url, `http://${req.headers.host}`);
      const userId = url.searchParams.get('userId');
      
      if (!userId) {
        // Try to get from headers
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          return authHeader.substring(7);
        }
      }
      
      return userId;
    } catch (error) {
      console.error('[WebSocketNetworkService] Error extracting userId:', error);
      return null;
    }
  }
  
  private setupMessageHandlers(ws: WebSocket, userId: string): void {
    ws.on('message', (data: Buffer) => {
      try {
        const message: NetworkMessage = JSON.parse(data.toString());
        this.handleIncomingMessage(message);
      } catch (error) {
        console.error('[WebSocketNetworkService] Error parsing message:', error);
      }
    });
    
    ws.on('close', () => {
      this.connections.delete(userId);
      this.handleUserDisconnection(userId);
      console.log(`[WebSocketNetworkService] User ${userId} disconnected (${this.connections.size}/${this.MAX_CONNECTIONS})`);
    });
    
    ws.on('error', (error) => {
      console.error(`[WebSocketNetworkService] WebSocket error for user ${userId}:`, error);
      this.connections.delete(userId);
      this.handleUserDisconnection(userId);
    });
  }
  
  private handleIncomingMessage(message: NetworkMessage): void {
    // Limit logging in production
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[WebSocketNetworkService] Received message: ${message.type} from ${message.fromUserId}`);
    }
    
    // Emit event for handlers to process
    this.emit(message.type, message);
  }
  
  private handleUserDisconnection(userId: string): void {
    // Remove from all game participants
    for (const [gameId, participants] of this.gameParticipants.entries()) {
      participants.delete(userId);
      if (participants.size === 0) {
        this.gameParticipants.delete(gameId);
      }
    }
    
    // Clear message queue
    this.messageQueues.delete(userId);
  }
  
  private sendQueuedMessages(userId: string): void {
    const queuedMessages = this.messageQueues.get(userId);
    if (queuedMessages && queuedMessages.length > 0) {
      console.log(`[WebSocketNetworkService] Sending ${queuedMessages.length} queued messages to ${userId}`);
      
      for (const message of queuedMessages) {
        this.sendMessageToUser(userId, message);
      }
      
      this.messageQueues.delete(userId);
    }
  }
  
  async connect(userId: string): Promise<void> {
    // Connection is handled by WebSocket connection event
    // This method is mainly for interface compliance
    console.log(`[WebSocketNetworkService] Connect called for user ${userId}`);
  }
  
  async disconnect(userId: string): Promise<void> {
    const ws = this.connections.get(userId);
    if (ws) {
      ws.close();
      this.connections.delete(userId);
    }
  }
  
  async sendGameRequest(fromUserId: string, toUserId: string, gameId: string): Promise<void> {
    const message: NetworkMessage = {
      type: 'game_request',
      gameId,
      fromUserId,
      toUserId,
      data: {
        gameId,
        fromUserId,
        fromNickname: this.userNicknames.get(fromUserId) || fromUserId,
        timestamp: Date.now()
      } as GameRequestMessage,
      timestamp: Date.now()
    };
    
    await this.sendMessageToUser(toUserId, message);
  }
  
  async sendGameResponse(gameId: string, fromUserId: string, accepted: boolean): Promise<void> {
    const message: NetworkMessage = {
      type: 'game_response',
      gameId,
      fromUserId,
      data: {
        gameId,
        accepted,
        fromUserId,
        timestamp: Date.now()
      } as GameResponseMessage,
      timestamp: Date.now()
    };
    
    // Send to all participants in the game
    const participants = this.gameParticipants.get(gameId);
    if (participants) {
      for (const userId of participants) {
        if (userId !== fromUserId) {
          await this.sendMessageToUser(userId, message);
        }
      }
    }
  }
  
  async sendMove(gameId: string, fen: string, move: GameMove): Promise<void> {
    const participants = this.gameParticipants.get(gameId);
    if (!participants) {
      console.warn(`[WebSocketNetworkService] No participants found for game ${gameId}`);
      return;
    }
    
    const message: NetworkMessage = {
      type: 'move',
      gameId,
      fromUserId: move.fromUserId || 'unknown',
      data: {
        fen,
        move,
        gameId,
        fromUserId: move.fromUserId || 'unknown',
        timestamp: Date.now()
      } as MoveMessage,
      timestamp: Date.now()
    };
    
    // Send to all participants except sender
    for (const userId of participants) {
      if (userId !== message.fromUserId) {
        await this.sendMessageToUser(userId, message);
      }
    }
  }
  
  async receiveMove(gameId: string): Promise<{fen: string, move: GameMove} | null> {
    // This would typically be handled by event listeners
    // For now, return null as moves are handled via events
    return null;
  }

  async sendValidatedMove(gameId: string, fen: string, move: GameMove, validation: any): Promise<void> {
    const participants = this.gameParticipants.get(gameId);
    if (!participants) {
      console.warn(`[WebSocketNetworkService] No participants found for game ${gameId}`);
      return;
    }
    
    const message: NetworkMessage = {
      type: 'validated_move',
      gameId,
      fromUserId: move.fromUserId || 'unknown',
      data: {
        fen,
        move,
        validation,
        gameId,
        fromUserId: move.fromUserId || 'unknown',
        timestamp: Date.now()
      },
      timestamp: Date.now()
    };
    
    // Send to all participants except sender
    for (const userId of participants) {
      if (userId !== message.fromUserId) {
        await this.sendMessageToUser(userId, message);
      }
    }
  }

  async receiveValidatedMove(gameId: string): Promise<{fen: string, move: GameMove, validation: any} | null> {
    // This would typically be handled by event listeners
    return null;
  }

  async sendMoveAcknowledgment(gameId: string, moveId: string, accepted: boolean, error?: string): Promise<void> {
    const participants = this.gameParticipants.get(gameId);
    if (!participants) return;
    
    const message: NetworkMessage = {
      type: 'move_ack',
      gameId,
      fromUserId: 'system',
      data: { moveId, accepted, error },
      timestamp: Date.now()
    };
    
    // Send to all participants
    for (const userId of participants) {
      await this.sendMessageToUser(userId, message);
    }
  }

  async receiveMoveAcknowledgment(gameId: string): Promise<{moveId: string, accepted: boolean, error?: string} | null> {
    // This would typically be handled by event listeners
    return null;
  }
  
  async sendGameState(gameId: string, state: SessionState): Promise<void> {
    const participants = this.gameParticipants.get(gameId);
    if (!participants) return;
    
    const message: NetworkMessage = {
      type: 'game_state',
      gameId,
      fromUserId: 'system',
      data: {
        state,
        gameId,
        fromUserId: 'system',
        timestamp: Date.now()
      } as GameStateMessage,
      timestamp: Date.now()
    };
    
    // Send to all participants
    for (const userId of participants) {
      await this.sendMessageToUser(userId, message);
    }
  }
  
  async receiveGameState(gameId: string): Promise<SessionState | null> {
    // This would typically be handled by event listeners
    return null;
  }

  async sendGameStateUpdate(gameId: string, state: SessionState, moveHistory: GameMove[]): Promise<void> {
    const participants = this.gameParticipants.get(gameId);
    if (!participants) return;
    
    const message: NetworkMessage = {
      type: 'game_state_update',
      gameId,
      fromUserId: 'system',
      data: {
        state,
        moveHistory,
        gameId,
        fromUserId: 'system',
        timestamp: Date.now()
      },
      timestamp: Date.now()
    };
    
    // Send to all participants
    for (const userId of participants) {
      await this.sendMessageToUser(userId, message);
    }
  }

  async receiveGameStateUpdate(gameId: string): Promise<{state: SessionState, moveHistory: GameMove[]} | null> {
    // This would typically be handled by event listeners
    return null;
  }

  async requestGameStateSync(gameId: string, userId: string): Promise<void> {
    const participants = this.gameParticipants.get(gameId);
    if (!participants) return;
    
    const message: NetworkMessage = {
      type: 'game_state_sync_request',
      gameId,
      fromUserId: userId,
      data: { gameId, fromUserId: userId },
      timestamp: Date.now()
    };
    
    // Send to all participants except requester
    for (const participantUserId of participants) {
      if (participantUserId !== userId) {
        await this.sendMessageToUser(participantUserId, message);
      }
    }
  }

  async respondToGameStateSync(gameId: string, state: SessionState): Promise<void> {
    const participants = this.gameParticipants.get(gameId);
    if (!participants) return;
    
    const message: NetworkMessage = {
      type: 'game_state_sync_response',
      gameId,
      fromUserId: 'system',
      data: { state, gameId },
      timestamp: Date.now()
    };
    
    // Send to all participants
    for (const userId of participants) {
      await this.sendMessageToUser(userId, message);
    }
  }
  
  async sendMessage(gameId: string, fromUserId: string, message: string): Promise<void> {
    const participants = this.gameParticipants.get(gameId);
    if (!participants) return;
    
    const chatMessage: NetworkMessage = {
      type: 'message',
      gameId,
      fromUserId,
      data: {
        message,
        gameId,
        fromUserId,
        timestamp: Date.now()
      } as ChatMessage,
      timestamp: Date.now()
    };
    
    // Send to all participants except sender
    for (const userId of participants) {
      if (userId !== fromUserId) {
        await this.sendMessageToUser(userId, chatMessage);
      }
    }
  }
  
  async receiveMessage(gameId: string): Promise<{fromUserId: string, message: string} | null> {
    // This would typically be handled by event listeners
    return null;
  }
  
  async sendGameEnd(gameId: string, reason: 'resignation' | 'checkmate' | 'stalemate' | 'draw', winner?: string): Promise<void> {
    const participants = this.gameParticipants.get(gameId);
    if (!participants) return;
    
    const message: NetworkMessage = {
      type: 'game_end',
      gameId,
      fromUserId: 'system',
      data: {
        reason,
        winner,
        gameId,
        fromUserId: 'system',
        timestamp: Date.now()
      } as GameEndMessage,
      timestamp: Date.now()
    };
    
    // Send to all participants
    for (const userId of participants) {
      await this.sendMessageToUser(userId, message);
    }
  }
  
  async receiveGameEnd(gameId: string): Promise<{reason: string, winner?: string} | null> {
    // This would typically be handled by event listeners
    return null;
  }
  
  on(event: string, handler: (data: any) => void): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    
    const handlers = this.eventHandlers.get(event)!;
    
    // Limit number of handlers per event to prevent memory leaks
    if (handlers.length >= this.MAX_EVENT_HANDLERS) {
      console.warn(`[WebSocketNetworkService] Too many handlers for event ${event}, removing oldest`);
      handlers.shift(); // Remove oldest handler
    }
    
    handlers.push(handler);
  }
  
  off(event: string, handler: (data: any) => void): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }
  
  private emit(event: string, data: any): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch (error) {
          console.error(`[WebSocketNetworkService] Error in event handler for ${event}:`, error);
        }
      }
    }
  }
  
  private async sendMessageToUser(userId: string, message: NetworkMessage): Promise<void> {
    const ws = this.connections.get(userId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        console.error(`[WebSocketNetworkService] Error sending message to ${userId}:`, error);
        this.queueMessage(userId, message);
      }
    } else {
      // Queue message for offline users
      this.queueMessage(userId, message);
    }
  }
  
  private queueMessage(userId: string, message: NetworkMessage): void {
    if (!this.messageQueues.has(userId)) {
      this.messageQueues.set(userId, []);
    }
    
    const queue = this.messageQueues.get(userId)!;
    
    // Limit queue size to prevent memory leaks
    if (queue.length >= this.MAX_QUEUE_SIZE) {
      console.warn(`[WebSocketNetworkService] Message queue full for user ${userId}, dropping oldest message`);
      queue.shift(); // Remove oldest message
    }
    
    queue.push(message);
  }
  
  // Utility methods for game management
  addGameParticipant(gameId: string, userId: string): void {
    if (!this.gameParticipants.has(gameId)) {
      this.gameParticipants.set(gameId, new Set());
    }
    
    const participants = this.gameParticipants.get(gameId)!;
    
    // Limit participants per game
    if (participants.size >= this.MAX_GAME_PARTICIPANTS) {
      console.warn(`[WebSocketNetworkService] Too many participants for game ${gameId}`);
      return;
    }
    
    participants.add(userId);
  }
  
  removeGameParticipant(gameId: string, userId: string): void {
    const participants = this.gameParticipants.get(gameId);
    if (participants) {
      participants.delete(userId);
      if (participants.size === 0) {
        this.gameParticipants.delete(gameId);
      }
    }
  }
  
  setUserNickname(userId: string, nickname: string): void {
    this.userNicknames.set(userId, nickname);
  }
  
  getUserNickname(userId: string): string {
    return this.userNicknames.get(userId) || userId;
  }
  
  getConnectedUsers(): string[] {
    return Array.from(this.connections.keys());
  }
  
  getActiveGames(): string[] {
    return Array.from(this.gameParticipants.keys());
  }

  getConnectionStatus(userId: string): 'connected' | 'disconnected' | 'unknown' {
    const ws = this.connections.get(userId);
    if (!ws) return 'unknown';
    
    switch (ws.readyState) {
      case WebSocket.OPEN:
        return 'connected';
      case WebSocket.CLOSED:
      case WebSocket.CLOSING:
        return 'disconnected';
      case WebSocket.CONNECTING:
        return 'connected'; // Consider connecting as connected
      default:
        return 'unknown';
    }
  }

  getGameParticipants(gameId: string): string[] {
    const participants = this.gameParticipants.get(gameId);
    return participants ? Array.from(participants) : [];
  }

  isUserInGame(userId: string, gameId: string): boolean {
    const participants = this.gameParticipants.get(gameId);
    return participants ? participants.has(userId) : false;
  }

  getNetworkStats(): {
    connectedUsers: number;
    activeGames: number;
    messagesQueued: number;
    averageLatency: number;
  } {
    let totalQueuedMessages = 0;
    for (const queue of this.messageQueues.values()) {
      totalQueuedMessages += queue.length;
    }

    return {
      connectedUsers: this.connections.size,
      activeGames: this.gameParticipants.size,
      messagesQueued: totalQueuedMessages,
      averageLatency: 0 // Would need to implement latency tracking
    };
  }
  
  // Cleanup method
  stop(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    return new Promise((resolve) => {
      // Close all individual connections first
      for (const [userId, ws] of this.connections.entries()) {
        try {
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close();
          }
        } catch (error) {
          console.warn(`[WebSocketNetworkService] Error closing connection for ${userId}:`, error);
        }
      }
      
      // Close the server
      this.wss.close((error) => {
        if (error) {
          console.warn('[WebSocketNetworkService] Error closing WebSocket server:', error);
        }
        
        // Clear all data structures
        this.connections.clear();
        this.messageQueues.clear();
        this.gameParticipants.clear();
        this.eventHandlers.clear();
        this.userNicknames.clear();
        
        console.log('[WebSocketNetworkService] Service stopped');
        resolve();
      });
    });
  }
}
