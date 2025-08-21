import { GameHistoryEntry, GameStateData } from './GamePersistenceService';
import { SessionState, PlayerColor } from '../utils/types';

export interface GameStatistics {
  totalGames: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  averageGameDuration: number;
  longestGame: number;
  shortestGame: number;
  mostPlayedOpponent: string;
  currentStreak: number;
  bestStreak: number;
}

export interface GameReplay {
  gameId: string;
  moves: Array<{
    moveNumber: number;
    player: PlayerColor;
    from: string;
    to: string;
    piece: string;
    algebraic: string;
    timestamp: Date;
    boardState: SessionState;
  }>;
  gameResult: string;
  gameDuration: number;
}

export interface OpponentStats {
  opponentId: string;
  opponentName: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  lastPlayed: Date;
}

export class GameHistoryService {
  private gameHistory: Map<string, GameHistoryEntry[]> = new Map();
  private gameStates: Map<string, GameStateData> = new Map();
  private userStats: Map<string, GameStatistics> = new Map();

  /**
   * Add game to history
   */
  addGameToHistory(gameData: GameStateData): void {
    try {
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

        const gameDuration = gameData.gameEndTime ? 
          Math.floor((gameData.gameEndTime.getTime() - gameData.gameStartTime.getTime()) / 1000) : 0;

        const historyEntry: GameHistoryEntry = {
          gameId: gameData.gameId,
          opponentId,
          opponentName,
          gameDate: gameData.gameStartTime,
          gameResult,
          playerColor: player.color,
          moveCount: gameData.moveHistory.length,
          gameDuration
        };

        this.gameHistory.get(player.id)!.push(historyEntry);
        
        // Update user statistics
        this.updateUserStats(player.id);
      }

      // Store game state for replay functionality
      this.gameStates.set(gameData.gameId, gameData);

      console.log(`[History] Added game ${gameData.gameId} to history for both players`);
    } catch (error) {
      console.error(`[History] Failed to add game to history:`, error);
    }
  }

  /**
   * Get game history for user
   */
  getGameHistory(userId: string, limit: number = 20, offset: number = 0): GameHistoryEntry[] {
    try {
      const history = this.gameHistory.get(userId) || [];
      return history.slice(offset, offset + limit);
    } catch (error) {
      console.error(`[History] Failed to get game history for user ${userId}:`, error);
      return [];
    }
  }

  /**
   * Get user statistics
   */
  getUserStats(userId: string): GameStatistics {
    try {
      // Check if we have cached stats
      if (this.userStats.has(userId)) {
        return this.userStats.get(userId)!;
      }

      const history = this.gameHistory.get(userId) || [];
      
      const totalGames = history.length;
      const wins = history.filter(h => h.gameResult === 'win').length;
      const losses = history.filter(h => h.gameResult === 'loss').length;
      const draws = history.filter(h => h.gameResult === 'draw').length;
      
      const winRate = totalGames > 0 ? (wins / totalGames) * 100 : 0;
      const averageGameDuration = history.length > 0 ? 
        history.reduce((sum, h) => sum + h.gameDuration, 0) / history.length : 0;

      const gameDurations = history.map(h => h.gameDuration).filter(d => d > 0);
      const longestGame = gameDurations.length > 0 ? Math.max(...gameDurations) : 0;
      const shortestGame = gameDurations.length > 0 ? Math.min(...gameDurations) : 0;

      // Find most played opponent
      const opponentCounts = new Map<string, number>();
      history.forEach(h => {
        const count = opponentCounts.get(h.opponentId) || 0;
        opponentCounts.set(h.opponentId, count + 1);
      });
      
      let mostPlayedOpponent = '';
      let maxGames = 0;
      for (const [opponentId, count] of opponentCounts.entries()) {
        if (count > maxGames) {
          maxGames = count;
          mostPlayedOpponent = this.getPlayerName(opponentId);
        }
      }

      // Calculate streaks
      const sortedHistory = [...history].sort((a, b) => a.gameDate.getTime() - b.gameDate.getTime());
      let currentStreak = 0;
      let bestStreak = 0;
      let tempStreak = 0;

      for (let i = sortedHistory.length - 1; i >= 0; i--) {
        const game = sortedHistory[i];
        if (game && game.gameResult === 'win') {
          tempStreak++;
          if (i === sortedHistory.length - 1) {
            currentStreak = tempStreak;
          }
        } else {
          if (tempStreak > bestStreak) {
            bestStreak = tempStreak;
          }
          tempStreak = 0;
        }
      }
      
      if (tempStreak > bestStreak) {
        bestStreak = tempStreak;
      }

      const stats: GameStatistics = {
        totalGames,
        wins,
        losses,
        draws,
        winRate: Math.round(winRate * 100) / 100,
        averageGameDuration: Math.round(averageGameDuration),
        longestGame,
        shortestGame,
        mostPlayedOpponent,
        currentStreak,
        bestStreak
      };

      // Cache the stats
      this.userStats.set(userId, stats);
      
      return stats;
    } catch (error) {
      console.error(`[History] Failed to get user stats for ${userId}:`, error);
      return {
        totalGames: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        winRate: 0,
        averageGameDuration: 0,
        longestGame: 0,
        shortestGame: 0,
        mostPlayedOpponent: '',
        currentStreak: 0,
        bestStreak: 0
      };
    }
  }

  /**
   * Get opponent statistics
   */
  getOpponentStats(userId: string): OpponentStats[] {
    try {
      const history = this.gameHistory.get(userId) || [];
      const opponentStats = new Map<string, OpponentStats>();

      history.forEach(game => {
        if (!opponentStats.has(game.opponentId)) {
          opponentStats.set(game.opponentId, {
            opponentId: game.opponentId,
            opponentName: game.opponentName,
            gamesPlayed: 0,
            wins: 0,
            losses: 0,
            draws: 0,
            winRate: 0,
            lastPlayed: game.gameDate
          });
        }

        const stats = opponentStats.get(game.opponentId)!;
        stats.gamesPlayed++;
        
        if (game.gameResult === 'win') {
          stats.wins++;
        } else if (game.gameResult === 'loss') {
          stats.losses++;
        } else {
          stats.draws++;
        }

        if (game.gameDate > stats.lastPlayed) {
          stats.lastPlayed = game.gameDate;
        }
      });

      // Calculate win rates
      for (const stats of opponentStats.values()) {
        stats.winRate = stats.gamesPlayed > 0 ? 
          Math.round((stats.wins / stats.gamesPlayed) * 100 * 100) / 100 : 0;
      }

      // Sort by most recent games
      return Array.from(opponentStats.values())
        .sort((a, b) => b.lastPlayed.getTime() - a.lastPlayed.getTime());
    } catch (error) {
      console.error(`[History] Failed to get opponent stats for ${userId}:`, error);
      return [];
    }
  }

  /**
   * Create game replay
   */
  createGameReplay(gameId: string): GameReplay | null {
    try {
      const gameData = this.gameStates.get(gameId);
      if (!gameData) {
        console.log(`[History] Game ${gameId} not found for replay`);
        return null;
      }

      const moves = gameData.moveHistory.map((move, index) => ({
        moveNumber: Math.floor(index / 2) + 1,
        player: index % 2 === 0 ? PlayerColor.WHITE : PlayerColor.BLACK,
        from: Array.isArray(move.from) ? `${move.from[0]},${move.from[1]}` : move.from,
        to: Array.isArray(move.to) ? `${move.to[0]},${move.to[1]}` : move.to,
        piece: move.piece,
        algebraic: move.algebraic || `${move.from}-${move.to}`,
        timestamp: new Date(gameData.gameStartTime.getTime() + (index * 30000)), // Estimate 30s per move
        boardState: gameData.currentState // This would need to be calculated for each move
      }));

      const gameDuration = gameData.gameEndTime ? 
        Math.floor((gameData.gameEndTime.getTime() - gameData.gameStartTime.getTime()) / 1000) : 0;

      const replay: GameReplay = {
        gameId,
        moves,
        gameResult: gameData.gameResult || 'unknown',
        gameDuration
      };

      console.log(`[History] Created replay for game ${gameId} with ${moves.length} moves`);
      return replay;
    } catch (error) {
      console.error(`[History] Failed to create replay for game ${gameId}:`, error);
      return null;
    }
  }

  /**
   * Get recent games
   */
  getRecentGames(userId: string, days: number = 7): GameHistoryEntry[] {
    try {
      const history = this.gameHistory.get(userId) || [];
      const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      
      return history
        .filter(game => game.gameDate >= cutoffDate)
        .sort((a, b) => b.gameDate.getTime() - a.gameDate.getTime());
    } catch (error) {
      console.error(`[History] Failed to get recent games for ${userId}:`, error);
      return [];
    }
  }

  /**
   * Get games by result
   */
  getGamesByResult(userId: string, result: 'win' | 'loss' | 'draw'): GameHistoryEntry[] {
    try {
      const history = this.gameHistory.get(userId) || [];
      return history
        .filter(game => game.gameResult === result)
        .sort((a, b) => b.gameDate.getTime() - a.gameDate.getTime());
    } catch (error) {
      console.error(`[History] Failed to get games by result for ${userId}:`, error);
      return [];
    }
  }

  /**
   * Get games against specific opponent
   */
  getGamesAgainstOpponent(userId: string, opponentId: string): GameHistoryEntry[] {
    try {
      const history = this.gameHistory.get(userId) || [];
      return history
        .filter(game => game.opponentId === opponentId)
        .sort((a, b) => b.gameDate.getTime() - a.gameDate.getTime());
    } catch (error) {
      console.error(`[History] Failed to get games against opponent for ${userId}:`, error);
      return [];
    }
  }

  /**
   * Export game history
   */
  exportGameHistory(userId: string): string {
    try {
      const history = this.gameHistory.get(userId) || [];
      const stats = this.getUserStats(userId);
      const opponents = this.getOpponentStats(userId);

      const exportData = {
        userId,
        exportDate: new Date().toISOString(),
        statistics: stats,
        opponents,
        games: history.map(game => ({
          gameId: game.gameId,
          opponentId: game.opponentId,
          opponentName: game.opponentName,
          gameDate: game.gameDate.toISOString(),
          gameResult: game.gameResult,
          playerColor: game.playerColor,
          moveCount: game.moveCount,
          gameDuration: game.gameDuration
        }))
      };

      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      console.error(`[History] Failed to export game history for ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Import game history
   */
  importGameHistory(userId: string, importData: string): void {
    try {
      const data = JSON.parse(importData);
      
      if (!data.games || !Array.isArray(data.games)) {
        throw new Error('Invalid game history data');
      }

      const importedHistory: GameHistoryEntry[] = data.games.map((game: any) => ({
        gameId: game.gameId,
        opponentId: game.opponentId,
        opponentName: game.opponentName,
        gameDate: new Date(game.gameDate),
        gameResult: game.gameResult,
        playerColor: game.playerColor,
        moveCount: game.moveCount,
        gameDuration: game.gameDuration
      }));

      // Merge with existing history
      const existingHistory = this.gameHistory.get(userId) || [];
      const mergedHistory = [...existingHistory, ...importedHistory];
      
      // Remove duplicates based on gameId
      const uniqueHistory = mergedHistory.filter((game, index, self) => 
        index === self.findIndex(g => g.gameId === game.gameId)
      );

      this.gameHistory.set(userId, uniqueHistory);
      
      // Clear cached stats to force recalculation
      this.userStats.delete(userId);
      
      console.log(`[History] Successfully imported ${importedHistory.length} games for user ${userId}`);
    } catch (error) {
      console.error(`[History] Failed to import game history for ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Update user statistics
   */
  private updateUserStats(userId: string): void {
    // Clear cached stats to force recalculation
    this.userStats.delete(userId);
  }

  /**
   * Get player name (placeholder implementation)
   */
  private getPlayerName(userId: string): string {
    // This would typically come from a user service
    return `Player ${userId.substring(0, 8)}`;
  }

  /**
   * Clean up old history entries
   */
  cleanupOldHistory(maxAgeDays: number = 365): number {
    try {
      const cutoffDate = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
      let cleanedCount = 0;

      for (const [userId, history] of this.gameHistory.entries()) {
        const originalLength = history.length;
        const filteredHistory = history.filter(game => game.gameDate >= cutoffDate);
        
        if (filteredHistory.length < originalLength) {
          this.gameHistory.set(userId, filteredHistory);
          cleanedCount += originalLength - filteredHistory.length;
          
          // Clear cached stats
          this.userStats.delete(userId);
        }
      }

      console.log(`[History] Cleaned up ${cleanedCount} old history entries`);
      return cleanedCount;
    } catch (error) {
      console.error(`[History] Failed to cleanup old history:`, error);
      return 0;
    }
  }
}
