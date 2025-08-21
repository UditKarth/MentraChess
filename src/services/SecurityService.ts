/**
 * SecurityService - Main security orchestration for AR Chess multiplayer
 * 
 * Handles:
 * - User authentication and authorization
 * - Session management and validation
 * - Security policy enforcement
 * - Integration with other security components
 */

import { AppSession } from '@mentra/sdk';
import { SessionState, PlayerColor, GameMove } from '../utils/types';

export interface UserCredentials {
  userId: string;
  username: string;
  email?: string;
  rating?: number;
  isVerified: boolean;
  permissions: string[];
}

export interface SecurityPolicy {
  maxGamesPerUser: number;
  maxMovesPerMinute: number;
  maxConcurrentConnections: number;
  requireAuthentication: boolean;
  allowAnonymousPlay: boolean;
  enableRateLimiting: boolean;
  enableAntiCheat: boolean;
}

export interface SecurityViolation {
  type: 'rate_limit' | 'anti_cheat' | 'authentication' | 'authorization' | 'abuse';
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId?: string;
  gameId?: string;
  description: string;
  timestamp: Date;
  action: 'warn' | 'timeout' | 'ban' | 'report';
}

export interface SecurityMetrics {
  totalViolations: number;
  violationsByType: Record<string, number>;
  activeBans: number;
  suspiciousUsers: number;
  lastViolationTime?: Date;
}

export class SecurityService {
  private session: AppSession;
  private authenticatedUsers: Map<string, UserCredentials> = new Map();
  private activeSessions: Map<string, { userId: string; lastActivity: Date }> = new Map();
  private violations: SecurityViolation[] = [];
  private policy: SecurityPolicy;
  private isEnabled: boolean = true;

  constructor(session: AppSession, policy?: Partial<SecurityPolicy>) {
    this.session = session;
    this.policy = {
      maxGamesPerUser: 5,
      maxMovesPerMinute: 60,
      maxConcurrentConnections: 3,
      requireAuthentication: true,
      allowAnonymousPlay: false,
      enableRateLimiting: true,
      enableAntiCheat: true,
      ...policy
    };
  }

  /**
   * Authenticate a user with credentials
   */
  async authenticateUser(credentials: { username: string; password?: string; token?: string }): Promise<UserCredentials | null> {
    if (!this.isEnabled) {
      return this.createAnonymousUser(credentials.username);
    }

    try {
      // In a real implementation, this would validate against a database
      const user: UserCredentials = {
        userId: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        username: credentials.username,
        email: `${credentials.username}@example.com`,
        rating: Math.floor(Math.random() * 2000) + 800,
        isVerified: true,
        permissions: ['play', 'challenge', 'spectate']
      };

      this.authenticatedUsers.set(user.userId, user);
      console.log(`🔐 User authenticated: ${user.username} (${user.userId})`);
      return user;
    } catch (error) {
      console.error('❌ Authentication failed:', error);
      return null;
    }
  }

  /**
   * Create an anonymous user for testing/demo purposes
   */
  private createAnonymousUser(username: string): UserCredentials {
    const user: UserCredentials = {
      userId: `anon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      username: `Anonymous_${username}`,
      isVerified: false,
      permissions: ['play']
    };
    
    this.authenticatedUsers.set(user.userId, user);
    return user;
  }

  /**
   * Validate user session and permissions
   */
  validateSession(userId: string, requiredPermissions: string[] = []): boolean {
    if (!this.isEnabled) return true;

    const user = this.authenticatedUsers.get(userId);
    if (!user) {
      this.recordViolation({
        type: 'authentication',
        severity: 'high',
        userId,
        description: 'Invalid user session',
        timestamp: new Date(),
        action: 'warn'
      });
      return false;
    }

    // Check if user has required permissions
    for (const permission of requiredPermissions) {
      if (!user.permissions.includes(permission)) {
        this.recordViolation({
          type: 'authorization',
          severity: 'medium',
          userId,
          description: `Missing permission: ${permission}`,
          timestamp: new Date(),
          action: 'warn'
        });
        return false;
      }
    }

    return true;
  }

  /**
   * Validate a chess move for legality and potential cheating
   */
  validateMove(userId: string, gameId: string, move: GameMove, gameState: SessionState): boolean {
    if (!this.isEnabled || !this.policy.enableAntiCheat) return true;

    // Basic move validation
    if (!this.isValidMove(move, gameState)) {
      this.recordViolation({
        type: 'anti_cheat',
        severity: 'high',
        userId,
        gameId,
        description: `Invalid move: ${move.algebraic}`,
        timestamp: new Date(),
        action: 'warn'
      });
      return false;
    }

    // Check for suspicious patterns (simplified for demo)
    if (this.isSuspiciousMove(move, gameState)) {
      this.recordViolation({
        type: 'anti_cheat',
        severity: 'medium',
        userId,
        gameId,
        description: `Suspicious move pattern detected: ${move.algebraic}`,
        timestamp: new Date(),
        action: 'timeout'
      });
      return false;
    }

    return true;
  }

  /**
   * Check if a move is legally valid
   */
  private isValidMove(move: GameMove, gameState: SessionState): boolean {
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
   * Check for suspicious move patterns
   */
  private isSuspiciousMove(move: GameMove, gameState: SessionState): boolean {
    // Simplified suspicious pattern detection
    // In a real implementation, this would analyze move patterns, timing, etc.
    
    // Check for extremely fast moves (less than 100ms)
    if (move.timestamp && Date.now() - move.timestamp.getTime() < 100) {
      return true;
    }

    // Check for repeated moves (simplified)
    const recentMoves = gameState.moveHistory?.slice(-5) || [];
    const repeatedMoves = recentMoves.filter(m => m.algebraic === move.algebraic);
    
    if (repeatedMoves.length > 2) {
      return true;
    }

    return false;
  }

  /**
   * Record a security violation
   */
  recordViolation(violation: SecurityViolation): void {
    this.violations.push(violation);
    
    console.log(`🚨 Security violation: ${violation.type} (${violation.severity}) - ${violation.description}`);
    
    // Take action based on violation
    switch (violation.action) {
      case 'warn':
        this.sendWarning(violation);
        break;
      case 'timeout':
        this.timeoutUser(violation.userId, 300); // 5 minutes
        break;
      case 'ban':
        this.banUser(violation.userId);
        break;
      case 'report':
        this.reportViolation(violation);
        break;
    }
  }

  /**
   * Send a warning to the user
   */
  private sendWarning(violation: SecurityViolation): void {
    if (violation.userId) {
      console.log(`⚠️ Warning sent to user ${violation.userId}: ${violation.description}`);
      // In a real implementation, this would send a message to the user
    }
  }

  /**
   * Timeout a user for a specified duration
   */
  private timeoutUser(userId: string | undefined, durationSeconds: number): void {
    if (!userId) return;
    
    console.log(`⏰ User ${userId} timed out for ${durationSeconds} seconds`);
    // In a real implementation, this would prevent the user from making moves
  }

  /**
   * Ban a user
   */
  private banUser(userId: string | undefined): void {
    if (!userId) return;
    
    console.log(`🚫 User ${userId} banned`);
    this.authenticatedUsers.delete(userId);
    // In a real implementation, this would add the user to a ban list
  }

  /**
   * Report a violation for review
   */
  private reportViolation(violation: SecurityViolation): void {
    console.log(`📋 Violation reported for review: ${violation.description}`);
    // In a real implementation, this would send to a moderation system
  }

  /**
   * Get security metrics
   */
  getSecurityMetrics(): SecurityMetrics {
    const violationsByType: Record<string, number> = {};
    
    this.violations.forEach(violation => {
      violationsByType[violation.type] = (violationsByType[violation.type] || 0) + 1;
    });

    return {
      totalViolations: this.violations.length,
      violationsByType,
      activeBans: 0, // Would be calculated from ban list
      suspiciousUsers: this.authenticatedUsers.size, // Simplified
      lastViolationTime: this.violations.length > 0 ? 
        this.violations[this.violations.length - 1]?.timestamp || new Date() : new Date()
    };
  }

  /**
   * Enable or disable security features
   */
  setSecurityEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    console.log(`🔒 Security ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Update security policy
   */
  updatePolicy(newPolicy: Partial<SecurityPolicy>): void {
    this.policy = { ...this.policy, ...newPolicy };
    console.log('🔒 Security policy updated');
  }

  /**
   * Get current security policy
   */
  getPolicy(): SecurityPolicy {
    return { ...this.policy };
  }

  /**
   * Clean up expired sessions and violations
   */
  cleanup(): void {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    // Remove old violations (keep last 24 hours)
    this.violations = this.violations.filter(v => 
      v.timestamp.getTime() > now.getTime() - 24 * 60 * 60 * 1000
    );
    
    console.log(`🧹 Security cleanup completed. ${this.violations.length} violations retained`);
  }
}
