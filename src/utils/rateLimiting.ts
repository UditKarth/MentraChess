/**
 * Rate Limiting Utility - Prevents abuse and ensures fair usage
 * 
 * Features:
 * - Per-user rate limiting
 * - Per-action rate limiting
 * - Sliding window implementation
 * - Configurable limits and windows
 * - Automatic cleanup of expired entries
 */

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (userId: string, action: string) => string;
}

export interface RateLimitInfo {
  userId: string;
  action: string;
  current: number;
  limit: number;
  remaining: number;
  resetTime: Date;
  isBlocked: boolean;
}

export interface RateLimitViolation {
  userId: string;
  action: string;
  current: number;
  limit: number;
  timestamp: Date;
  duration: number;
}

export class RateLimiter {
  private limits: Map<string, RateLimitConfig> = new Map();
  private requests: Map<string, number[]> = new Map();
  private violations: RateLimitViolation[] = [];
  private isEnabled: boolean = true;

  constructor() {
    // Set up default rate limits
    this.setLimit('move', { maxRequests: 60, windowMs: 60000 }); // 60 moves per minute
    this.setLimit('challenge', { maxRequests: 10, windowMs: 60000 }); // 10 challenges per minute
    this.setLimit('message', { maxRequests: 30, windowMs: 60000 }); // 30 messages per minute
    this.setLimit('login', { maxRequests: 5, windowMs: 300000 }); // 5 login attempts per 5 minutes
  }

  /**
   * Set a rate limit for a specific action
   */
  setLimit(action: string, config: RateLimitConfig): void {
    this.limits.set(action, config);
    console.log(`⏱️ Rate limit set for ${action}: ${config.maxRequests} requests per ${config.windowMs}ms`);
  }

  /**
   * Check if a request is allowed
   */
  isAllowed(userId: string, action: string): boolean {
    if (!this.isEnabled) return true;

    const config = this.limits.get(action);
    if (!config) return true;

    const key = this.generateKey(userId, action);
    const now = Date.now();
    const windowStart = now - config.windowMs;

    // Get existing requests for this user/action
    let requests = this.requests.get(key) || [];
    
    // Remove expired requests
    requests = requests.filter(timestamp => timestamp > windowStart);
    
    // Check if limit is exceeded
    if (requests.length >= config.maxRequests) {
      this.recordViolation(userId, action, requests.length, config.maxRequests, now);
      return false;
    }

    // Add current request
    requests.push(now);
    this.requests.set(key, requests);
    
    return true;
  }

  /**
   * Get rate limit information for a user/action
   */
  getRateLimitInfo(userId: string, action: string): RateLimitInfo | null {
    const config = this.limits.get(action);
    if (!config) return null;

    const key = this.generateKey(userId, action);
    const now = Date.now();
    const windowStart = now - config.windowMs;

    let requests = this.requests.get(key) || [];
    requests = requests.filter(timestamp => timestamp > windowStart);

    const current = requests.length;
    const remaining = Math.max(0, config.maxRequests - current);
    const resetTime = new Date(windowStart + config.windowMs);

    return {
      userId,
      action,
      current,
      limit: config.maxRequests,
      remaining,
      resetTime,
      isBlocked: current >= config.maxRequests
    };
  }

  /**
   * Reset rate limit for a user/action
   */
  reset(userId: string, action: string): void {
    const key = this.generateKey(userId, action);
    this.requests.delete(key);
    console.log(`🔄 Rate limit reset for ${userId} - ${action}`);
  }

  /**
   * Reset all rate limits for a user
   */
  resetUser(userId: string): void {
    const keysToDelete: string[] = [];
    
    this.requests.forEach((_, key) => {
      if (key.startsWith(`${userId}:`)) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => this.requests.delete(key));
    console.log(`🔄 All rate limits reset for user ${userId}`);
  }

  /**
   * Record a rate limit violation
   */
  private recordViolation(userId: string, action: string, current: number, limit: number, timestamp: number): void {
    const violation: RateLimitViolation = {
      userId,
      action,
      current,
      limit,
      timestamp: new Date(timestamp),
      duration: this.limits.get(action)?.windowMs || 60000
    };

    this.violations.push(violation);
    console.log(`🚨 Rate limit violation: ${userId} exceeded ${action} limit (${current}/${limit})`);
  }

  /**
   * Generate a unique key for rate limiting
   */
  private generateKey(userId: string, action: string): string {
    return `${userId}:${action}`;
  }

  /**
   * Get all rate limit violations
   */
  getViolations(): RateLimitViolation[] {
    return [...this.violations];
  }

  /**
   * Get violations for a specific user
   */
  getUserViolations(userId: string): RateLimitViolation[] {
    return this.violations.filter(v => v.userId === userId);
  }

  /**
   * Get violations for a specific action
   */
  getActionViolations(action: string): RateLimitViolation[] {
    return this.violations.filter(v => v.action === action);
  }

  /**
   * Get rate limiting statistics
   */
  getStats(): {
    totalViolations: number;
    violationsByAction: Record<string, number>;
    violationsByUser: Record<string, number>;
    activeLimits: number;
  } {
    const violationsByAction: Record<string, number> = {};
    const violationsByUser: Record<string, number> = {};

    this.violations.forEach(violation => {
      violationsByAction[violation.action] = (violationsByAction[violation.action] || 0) + 1;
      violationsByUser[violation.userId] = (violationsByUser[violation.userId] || 0) + 1;
    });

    return {
      totalViolations: this.violations.length,
      violationsByAction,
      violationsByUser,
      activeLimits: this.limits.size
    };
  }

  /**
   * Enable or disable rate limiting
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    console.log(`⏱️ Rate limiting ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Clean up expired data
   */
  cleanup(): void {
    const now = Date.now();
    let cleanedRequests = 0;
    let cleanedViolations = 0;

    // Clean up expired requests
    this.requests.forEach((requests, key) => {
      const action = key.split(':')[1];
      if (action) {
        const config = this.limits.get(action);
        if (config) {
          const windowStart = now - config.windowMs;
          const validRequests = requests.filter(timestamp => timestamp > windowStart);
          
          if (validRequests.length !== requests.length) {
            this.requests.set(key, validRequests);
            cleanedRequests += requests.length - validRequests.length;
          }
        }
      }
    });

    // Clean up old violations (keep last 24 hours)
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const originalViolationsCount = this.violations.length;
    this.violations = this.violations.filter(v => v.timestamp.getTime() > oneDayAgo);
    cleanedViolations = originalViolationsCount - this.violations.length;

    console.log(`🧹 Rate limiter cleanup: ${cleanedRequests} requests, ${cleanedViolations} violations removed`);
  }

  /**
   * Get all active rate limits
   */
  getActiveLimits(): Map<string, RateLimitConfig> {
    return new Map(this.limits);
  }

  /**
   * Check if a user is currently blocked for any action
   */
  isUserBlocked(userId: string): { blocked: boolean; actions: string[] } {
    const blockedActions: string[] = [];

    this.limits.forEach((_, action) => {
      const info = this.getRateLimitInfo(userId, action);
      if (info && info.isBlocked) {
        blockedActions.push(action);
      }
    });

    return {
      blocked: blockedActions.length > 0,
      actions: blockedActions
    };
  }

  /**
   * Get time until rate limit resets for a user/action
   */
  getTimeUntilReset(userId: string, action: string): number {
    const info = this.getRateLimitInfo(userId, action);
    if (!info) return 0;

    const now = Date.now();
    return Math.max(0, info.resetTime.getTime() - now);
  }
}

// Export a singleton instance for global use
export const rateLimiter = new RateLimiter();
