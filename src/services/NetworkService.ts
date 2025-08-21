import { GameMove, SessionState } from '../utils/types';

/**
 * NetworkService interface for handling real-time communication between chess players
 * This abstracts the communication layer to allow for different implementations
 * (WebSocket, WebRTC, etc.) while maintaining a consistent API.
 */
export interface NetworkService {
  // Connection management
  connect(userId: string): Promise<void>;
  disconnect(userId: string): Promise<void>;
  
  // Game management
  sendGameRequest(fromUserId: string, toUserId: string, gameId: string): Promise<void>;
  sendGameResponse(gameId: string, fromUserId: string, accepted: boolean): Promise<void>;
  
  // Move synchronization
  sendMove(gameId: string, fen: string, move: GameMove): Promise<void>;
  receiveMove(gameId: string): Promise<{fen: string, move: GameMove} | null>;
  
  // Enhanced move synchronization with validation
  sendValidatedMove(gameId: string, fen: string, move: GameMove, validation: any): Promise<void>;
  receiveValidatedMove(gameId: string): Promise<{fen: string, move: GameMove, validation: any} | null>;
  
  // Move acknowledgment and error handling
  sendMoveAcknowledgment(gameId: string, moveId: string, accepted: boolean, error?: string): Promise<void>;
  receiveMoveAcknowledgment(gameId: string): Promise<{moveId: string, accepted: boolean, error?: string} | null>;
  
  // Game state updates
  sendGameState(gameId: string, state: SessionState): Promise<void>;
  receiveGameState(gameId: string): Promise<SessionState | null>;
  
  // Game state synchronization and conflict resolution
  sendGameStateUpdate(gameId: string, state: SessionState, moveHistory: GameMove[]): Promise<void>;
  receiveGameStateUpdate(gameId: string): Promise<{state: SessionState, moveHistory: GameMove[]} | null>;
  
  // Game state conflict resolution
  requestGameStateSync(gameId: string, userId: string): Promise<void>;
  respondToGameStateSync(gameId: string, state: SessionState): Promise<void>;
  
  // Chat and communication
  sendMessage(gameId: string, fromUserId: string, message: string): Promise<void>;
  receiveMessage(gameId: string): Promise<{fromUserId: string, message: string} | null>;
  
  // Game end and resignation
  sendGameEnd(gameId: string, reason: 'resignation' | 'checkmate' | 'stalemate' | 'draw', winner?: string): Promise<void>;
  receiveGameEnd(gameId: string): Promise<{reason: string, winner?: string} | null>;
  
  // Event handling for incoming messages
  on(event: string, handler: (data: any) => void): void;
  off(event: string, handler: (data: any) => void): void;
  
  // Utility methods for game management
  addGameParticipant(gameId: string, userId: string): void;
  removeGameParticipant(gameId: string, userId: string): void;
  setUserNickname(userId: string, nickname: string): void;
  getUserNickname(userId: string): string;
  getConnectedUsers(): string[];
  getActiveGames(): string[];
  
  // Cleanup and monitoring
  stop(): Promise<void>;
  getConnectionStatus(userId: string): 'connected' | 'disconnected' | 'unknown';
  getGameParticipants(gameId: string): string[];
  isUserInGame(userId: string, gameId: string): boolean;
  
  // Performance monitoring
  getNetworkStats(): {
    connectedUsers: number;
    activeGames: number;
    messagesQueued: number;
    averageLatency: number;
  };
}

/**
 * Network message structure for all communication
 */
export interface NetworkMessage {
  type: 'game_request' | 'game_response' | 'move' | 'validated_move' | 'move_ack' | 'game_state' | 'game_state_update' | 'game_state_sync_request' | 'game_state_sync_response' | 'message' | 'game_end';
  gameId: string;
  fromUserId: string;
  toUserId?: string;
  data: any;
  timestamp: number;
}

/**
 * Game request message structure
 */
export interface GameRequestMessage {
  gameId: string;
  fromUserId: string;
  fromNickname: string;
  timestamp: number;
}

/**
 * Game response message structure
 */
export interface GameResponseMessage {
  gameId: string;
  accepted: boolean;
  fromUserId: string;
  timestamp: number;
}

/**
 * Move message structure
 */
export interface MoveMessage {
  fen: string;
  move: GameMove;
  gameId: string;
  fromUserId: string;
  timestamp: number;
}

/**
 * Game state message structure
 */
export interface GameStateMessage {
  state: SessionState;
  gameId: string;
  fromUserId: string;
  timestamp: number;
}

/**
 * Chat message structure
 */
export interface ChatMessage {
  message: string;
  gameId: string;
  fromUserId: string;
  timestamp: number;
}

/**
 * Game end message structure
 */
export interface GameEndMessage {
  reason: 'resignation' | 'checkmate' | 'stalemate' | 'draw';
  winner?: string;
  gameId: string;
  fromUserId: string;
  timestamp: number;
}
