/**
 * AntiCheatService - Advanced cheating detection and prevention
 * 
 * Handles:
 * - Move validation and legality checking
 * - Pattern analysis for suspicious behavior
 * - Engine assistance detection
 * - Timing analysis
 * - Statistical anomaly detection
 */

import { SessionState, PlayerColor, GameMove } from '../utils/types';

export interface MoveAnalysis {
  move: GameMove;
  isLegal: boolean;
  isSuspicious: boolean;
  confidence: number;
  reasons: string[];
  engineEvaluation?: number;
}

export interface PlayerProfile {
  userId: string;
  averageMoveTime: number;
  moveTimeVariance: number;
  accuracy: number;
  suspiciousMoves: number;
  totalMoves: number;
  lastMoveTime?: Date;
}

export interface CheatDetectionResult {
  isCheating: boolean;
  confidence: number;
  evidence: string[];
  recommendedAction: 'none' | 'warn' | 'timeout' | 'ban' | 'investigate';
}

export interface AntiCheatMetrics {
  totalMovesAnalyzed: number;
  suspiciousMovesDetected: number;
  falsePositives: number;
  accuracy: number;
  averageAnalysisTime: number;
}

export class AntiCheatService {
  private playerProfiles: Map<string, PlayerProfile> = new Map();
  private moveHistory: Map<string, GameMove[]> = new Map();
  private isEnabled: boolean = true;
  private sensitivity: number = 0.7; // 0.0 = very lenient, 1.0 = very strict

  constructor(sensitivity?: number) {
    if (sensitivity !== undefined) {
      this.sensitivity = Math.max(0.0, Math.min(1.0, sensitivity));
    }
  }

  /**
   * Analyze a move for potential cheating
   */
  analyzeMove(userId: string, gameId: string, move: GameMove, gameState: SessionState): MoveAnalysis {
    if (!this.isEnabled) {
      return {
        move,
        isLegal: true,
        isSuspicious: false,
        confidence: 1.0,
        reasons: ['Anti-cheat disabled']
      };
    }

    const startTime = Date.now();
    const reasons: string[] = [];
    let isLegal = true;
    let isSuspicious = false;
    let confidence = 1.0;

    // 1. Basic move legality check
    if (!this.isMoveLegal(move, gameState)) {
      isLegal = false;
      reasons.push('Illegal move');
      confidence = 0.0;
    }

    // 2. Timing analysis
    const timingAnalysis = this.analyzeMoveTiming(userId, move);
    if (timingAnalysis.isSuspicious) {
      isSuspicious = true;
      confidence *= 0.8;
      reasons.push(`Suspicious timing: ${timingAnalysis.reason}`);
    }

    // 3. Pattern analysis
    const patternAnalysis = this.analyzeMovePattern(userId, move, gameState);
    if (patternAnalysis.isSuspicious) {
      isSuspicious = true;
      confidence *= 0.9;
      reasons.push(`Suspicious pattern: ${patternAnalysis.reason}`);
    }

    // 4. Engine evaluation (simplified)
    const engineEvaluation = this.evaluateMoveStrength(move, gameState);
    if (engineEvaluation > 0.8) {
      reasons.push('Very strong move detected');
      confidence *= 0.95;
    }

    // Update player profile
    this.updatePlayerProfile(userId, move, confidence);

    // Store move in history
    this.addMoveToHistory(gameId, move);

    const analysisTime = Date.now() - startTime;
    console.log(`🔍 Move analysis completed in ${analysisTime}ms - Confidence: ${confidence.toFixed(2)}`);

    return {
      move,
      isLegal,
      isSuspicious,
      confidence,
      reasons,
      engineEvaluation
    };
  }

  /**
   * Check if a move is legally valid
   */
  private isMoveLegal(move: GameMove, gameState: SessionState): boolean {
    // Basic validation - in a real implementation, this would use a chess engine
    if (!move.from || !move.to || !move.algebraic) {
      return false;
    }

    // Check if coordinates are within board bounds
    const fromCoords = move.from;
    const toCoords = move.to;
    
    if (!fromCoords || !toCoords) return false;
    
    const [fromFile, fromRank] = fromCoords;
    const [toFile, toRank] = toCoords;
    
    if (fromFile < 0 || fromFile > 7 || fromRank < 0 || fromRank > 7 ||
        toFile < 0 || toFile > 7 || toRank < 0 || toRank > 7) {
      return false;
    }

    // Check if it's the player's turn
    const currentPlayer = gameState.currentPlayer;
    if (move.fromUserId && move.fromUserId !== currentPlayer) {
      return false;
    }

    return true;
  }

  /**
   * Parse chess coordinates (e.g., "e4" -> [4, 3])
   */
  private parseCoordinates(square: string): [number, number] | null {
    if (square.length !== 2) return null;
    
    const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
    const rank = parseInt(square[1] || '0') - 1;
    
    if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
    
    return [file, rank];
  }

  /**
   * Analyze move timing for suspicious patterns
   */
  private analyzeMoveTiming(userId: string, move: GameMove): { isSuspicious: boolean; reason: string } {
    const profile = this.playerProfiles.get(userId);
    if (!profile || !move.timestamp) {
      return { isSuspicious: false, reason: '' };
    }

    const now = Date.now();
    const moveTime = now - move.timestamp.getTime();

    // Check for extremely fast moves (less than 50ms)
    if (moveTime < 50) {
      return { isSuspicious: true, reason: 'Extremely fast move' };
    }

    // Check for consistent timing (suspicious if all moves take exactly the same time)
    if (profile.totalMoves > 10) {
      const timeVariance = Math.abs(moveTime - profile.averageMoveTime);
      if (timeVariance < 10 && profile.moveTimeVariance < 50) {
        return { isSuspicious: true, reason: 'Suspiciously consistent timing' };
      }
    }

    return { isSuspicious: false, reason: '' };
  }

  /**
   * Analyze move patterns for suspicious behavior
   */
  private analyzeMovePattern(userId: string, move: GameMove, gameState: SessionState): { isSuspicious: boolean; reason: string } {
    const gameMoves = this.moveHistory.get('') || [];
    const playerMoves = gameMoves.filter(m => m.fromUserId === userId);

    // Check for repeated moves
    const repeatedMoves = playerMoves.filter(m => m.algebraic === move.algebraic);
    if (repeatedMoves.length > 2) {
      return { isSuspicious: true, reason: 'Repeated move pattern' };
    }

    // Check for always playing the same opening
    if (playerMoves.length > 5) {
      const uniqueMoves = new Set(playerMoves.map(m => m.algebraic));
      if (uniqueMoves.size < playerMoves.length * 0.3) {
        return { isSuspicious: true, reason: 'Limited move variety' };
      }
    }

    return { isSuspicious: false, reason: '' };
  }

  /**
   * Evaluate move strength (simplified engine evaluation)
   */
  private evaluateMoveStrength(move: GameMove, gameState: SessionState): number {
    // Simplified evaluation - in a real implementation, this would use Stockfish or similar
    const strongMoves = ['e4', 'd4', 'Nf3', 'Nc3', 'Bc4', 'Bd3', 'O-O', 'O-O-O'];
    const weakMoves = ['a3', 'h3', 'a6', 'h6', 'Na3', 'Nh3'];
    
    if (strongMoves.includes(move.algebraic || '')) {
      return 0.8;
    } else if (weakMoves.includes(move.algebraic || '')) {
      return 0.2;
    }
    
    return 0.5; // Average move
  }

  /**
   * Update player profile with new move data
   */
  private updatePlayerProfile(userId: string, move: GameMove, confidence: number): void {
    let profile = this.playerProfiles.get(userId);
    
    if (!profile) {
      profile = {
        userId,
        averageMoveTime: 0,
        moveTimeVariance: 0,
        accuracy: 1.0,
        suspiciousMoves: 0,
        totalMoves: 0
      };
    }

    // Update timing statistics
    if (move.timestamp && profile.lastMoveTime) {
      const moveTime = move.timestamp.getTime() - profile.lastMoveTime.getTime();
      profile.averageMoveTime = (profile.averageMoveTime * profile.totalMoves + moveTime) / (profile.totalMoves + 1);
      
      // Simplified variance calculation
      const timeDiff = Math.abs(moveTime - profile.averageMoveTime);
      profile.moveTimeVariance = (profile.moveTimeVariance * profile.totalMoves + timeDiff) / (profile.totalMoves + 1);
    }

    // Update accuracy and suspicious moves
    profile.totalMoves++;
    if (confidence < this.sensitivity) {
      profile.suspiciousMoves++;
    }
    profile.accuracy = (profile.totalMoves - profile.suspiciousMoves) / profile.totalMoves;
    profile.lastMoveTime = move.timestamp || new Date();

    this.playerProfiles.set(userId, profile);
  }

  /**
   * Add move to game history
   */
  private addMoveToHistory(gameId: string, move: GameMove): void {
    const moves = this.moveHistory.get(gameId) || [];
    moves.push(move);
    this.moveHistory.set(gameId, moves);
  }

  /**
   * Detect cheating based on player behavior
   */
  detectCheating(userId: string): CheatDetectionResult {
    const profile = this.playerProfiles.get(userId);
    if (!profile || profile.totalMoves < 10) {
      return {
        isCheating: false,
        confidence: 0.0,
        evidence: ['Insufficient data'],
        recommendedAction: 'none'
      };
    }

    const evidence: string[] = [];
    let confidence = 0.0;

    // Check accuracy
    if (profile.accuracy < 0.7) {
      evidence.push(`Low accuracy: ${(profile.accuracy * 100).toFixed(1)}%`);
      confidence += 0.3;
    }

    // Check suspicious moves ratio
    const suspiciousRatio = profile.suspiciousMoves / profile.totalMoves;
    if (suspiciousRatio > 0.3) {
      evidence.push(`High suspicious moves: ${(suspiciousRatio * 100).toFixed(1)}%`);
      confidence += 0.4;
    }

    // Check timing consistency
    if (profile.moveTimeVariance < 100 && profile.totalMoves > 20) {
      evidence.push('Suspiciously consistent timing');
      confidence += 0.2;
    }

    // Determine recommended action
    let recommendedAction: CheatDetectionResult['recommendedAction'] = 'none';
    if (confidence > 0.8) {
      recommendedAction = 'ban';
    } else if (confidence > 0.6) {
      recommendedAction = 'timeout';
    } else if (confidence > 0.4) {
      recommendedAction = 'warn';
    } else if (confidence > 0.2) {
      recommendedAction = 'investigate';
    }

    return {
      isCheating: confidence > this.sensitivity,
      confidence,
      evidence,
      recommendedAction
    };
  }

  /**
   * Get anti-cheat metrics
   */
  getMetrics(): AntiCheatMetrics {
    let totalMoves = 0;
    let suspiciousMoves = 0;
    let totalAnalysisTime = 0;

    this.playerProfiles.forEach(profile => {
      totalMoves += profile.totalMoves;
      suspiciousMoves += profile.suspiciousMoves;
    });

    return {
      totalMovesAnalyzed: totalMoves,
      suspiciousMovesDetected: suspiciousMoves,
      falsePositives: Math.floor(suspiciousMoves * 0.1), // Estimate
      accuracy: totalMoves > 0 ? (totalMoves - suspiciousMoves) / totalMoves : 1.0,
      averageAnalysisTime: totalMoves > 0 ? totalAnalysisTime / totalMoves : 0
    };
  }

  /**
   * Get player profile
   */
  getPlayerProfile(userId: string): PlayerProfile | null {
    return this.playerProfiles.get(userId) || null;
  }

  /**
   * Enable or disable anti-cheat
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    console.log(`🛡️ Anti-cheat ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Set sensitivity level
   */
  setSensitivity(sensitivity: number): void {
    this.sensitivity = Math.max(0.0, Math.min(1.0, sensitivity));
    console.log(`🛡️ Anti-cheat sensitivity set to ${this.sensitivity.toFixed(2)}`);
  }

  /**
   * Clean up old data
   */
  cleanup(): void {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    // Clean up old move history
    this.moveHistory.forEach((moves, gameId) => {
      const recentMoves = moves.filter(move => 
        move.timestamp && move.timestamp.getTime() > oneDayAgo
      );
      if (recentMoves.length === 0) {
        this.moveHistory.delete(gameId);
      } else {
        this.moveHistory.set(gameId, recentMoves);
      }
    });

    console.log(`🧹 Anti-cheat cleanup completed. ${this.moveHistory.size} active games`);
  }
}
