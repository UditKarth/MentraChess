import { NetworkService } from './NetworkService';
import { MatchmakingService, MatchmakingPreferences, ActiveGame, MatchmakingQueueEntry, GameCreationResult, ChallengeResult, MatchmakingResult } from './MatchmakingService';
import { GameChallenge, PlayerColor } from '../utils/types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Implementation of MatchmakingService for chess multiplayer
 */
export class MatchmakingServiceImpl implements MatchmakingService {
  private pendingChallenges: Map<string, GameChallenge> = new Map();
  private matchmakingQueue: Map<string, MatchmakingQueueEntry> = new Map();
  private activeGames: Map<string, ActiveGame> = new Map();
  private gameParticipants: Map<string, Set<string>> = new Map();
  private userNicknames: Map<string, string> = new Map();
  private onlineUsers: Set<string> = new Set();
  private cleanupInterval?: NodeJS.Timeout | undefined;
  
  constructor(private networkService: NetworkService) {
    this.setupPeriodicCleanup();
    console.log('[MatchmakingServiceImpl] Initialized');
  }
  
  async sendChallenge(fromUserId: string, toUserId: string): Promise<GameChallenge> {
    // Check if target user is online
    if (!this.onlineUsers.has(toUserId)) {
      throw new Error('User is not online');
    }
    
    // Check if user is already in a game
    const activeGame = await this.getActiveGames(toUserId);
    if (activeGame.length > 0) {
      throw new Error('User is already in a game');
    }
    
    const challenge: GameChallenge = {
      id: `challenge_${Date.now()}_${uuidv4().substring(0, 8)}`,
      fromUserId,
      fromNickname: await this.getUserNickname(fromUserId),
      toUserId,
      timestamp: new Date(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
      accepted: undefined
    };
    
    this.pendingChallenges.set(challenge.id, challenge);
    
    // Send challenge via network service
    await this.networkService.sendGameRequest(fromUserId, toUserId, challenge.id);
    
    console.log(`[MatchmakingServiceImpl] Challenge sent from ${fromUserId} to ${toUserId}`);
    return challenge;
  }
  
  async acceptChallenge(challengeId: string, userId: string): Promise<boolean> {
    const challenge = this.pendingChallenges.get(challengeId);
    if (!challenge || challenge.toUserId !== userId) {
      console.warn(`[MatchmakingServiceImpl] Invalid challenge acceptance attempt: ${challengeId} by ${userId}`);
      return false;
    }
    
    // Check if challenge has expired
    if (challenge.expiresAt < new Date()) {
      this.pendingChallenges.delete(challengeId);
      console.warn(`[MatchmakingServiceImpl] Challenge ${challengeId} has expired`);
      return false;
    }
    
    challenge.accepted = true;
    
    // Create game
    const gameId = await this.createGame(challenge.fromUserId, challenge.toUserId);
    
    // Notify both players
    await this.networkService.sendGameResponse(gameId, userId, true);
    
    // Clean up challenge
    this.pendingChallenges.delete(challengeId);
    
    console.log(`[MatchmakingServiceImpl] Challenge ${challengeId} accepted, game ${gameId} created`);
    return true;
  }
  
  async rejectChallenge(challengeId: string, userId: string): Promise<boolean> {
    const challenge = this.pendingChallenges.get(challengeId);
    if (!challenge || challenge.toUserId !== userId) {
      return false;
    }
    
    challenge.accepted = false;
    
    // Notify challenger
    await this.networkService.sendGameResponse(challengeId, userId, false);
    
    // Clean up challenge
    this.pendingChallenges.delete(challengeId);
    
    console.log(`[MatchmakingServiceImpl] Challenge ${challengeId} rejected by ${userId}`);
    return true;
  }
  
  async joinMatchmaking(userId: string, preferences: MatchmakingPreferences): Promise<void> {
    // Remove from any existing queue entry
    this.matchmakingQueue.delete(userId);
    
    // Add to matchmaking queue
    const queueEntry: MatchmakingQueueEntry = {
      userId,
      preferences,
      joinTime: new Date(),
      lastActivity: new Date()
    };
    
    this.matchmakingQueue.set(userId, queueEntry);
    
    console.log(`[MatchmakingServiceImpl] User ${userId} joined matchmaking queue`);
    
    // Try to find a match immediately
    await this.tryMatchmaking();
  }
  
  async leaveMatchmaking(userId: string): Promise<void> {
    const wasInQueue = this.matchmakingQueue.delete(userId);
    if (wasInQueue) {
      console.log(`[MatchmakingServiceImpl] User ${userId} left matchmaking queue`);
    }
  }
  
  async createGame(player1Id: string, player2Id: string): Promise<string> {
    const gameId = `game_${Date.now()}_${uuidv4().substring(0, 8)}`;
    
    // Randomly assign colors
    const player1Color = Math.random() < 0.5 ? PlayerColor.WHITE : PlayerColor.BLACK;
    const player2Color = player1Color === PlayerColor.WHITE ? PlayerColor.BLACK : PlayerColor.WHITE;
    
    // Create active game entries for both players
    const player1Game: ActiveGame = {
      gameId,
      opponentId: player2Id,
      opponentNickname: await this.getUserNickname(player2Id),
      playerColor: player1Color,
      gameStartTime: new Date(),
      lastMoveTime: new Date(),
      isMyTurn: player1Color === PlayerColor.WHITE, // White goes first
      gameMode: 'multiplayer_active'
    };
    
    const player2Game: ActiveGame = {
      gameId,
      opponentId: player1Id,
      opponentNickname: await this.getUserNickname(player1Id),
      playerColor: player2Color,
      gameStartTime: new Date(),
      lastMoveTime: new Date(),
      isMyTurn: player2Color === PlayerColor.WHITE, // White goes first
      gameMode: 'multiplayer_active'
    };
    
    // Store game information
    this.activeGames.set(`${player1Id}_${gameId}`, player1Game);
    this.activeGames.set(`${player2Id}_${gameId}`, player2Game);
    
    // Add to game participants
    if (!this.gameParticipants.has(gameId)) {
      this.gameParticipants.set(gameId, new Set());
    }
    this.gameParticipants.get(gameId)!.add(player1Id);
    this.gameParticipants.get(gameId)!.add(player2Id);
    
    // Add to network service
    this.networkService.addGameParticipant(gameId, player1Id);
    this.networkService.addGameParticipant(gameId, player2Id);
    
    console.log(`[MatchmakingServiceImpl] Game ${gameId} created between ${player1Id} and ${player2Id}`);
    return gameId;
  }
  
  async endGame(gameId: string, reason: string): Promise<void> {
    const participants = this.gameParticipants.get(gameId);
    if (!participants) {
      console.warn(`[MatchmakingServiceImpl] Attempted to end non-existent game: ${gameId}`);
      return;
    }
    
    // Remove all participants from the game
    for (const userId of participants) {
      this.activeGames.delete(`${userId}_${gameId}`);
      this.networkService.removeGameParticipant(gameId, userId);
    }
    
    // Clean up game data
    this.gameParticipants.delete(gameId);
    
    console.log(`[MatchmakingServiceImpl] Game ${gameId} ended: ${reason}`);
  }
  
  async getPendingChallenges(userId: string): Promise<GameChallenge[]> {
    const challenges: GameChallenge[] = [];
    
    for (const challenge of this.pendingChallenges.values()) {
      if (challenge.toUserId === userId && challenge.accepted === undefined) {
        // Check if challenge has expired
        if (challenge.expiresAt > new Date()) {
          challenges.push(challenge);
        } else {
          // Remove expired challenge
          this.pendingChallenges.delete(challenge.id);
        }
      }
    }
    
    return challenges;
  }
  
  async getActiveGames(userId: string): Promise<ActiveGame[]> {
    const games: ActiveGame[] = [];
    
    for (const [key, game] of this.activeGames.entries()) {
      if (key.startsWith(`${userId}_`)) {
        games.push(game);
      }
    }
    
    return games;
  }
  
  async getUserNickname(userId: string): Promise<string> {
    return this.userNicknames.get(userId) || userId;
  }
  
  async setUserNickname(userId: string, nickname: string): Promise<void> {
    this.userNicknames.set(userId, nickname);
    this.networkService.setUserNickname(userId, nickname);
  }
  
  async getOnlineUsers(): Promise<string[]> {
    return Array.from(this.onlineUsers);
  }
  
  // Internal methods
  
  private async tryMatchmaking(): Promise<void> {
    const queue = Array.from(this.matchmakingQueue.entries());
    
    for (let i = 0; i < queue.length; i++) {
      for (let j = i + 1; j < queue.length; j++) {
        const entry1 = queue[i];
        const entry2 = queue[j];
        
        if (entry1 && entry2 && this.areCompatiblePreferences(entry1[1].preferences, entry2[1].preferences)) {
          // Create match
          const gameId = await this.createGame(entry1[0], entry2[0]);
          
          // Remove from queue
          this.matchmakingQueue.delete(entry1[0]);
          this.matchmakingQueue.delete(entry2[0]);
          
          // Notify both players
          await this.notifyMatchFound(entry1[0], entry2[0], gameId);
          break;
        }
      }
    }
  }
  
  private areCompatiblePreferences(prefs1: MatchmakingPreferences, prefs2: MatchmakingPreferences): boolean {
    // Simple compatibility check - can be enhanced with more sophisticated matching
    const timeControlMatch = !prefs1.timeControl || !prefs2.timeControl || prefs1.timeControl === prefs2.timeControl;
    const ratingMatch = !prefs1.ratingRange || !prefs2.ratingRange || 
                       (prefs1.ratingRange.min <= prefs2.ratingRange.max && prefs2.ratingRange.min <= prefs1.ratingRange.max);
    
    return timeControlMatch && ratingMatch;
  }
  
  private async notifyMatchFound(user1: string, user2: string, gameId: string): Promise<void> {
    // This would typically send notifications to both users
    // For now, we'll just log the match
    console.log(`[MatchmakingServiceImpl] Match found: ${user1} vs ${user2} in game ${gameId}`);
  }
  
  private setupPeriodicCleanup(): void {
    // Clean up expired challenges and inactive queue entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredChallenges();
      this.cleanupInactiveQueueEntries();
    }, 60 * 1000);
  }
  
  private cleanupExpiredChallenges(): void {
    const now = new Date();
    let cleanedCount = 0;
    
    for (const [challengeId, challenge] of this.pendingChallenges.entries()) {
      if (challenge.expiresAt < now) {
        this.pendingChallenges.delete(challengeId);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`[MatchmakingServiceImpl] Cleaned up ${cleanedCount} expired challenges`);
    }
  }
  
  private cleanupInactiveQueueEntries(): void {
    const now = new Date();
    const maxInactiveTime = 10 * 60 * 1000; // 10 minutes
    let cleanedCount = 0;
    
    for (const [userId, entry] of this.matchmakingQueue.entries()) {
      if (now.getTime() - entry.lastActivity.getTime() > maxInactiveTime) {
        this.matchmakingQueue.delete(userId);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`[MatchmakingServiceImpl] Cleaned up ${cleanedCount} inactive queue entries`);
    }
  }
  
  // Public utility methods
  
  public addOnlineUser(userId: string): void {
    this.onlineUsers.add(userId);
  }
  
  public removeOnlineUser(userId: string): void {
    this.onlineUsers.delete(userId);
    this.leaveMatchmaking(userId);
  }
  
  public getQueueSize(): number {
    return this.matchmakingQueue.size;
  }
  
  public getActiveGameCount(): number {
    return this.gameParticipants.size;
  }
  
  public getPendingChallengeCount(): number {
    return this.pendingChallenges.size;
  }
  
  // Cleanup method for tests and shutdown
  public stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    
    // Clear all data structures
    this.pendingChallenges.clear();
    this.matchmakingQueue.clear();
    this.activeGames.clear();
    this.gameParticipants.clear();
    this.userNicknames.clear();
    this.onlineUsers.clear();
    
    console.log('[MatchmakingServiceImpl] Service stopped');
  }
}
