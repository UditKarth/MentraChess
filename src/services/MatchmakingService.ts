import { GameChallenge, PlayerColor } from '../utils/types';

/**
 * MatchmakingService interface for handling game matchmaking
 */
export interface MatchmakingService {
  // Friend-based matchmaking
  sendChallenge(fromUserId: string, toUserId: string): Promise<GameChallenge>;
  acceptChallenge(challengeId: string, userId: string): Promise<boolean>;
  rejectChallenge(challengeId: string, userId: string): Promise<boolean>;
  
  // Random matchmaking
  joinMatchmaking(userId: string, preferences: MatchmakingPreferences): Promise<void>;
  leaveMatchmaking(userId: string): Promise<void>;
  
  // Game management
  createGame(player1Id: string, player2Id: string): Promise<string>;
  endGame(gameId: string, reason: string): Promise<void>;
  
  // Status queries
  getPendingChallenges(userId: string): Promise<GameChallenge[]>;
  getActiveGames(userId: string): Promise<ActiveGame[]>;
  
  // User management
  getUserNickname(userId: string): Promise<string>;
  setUserNickname(userId: string, nickname: string): Promise<void>;
  getOnlineUsers(): Promise<string[]>;
}

/**
 * Matchmaking preferences for random matchmaking
 */
export interface MatchmakingPreferences {
  timeControl?: 'blitz' | 'rapid' | 'classical';
  ratingRange?: { min: number; max: number };
  allowUnrated?: boolean;
  maxWaitTime?: number; // in seconds
}

/**
 * Active game information
 */
export interface ActiveGame {
  gameId: string;
  opponentId: string;
  opponentNickname: string;
  playerColor: PlayerColor;
  gameStartTime: Date;
  lastMoveTime: Date;
  isMyTurn: boolean;
  gameMode: 'multiplayer_active' | 'multiplayer_waiting' | 'multiplayer_ended';
}

/**
 * Matchmaking queue entry
 */
export interface MatchmakingQueueEntry {
  userId: string;
  preferences: MatchmakingPreferences;
  joinTime: Date;
  lastActivity: Date;
}

/**
 * Game creation result
 */
export interface GameCreationResult {
  gameId: string;
  player1Id: string;
  player2Id: string;
  player1Color: PlayerColor;
  player2Color: PlayerColor;
  startTime: Date;
}

/**
 * Challenge result
 */
export interface ChallengeResult {
  success: boolean;
  challenge?: GameChallenge;
  error?: string;
}

/**
 * Matchmaking result
 */
export interface MatchmakingResult {
  success: boolean;
  gameId?: string;
  opponentId?: string;
  error?: string;
}
