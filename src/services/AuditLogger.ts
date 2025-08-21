/**
 * AuditLogger - Comprehensive logging and monitoring for security events
 * 
 * Features:
 * - Security event logging
 * - User action tracking
 * - System activity monitoring
 * - Compliance reporting
 * - Real-time alerting
 */

export interface AuditEvent {
  id: string;
  timestamp: Date;
  userId?: string;
  action: string;
  resource: string;
  details: Record<string, any>;
  severity: 'info' | 'warning' | 'error' | 'critical';
  source: 'user' | 'system' | 'security' | 'performance';
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  gameId?: string;
}

export interface AuditFilter {
  startDate?: Date;
  endDate?: Date;
  userId?: string;
  action?: string;
  severity?: string[];
  source?: string[];
  gameId?: string;
}

export interface AuditMetrics {
  totalEvents: number;
  eventsBySeverity: Record<string, number>;
  eventsBySource: Record<string, number>;
  eventsByAction: Record<string, number>;
  recentEvents: number; // Last hour
  criticalEvents: number;
}

export interface AuditAlert {
  id: string;
  timestamp: Date;
  type: 'security' | 'performance' | 'system';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  details: Record<string, any>;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
}

export class AuditLogger {
  private events: AuditEvent[] = [];
  private alerts: AuditAlert[] = [];
  private isEnabled: boolean = true;
  private maxEvents: number = 10000; // Keep last 10k events
  private alertThresholds: Map<string, number> = new Map();

  constructor() {
    // Set up default alert thresholds
    this.alertThresholds.set('security_violation', 5); // Alert after 5 security violations
    this.alertThresholds.set('rate_limit_exceeded', 10); // Alert after 10 rate limit violations
    this.alertThresholds.set('failed_login', 3); // Alert after 3 failed logins
  }

  /**
   * Log an audit event
   */
  log(event: Omit<AuditEvent, 'id' | 'timestamp'>): void {
    if (!this.isEnabled) return;

    const auditEvent: AuditEvent = {
      ...event,
      id: this.generateEventId(),
      timestamp: new Date()
    };

    this.events.push(auditEvent);

    // Maintain event limit
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    // Check for alerts
    this.checkForAlerts(auditEvent);

    // Log to console for development
    console.log(`📋 [${auditEvent.severity.toUpperCase()}] ${auditEvent.action}: ${auditEvent.details.message || 'No message'}`);
  }

  /**
   * Log a security event
   */
  logSecurityEvent(userId: string, action: string, details: Record<string, any>, severity: 'warning' | 'error' | 'critical' = 'warning'): void {
    this.log({
      userId,
      action,
      resource: 'security',
      details,
      severity,
      source: 'security'
    });
  }

  /**
   * Log a user action
   */
  logUserAction(userId: string, action: string, resource: string, details: Record<string, any> = {}): void {
    this.log({
      userId,
      action,
      resource,
      details,
      severity: 'info',
      source: 'user'
    });
  }

  /**
   * Log a system event
   */
  logSystemEvent(action: string, resource: string, details: Record<string, any>, severity: 'info' | 'warning' | 'error' = 'info'): void {
    this.log({
      action,
      resource,
      details,
      severity,
      source: 'system'
    });
  }

  /**
   * Log a performance event
   */
  logPerformanceEvent(action: string, resource: string, details: Record<string, any>, severity: 'info' | 'warning' | 'error' = 'info'): void {
    this.log({
      action,
      resource,
      details,
      severity,
      source: 'performance'
    });
  }

  /**
   * Log a game-related event
   */
  logGameEvent(userId: string, gameId: string, action: string, details: Record<string, any> = {}): void {
    this.log({
      userId,
      action,
      resource: `game:${gameId}`,
      details,
      severity: 'info',
      source: 'user',
      gameId
    });
  }

  /**
   * Log a login attempt
   */
  logLoginAttempt(userId: string, success: boolean, details: Record<string, any> = {}): void {
    this.log({
      userId,
      action: success ? 'login_success' : 'login_failed',
      resource: 'authentication',
      details: {
        success,
        ...details
      },
      severity: success ? 'info' : 'warning',
      source: 'security'
    });
  }

  /**
   * Log a move validation
   */
  logMoveValidation(userId: string, gameId: string, move: any, isValid: boolean, details: Record<string, any> = {}): void {
    this.log({
      userId,
      action: isValid ? 'move_valid' : 'move_invalid',
      resource: `game:${gameId}`,
      details: {
        move,
        isValid,
        ...details
      },
      severity: isValid ? 'info' : 'warning',
      source: 'security',
      gameId
    });
  }

  /**
   * Query audit events with filters
   */
  queryEvents(filter: AuditFilter = {}): AuditEvent[] {
    let filteredEvents = [...this.events];

    if (filter.startDate) {
      filteredEvents = filteredEvents.filter(e => e.timestamp >= filter.startDate!);
    }

    if (filter.endDate) {
      filteredEvents = filteredEvents.filter(e => e.timestamp <= filter.endDate!);
    }

    if (filter.userId) {
      filteredEvents = filteredEvents.filter(e => e.userId === filter.userId);
    }

    if (filter.action) {
      filteredEvents = filteredEvents.filter(e => e.action === filter.action);
    }

    if (filter.severity && filter.severity.length > 0) {
      filteredEvents = filteredEvents.filter(e => filter.severity!.includes(e.severity));
    }

    if (filter.source && filter.source.length > 0) {
      filteredEvents = filteredEvents.filter(e => filter.source!.includes(e.source));
    }

    if (filter.gameId) {
      filteredEvents = filteredEvents.filter(e => e.gameId === filter.gameId);
    }

    return filteredEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Get recent events (last N minutes)
   */
  getRecentEvents(minutes: number = 60): AuditEvent[] {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    return this.events.filter(e => e.timestamp >= cutoff);
  }

  /**
   * Get events by severity
   */
  getEventsBySeverity(severity: string): AuditEvent[] {
    return this.events.filter(e => e.severity === severity);
  }

  /**
   * Get events by user
   */
  getUserEvents(userId: string): AuditEvent[] {
    return this.events.filter(e => e.userId === userId);
  }

  /**
   * Get events by game
   */
  getGameEvents(gameId: string): AuditEvent[] {
    return this.events.filter(e => e.gameId === gameId);
  }

  /**
   * Get audit metrics
   */
  getMetrics(): AuditMetrics {
    const eventsBySeverity: Record<string, number> = {};
    const eventsBySource: Record<string, number> = {};
    const eventsByAction: Record<string, number> = {};

    this.events.forEach(event => {
      eventsBySeverity[event.severity] = (eventsBySeverity[event.severity] || 0) + 1;
      eventsBySource[event.source] = (eventsBySource[event.source] || 0) + 1;
      eventsByAction[event.action] = (eventsByAction[event.action] || 0) + 1;
    });

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentEvents = this.events.filter(e => e.timestamp >= oneHourAgo).length;
    const criticalEvents = eventsBySeverity['critical'] || 0;

    return {
      totalEvents: this.events.length,
      eventsBySeverity,
      eventsBySource,
      eventsByAction,
      recentEvents,
      criticalEvents
    };
  }

  /**
   * Get all alerts
   */
  getAlerts(): AuditAlert[] {
    return [...this.alerts];
  }

  /**
   * Get unacknowledged alerts
   */
  getUnacknowledgedAlerts(): AuditAlert[] {
    return this.alerts.filter(a => !a.acknowledged);
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string, acknowledgedBy: string): void {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      alert.acknowledgedBy = acknowledgedBy;
      alert.acknowledgedAt = new Date();
      console.log(`✅ Alert ${alertId} acknowledged by ${acknowledgedBy}`);
    }
  }

  /**
   * Set alert threshold
   */
  setAlertThreshold(eventType: string, threshold: number): void {
    this.alertThresholds.set(eventType, threshold);
    console.log(`🔔 Alert threshold set for ${eventType}: ${threshold}`);
  }

  /**
   * Generate a unique event ID
   */
  private generateEventId(): string {
    return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Check for alerts based on event patterns
   */
  private checkForAlerts(event: AuditEvent): void {
    // Check for security violations
    if (event.source === 'security' && event.severity === 'critical') {
      const recentSecurityEvents = this.getRecentEvents(60).filter(e => 
        e.source === 'security' && e.severity === 'critical'
      );

      const threshold = this.alertThresholds.get('security_violation') || 5;
      if (recentSecurityEvents.length >= threshold) {
        this.createAlert('security', 'high', 
          `Multiple security violations detected (${recentSecurityEvents.length} in last hour)`,
          { eventCount: recentSecurityEvents.length, events: recentSecurityEvents }
        );
      }
    }

    // Check for rate limit violations
    if (event.action === 'rate_limit_exceeded') {
      const recentRateLimitEvents = this.getRecentEvents(60).filter(e => 
        e.action === 'rate_limit_exceeded'
      );

      const threshold = this.alertThresholds.get('rate_limit_exceeded') || 10;
      if (recentRateLimitEvents.length >= threshold) {
        this.createAlert('security', 'medium',
          `Multiple rate limit violations detected (${recentRateLimitEvents.length} in last hour)`,
          { eventCount: recentRateLimitEvents.length, events: recentRateLimitEvents }
        );
      }
    }

    // Check for failed logins
    if (event.action === 'login_failed') {
      const recentFailedLogins = this.getRecentEvents(60).filter(e => 
        e.action === 'login_failed' && e.userId === event.userId
      );

      const threshold = this.alertThresholds.get('failed_login') || 3;
      if (recentFailedLogins.length >= threshold) {
        this.createAlert('security', 'high',
          `Multiple failed login attempts for user ${event.userId} (${recentFailedLogins.length} in last hour)`,
          { userId: event.userId, eventCount: recentFailedLogins.length }
        );
      }
    }
  }

  /**
   * Create a new alert
   */
  private createAlert(type: string, severity: string, message: string, details: Record<string, any>): void {
    const alert: AuditAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      type: type as any,
      severity: severity as any,
      message,
      details,
      acknowledged: false
    };

    this.alerts.push(alert);
    console.log(`🚨 ALERT [${severity.toUpperCase()}] ${message}`);
  }

  /**
   * Enable or disable audit logging
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    console.log(`📋 Audit logging ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Clean up old events and alerts
   */
  cleanup(): void {
    const now = Date.now();
    const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);

    // Remove old events (keep last week)
    const originalEventCount = this.events.length;
    this.events = this.events.filter(e => e.timestamp >= oneWeekAgo);

    // Remove old alerts (keep last day)
    const originalAlertCount = this.alerts.length;
    this.alerts = this.alerts.filter(a => a.timestamp >= oneDayAgo);

    console.log(`🧹 Audit cleanup: ${originalEventCount - this.events.length} events, ${originalAlertCount - this.alerts.length} alerts removed`);
  }

  /**
   * Export audit data for compliance
   */
  exportAuditData(startDate: Date, endDate: Date): AuditEvent[] {
    return this.queryEvents({ startDate, endDate });
  }

  /**
   * Get audit summary for a time period
   */
  getAuditSummary(startDate: Date, endDate: Date): {
    totalEvents: number;
    eventsBySeverity: Record<string, number>;
    eventsBySource: Record<string, number>;
    criticalEvents: number;
    uniqueUsers: number;
  } {
    const events = this.queryEvents({ startDate, endDate });
    const eventsBySeverity: Record<string, number> = {};
    const eventsBySource: Record<string, number> = {};
    const uniqueUsers = new Set<string>();

    events.forEach(event => {
      eventsBySeverity[event.severity] = (eventsBySeverity[event.severity] || 0) + 1;
      eventsBySource[event.source] = (eventsBySource[event.source] || 0) + 1;
      if (event.userId) uniqueUsers.add(event.userId);
    });

    return {
      totalEvents: events.length,
      eventsBySeverity,
      eventsBySource,
      criticalEvents: eventsBySeverity['critical'] || 0,
      uniqueUsers: uniqueUsers.size
    };
  }
}

// Export a singleton instance for global use
export const auditLogger = new AuditLogger();
