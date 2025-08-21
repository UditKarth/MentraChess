import { SessionState, MultiplayerSessionState, GameMove, PlayerColor } from '../utils/types';

export interface GameStateData {
  gameId: string;
  player1Id: string;
  player2Id: string;
  currentState: SessionState;
  moveHistory: GameMove[];
  gameStartTime: Date;
  lastMoveTime: Date;
  gameEndTime?: Date;
  gameResult?: 'white_win' | 'black_win' | 'draw' | 'resignation' | undefined;
  winner?: string | undefined;
}

export interface GameRecoveryData {
  gameId: string;
  opponentId: string;
  playerColor: PlayerColor;
  gameState: SessionState;
  lastMove?: GameMove | undefined;
  canResume: boolean;
}

export interface GameHistoryEntry {
  gameId: string;
  opponentId: string;
  opponentName: string;
  gameDate: Date;
  gameResult: 'win' | 'loss' | 'draw';
  playerColor: PlayerColor;
  moveCount: number;
  gameDuration: number;
}

export class GamePersistenceService {
  private gameStates: Map<string, GameStateData> = new Map();
  private userGames: Map<string, Set<string>> = new Map(); // userId -> Set<gameId>
  private gameHistory: Map<string, GameHistoryEntry[]> = new Map(); // userId -> GameHistoryEntry[]

  /**
   * Save game state
   */
  async saveGameState(gameData: GameStateData): Promise<void> {
    try {
      // Store game state
      this.gameStates.set(gameData.gameId, gameData);
      
      // Update user game associations
      this.associateUserWithGame(gameData.player1Id, gameData.gameId);
      this.associateUserWithGame(gameData.player2Id, gameData.gameId);
      
      console.log(`[Persistence] Saved game state for game ${gameData.gameId}`);
    } catch (error) {
      console.error(`[Persistence] Failed to save game state for game ${gameData.gameId}:`, error);
      throw error;
    }
  }

  /**
   * Load game state
   */
  async loadGameState(gameId: string): Promise<GameStateData | null> {
    try {
      const gameData = this.gameStates.get(gameId);
      if (gameData) {
        console.log(`[Persistence] Loaded game state for game ${gameId}`);
        return gameData;
      }
      return null;
    } catch (error) {
      console.error(`[Persistence] Failed to load game state for game ${gameId}:`, error);
      return null;
    }
  }

  /**
   * Update game state
   */
  async updateGameState(gameId: string, newState: SessionState, lastMove?: GameMove): Promise<void> {
    try {
      const gameData = this.gameStates.get(gameId);
      if (gameData) {
        gameData.currentState = newState;
        gameData.lastMoveTime = new Date();
        
        if (lastMove) {
          gameData.moveHistory.push(lastMove);
        }
        
        console.log(`[Persistence] Updated game state for game ${gameId}`);
      }
    } catch (error) {
      console.error(`[Persistence] Failed to update game state for game ${gameId}:`, error);
      throw error;
    }
  }

  /**
   * End game and save result
   */
  async endGame(gameId: string, result: 'white_win' | 'black_win' | 'draw' | 'resignation', winner?: string): Promise<void> {
    try {
      const gameData = this.gameStates.get(gameId);
      if (gameData) {
        gameData.gameEndTime = new Date();
        gameData.gameResult = result;
        gameData.winner = winner;
        
        // Create history entry
        await this.createGameHistoryEntry(gameData);
        
        console.log(`[Persistence] Ended game ${gameId} with result: ${result}`);
      }
    } catch (error) {
      console.error(`[Persistence] Failed to end game ${gameId}:`, error);
      throw error;
    }
  }

  /**
   * Get games for user that can be recovered
   */
  async getRecoverableGames(userId: string): Promise<GameRecoveryData[]> {
    try {
      const userGameIds = this.userGames.get(userId) || new Set();
      const recoverableGames: GameRecoveryData[] = [];

      for (const gameId of Array.from(userGameIds)) {
        const gameData = this.gameStates.get(gameId);
        if (gameData && !gameData.gameEndTime) {
          // Check if game is recent enough to recover (within last 24 hours)
          const hoursSinceLastMove = (Date.now() - gameData.lastMoveTime.getTime()) / (1000 * 60 * 60);
          if (hoursSinceLastMove < 24) {
            const isPlayer1 = gameData.player1Id === userId;
            const opponentId = isPlayer1 ? gameData.player2Id : gameData.player1Id;
            const playerColor = isPlayer1 ? PlayerColor.WHITE : PlayerColor.BLACK;

            recoverableGames.push({
              gameId,
              opponentId,
              playerColor,
              gameState: gameData.currentState,
              lastMove: gameData.moveHistory[gameData.moveHistory.length - 1],
              canResume: true
            });
          }
        }
      }

      console.log(`[Persistence] Found ${recoverableGames.length} recoverable games for user ${userId}`);
      return recoverableGames;
    } catch (error) {
      console.error(`[Persistence] Failed to get recoverable games for user ${userId}:`, error);
      return [];
    }
  }

  /**
   * Recover game for user
   */
  async recoverGame(userId: string, gameId: string): Promise<GameRecoveryData | null> {
    try {
      const gameData = this.gameStates.get(gameId);
      if (!gameData) {
        console.log(`[Persistence] Game ${gameId} not found for recovery`);
        return null;
      }

      // Verify user is part of this game
      if (gameData.player1Id !== userId && gameData.player2Id !== userId) {
        console.log(`[Persistence] User ${userId} is not part of game ${gameId}`);
        return null;
      }

      // Check if game is still active
      if (gameData.gameEndTime) {
        console.log(`[Persistence] Game ${gameId} has already ended`);
        return null;
      }

      const isPlayer1 = gameData.player1Id === userId;
      const opponentId = isPlayer1 ? gameData.player2Id : gameData.player1Id;
      const playerColor = isPlayer1 ? PlayerColor.WHITE : PlayerColor.BLACK;

      const recoveryData: GameRecoveryData = {
        gameId,
        opponentId,
        playerColor,
        gameState: gameData.currentState,
        lastMove: gameData.moveHistory[gameData.moveHistory.length - 1],
        canResume: true
      };

      console.log(`[Persistence] Successfully recovered game ${gameId} for user ${userId}`);
      return recoveryData;
    } catch (error) {
      console.error(`[Persistence] Failed to recover game ${gameId} for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Get game history for user
   */
  async getGameHistory(userId: string, limit: number = 20): Promise<GameHistoryEntry[]> {
    try {
      const history = this.gameHistory.get(userId) || [];
      return history.slice(0, limit);
    } catch (error) {
      console.error(`[Persistence] Failed to get game history for user ${userId}:`, error);
      return [];
    }
  }

  /**
   * Export game data
   */
  async exportGameData(gameId: string): Promise<string> {
    try {
      const gameData = this.gameStates.get(gameId);
      if (!gameData) {
        throw new Error(`Game ${gameId} not found`);
      }

      const exportData = {
        gameId: gameData.gameId,
        player1Id: gameData.player1Id,
        player2Id: gameData.player2Id,
        gameStartTime: gameData.gameStartTime.toISOString(),
        gameEndTime: gameData.gameEndTime?.toISOString(),
        gameResult: gameData.gameResult,
        winner: gameData.winner,
        moveHistory: gameData.moveHistory,
        finalState: gameData.currentState
      };

      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      console.error(`[Persistence] Failed to export game data for game ${gameId}:`, error);
      throw error;
    }
  }

  /**
   * Import game data
   */
  async importGameData(importData: string): Promise<string> {
    try {
      const gameData = JSON.parse(importData);
      
      // Validate required fields
      if (!gameData.gameId || !gameData.player1Id || !gameData.player2Id) {
        throw new Error('Invalid game data: missing required fields');
      }

      // Create new game ID to avoid conflicts
      const newGameId = `${gameData.gameId}_imported_${Date.now()}`;
      
      const importedGameData: GameStateData = {
        gameId: newGameId,
        player1Id: gameData.player1Id,
        player2Id: gameData.player2Id,
        currentState: gameData.finalState,
        moveHistory: gameData.moveHistory || [],
        gameStartTime: new Date(gameData.gameStartTime),
        lastMoveTime: new Date(gameData.gameStartTime),
        gameEndTime: gameData.gameEndTime ? new Date(gameData.gameEndTime) : new Date(),
        gameResult: gameData.gameResult,
        winner: gameData.winner
      };

      await this.saveGameState(importedGameData);
      
      console.log(`[Persistence] Successfully imported game data as ${newGameId}`);
      return newGameId;
    } catch (error) {
      console.error(`[Persistence] Failed to import game data:`, error);
      throw error;
    }
  }

  /**
   * Clean up old games
   */
  async cleanupOldGames(maxAgeDays: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
      let cleanedCount = 0;

      for (const [gameId, gameData] of Array.from(this.gameStates.entries())) {
        const lastActivity = gameData.gameEndTime || gameData.lastMoveTime;
        if (lastActivity < cutoffDate) {
          this.gameStates.delete(gameId);
          this.removeGameFromUsers(gameId);
          cleanedCount++;
        }
      }

      console.log(`[Persistence] Cleaned up ${cleanedCount} old games`);
      return cleanedCount;
    } catch (error) {
      console.error(`[Persistence] Failed to cleanup old games:`, error);
      return 0;
    }
  }

  /**
   * Associate user with game
   */
  private associateUserWithGame(userId: string, gameId: string): void {
    if (!this.userGames.has(userId)) {
      this.userGames.set(userId, new Set());
    }
    this.userGames.get(userId)!.add(gameId);
  }

  /**
   * Remove game from all users
   */
  private removeGameFromUsers(gameId: string): void {
    for (const [userId, gameIds] of Array.from(this.userGames.entries())) {
      gameIds.delete(gameId);
      if (gameIds.size === 0) {
        this.userGames.delete(userId);
      }
    }
  }

  /**
   * Create game history entry
   */
  private async createGameHistoryEntry(gameData: GameStateData): Promise<void> {
    try {
      const gameDuration = gameData.gameEndTime ? 
        gameData.gameEndTime.getTime() - gameData.gameStartTime.getTime() : 0;

      // Create history entries for both players
      const players = [
        { id: gameData.player1Id, color: PlayerColor.WHITE },
        { id: gameData.player2Id, color: PlayerColor.BLACK }
      ];

      for (const player of players) {
        if (!this.gameHistory.has(player.id)) {
          this.gameHistory.set(player.id, []);
        }

        const opponentId = player.id === gameData.player1Id ? gameData.player2Id : gameData.player1Id;
        const opponentName = this.getPlayerName(opponentId);
        
        let gameResult: 'win' | 'loss' | 'draw';
        if (gameData.gameResult === 'draw') {
          gameResult = 'draw';
        } else if (gameData.winner === player.id) {
          gameResult = 'win';
        } else {
          gameResult = 'loss';
        }

        const historyEntry: GameHistoryEntry = {
          gameId: gameData.gameId,
          opponentId,
          opponentName,
          gameDate: gameData.gameStartTime,
          gameResult,
          playerColor: player.color,
          moveCount: gameData.moveHistory.length,
          gameDuration: Math.floor(gameDuration / 1000) // Convert to seconds
        };

        this.gameHistory.get(player.id)!.push(historyEntry);
      }
    } catch (error) {
      console.error(`[Persistence] Failed to create game history entry:`, error);
    }
  }

  /**
   * Get player name (placeholder implementation)
   */
  private getPlayerName(userId: string): string {
    // This would typically come from a user service
    return `Player ${userId.substring(0, 8)}`;
  }

  /**
   * Get statistics for user
   */
  async getUserStats(userId: string): Promise<{
    totalGames: number;
    wins: number;
    losses: number;
    draws: number;
    winRate: number;
    averageGameDuration: number;
  }> {
    try {
      const history = this.gameHistory.get(userId) || [];
      
      const totalGames = history.length;
      const wins = history.filter(h => h.gameResult === 'win').length;
      const losses = history.filter(h => h.gameResult === 'loss').length;
      const draws = history.filter(h => h.gameResult === 'draw').length;
      
      const winRate = totalGames > 0 ? (wins / totalGames) * 100 : 0;
      const averageGameDuration = history.length > 0 ? 
        history.reduce((sum, h) => sum + h.gameDuration, 0) / history.length : 0;

      return {
        totalGames,
        wins,
        losses,
        draws,
        winRate: Math.round(winRate * 100) / 100,
        averageGameDuration: Math.round(averageGameDuration)
      };
    } catch (error) {
      console.error(`[Persistence] Failed to get user stats for ${userId}:`, error);
      return {
        totalGames: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        winRate: 0,
        averageGameDuration: 0
      };
    }
  }
}
