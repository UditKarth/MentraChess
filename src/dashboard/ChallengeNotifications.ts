import { AppSession } from '@mentra/sdk';
import { GameChallenge } from '../utils/types';

export interface ChallengeNotification {
  id: string;
  type: 'incoming' | 'outgoing';
  fromUserId: string;
  fromNickname: string;
  toUserId: string;
  toNickname: string;
  timestamp: Date;
  expiresAt: Date;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
}

export class ChallengeNotifications {
  private appSession: AppSession;
  private sessionId: string;
  private userId: string;
  private activeNotifications: Map<string, ChallengeNotification> = new Map();
  private notificationCallbacks: Array<(notifications: ChallengeNotification[]) => void> = [];
  private timeoutHandles: Map<string, NodeJS.Timeout> = new Map();

  constructor(appSession: AppSession, sessionId: string, userId: string) {
    this.appSession = appSession;
    this.sessionId = sessionId;
    this.userId = userId;
  }

  /**
   * Add a new challenge notification
   */
  addChallenge(challenge: GameChallenge): void {
    const notification: ChallengeNotification = {
      id: challenge.id,
      type: challenge.fromUserId === this.userId ? 'outgoing' : 'incoming',
      fromUserId: challenge.fromUserId,
      fromNickname: challenge.fromNickname,
      toUserId: challenge.toUserId,
      toNickname: this.getNicknameForUser(challenge.toUserId),
      timestamp: challenge.timestamp,
      expiresAt: challenge.expiresAt,
      status: challenge.accepted === undefined ? 'pending' : 
              challenge.accepted ? 'accepted' : 'rejected'
    };

    this.activeNotifications.set(challenge.id, notification);
    this.updateDisplay();
    this.notifyCallbacks();
  }

  /**
   * Update challenge status
   */
  updateChallengeStatus(challengeId: string, status: 'accepted' | 'rejected' | 'expired'): void {
    const notification = this.activeNotifications.get(challengeId);
    if (notification) {
      notification.status = status;
      this.updateDisplay();
      this.notifyCallbacks();
    }
  }

  /**
   * Remove challenge notification
   */
  removeChallenge(challengeId: string): void {
    // Clear any pending timeout
    const timeoutHandle = this.timeoutHandles.get(challengeId);
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      this.timeoutHandles.delete(challengeId);
    }
    
    this.activeNotifications.delete(challengeId);
    this.updateDisplay();
    this.notifyCallbacks();
  }

  /**
   * Clean up all timeouts and notifications
   */
  cleanup(): void {
    // Clear all pending timeouts
    for (const [challengeId, timeoutHandle] of this.timeoutHandles) {
      clearTimeout(timeoutHandle);
    }
    this.timeoutHandles.clear();
    this.activeNotifications.clear();
  }

  /**
   * Get all active notifications
   */
  getActiveNotifications(): ChallengeNotification[] {
    return Array.from(this.activeNotifications.values());
  }

  /**
   * Get incoming challenges
   */
  getIncomingChallenges(): ChallengeNotification[] {
    return this.getActiveNotifications().filter(n => n.type === 'incoming' && n.status === 'pending');
  }

  /**
   * Get outgoing challenges
   */
  getOutgoingChallenges(): ChallengeNotification[] {
    return this.getActiveNotifications().filter(n => n.type === 'outgoing' && n.status === 'pending');
  }

  /**
   * Update the display on AR glasses
   */
  private updateDisplay(): void {
    const incomingChallenges = this.getIncomingChallenges();
    const outgoingChallenges = this.getOutgoingChallenges();

    if (incomingChallenges.length === 0 && outgoingChallenges.length === 0) {
      // No active challenges - clear display
      this.clearDisplay();
      return;
    }

    const mainContent = this.createMainContent(incomingChallenges, outgoingChallenges);
    const expandedContent = this.createExpandedContent(incomingChallenges, outgoingChallenges);

    this.appSession.dashboard.content.writeToMain(mainContent);
    this.appSession.dashboard.content.writeToExpanded(expandedContent);
  }

  /**
   * Create main content for challenge notifications
   */
  private createMainContent(incoming: ChallengeNotification[], outgoing: ChallengeNotification[]): string {
    if (incoming.length > 0) {
      return `📨 ${incoming.length} Challenge${incoming.length > 1 ? 's' : ''}`;
    }
    
    if (outgoing.length > 0) {
      return `📤 ${outgoing.length} Pending`;
    }
    
    return '♟️ Chess';
  }

  /**
   * Create expanded content for challenge notifications
   */
  private createExpandedContent(incoming: ChallengeNotification[], outgoing: ChallengeNotification[]): string {
    let content = '';

    // Incoming challenges
    if (incoming.length > 0) {
      content += `Incoming Challenges (${incoming.length}):\n\n`;
      incoming.forEach((challenge, index) => {
        const timeLeft = this.getTimeLeft(challenge.expiresAt);
        content += `${index + 1}. ${challenge.fromNickname}\n`;
        content += `   Expires: ${timeLeft}\n\n`;
      });
      content += 'Say "accept [number]" or "reject [number]" to respond.\n';
    }

    // Outgoing challenges
    if (outgoing.length > 0) {
      if (content) content += '\n';
      content += `Outgoing Challenges (${outgoing.length}):\n\n`;
      outgoing.forEach((challenge, index) => {
        const timeLeft = this.getTimeLeft(challenge.expiresAt);
        content += `${index + 1}. ${challenge.toNickname}\n`;
        content += `   Expires: ${timeLeft}\n\n`;
      });
      content += 'Say "cancel [number]" to cancel challenge.\n';
    }

    return content;
  }

  /**
   * Clear the display
   */
  private clearDisplay(): void {
    // Don't clear the main display - let other components handle it
    // Just clear the expanded content if it was showing challenges
  }

  /**
   * Show challenge acceptance
   */
  showChallengeAccepted(challengeId: string): void {
    const notification = this.activeNotifications.get(challengeId);
    if (notification) {
      const content = '✅ Challenge Accepted!';
      const expandedContent = `Challenge from ${notification.fromNickname} accepted.\n\nStarting game...`;
      
      this.appSession.dashboard.content.writeToMain(content);
      this.appSession.dashboard.content.writeToExpanded(expandedContent);
      
      // Remove the notification after a delay
      const timeoutHandle = setTimeout(() => {
        this.removeChallenge(challengeId);
        this.timeoutHandles.delete(challengeId);
      }, 3000);
      this.timeoutHandles.set(challengeId, timeoutHandle);
    }
  }

  /**
   * Show challenge rejection
   */
  showChallengeRejected(challengeId: string): void {
    const notification = this.activeNotifications.get(challengeId);
    if (notification) {
      const content = '❌ Challenge Rejected';
      const expandedContent = `Challenge from ${notification.fromNickname} rejected.`;
      
      this.appSession.dashboard.content.writeToMain(content);
      this.appSession.dashboard.content.writeToExpanded(expandedContent);
      
      // Remove the notification after a delay
      const timeoutHandle = setTimeout(() => {
        this.removeChallenge(challengeId);
        this.timeoutHandles.delete(challengeId);
      }, 3000);
      this.timeoutHandles.set(challengeId, timeoutHandle);
    }
  }

  /**
   * Show challenge expiration
   */
  showChallengeExpired(challengeId: string): void {
    const notification = this.activeNotifications.get(challengeId);
    if (notification) {
      const content = '⏰ Challenge Expired';
      const expandedContent = `Challenge ${notification.type === 'incoming' ? 'from' : 'to'} ${notification.type === 'incoming' ? notification.fromNickname : notification.toNickname} has expired.`;
      
      this.appSession.dashboard.content.writeToMain(content);
      this.appSession.dashboard.content.writeToExpanded(expandedContent);
      
      // Remove the notification after a delay
      const timeoutHandle = setTimeout(() => {
        this.removeChallenge(challengeId);
        this.timeoutHandles.delete(challengeId);
      }, 3000);
      this.timeoutHandles.set(challengeId, timeoutHandle);
    }
  }

  /**
   * Show challenge cancellation
   */
  showChallengeCancelled(challengeId: string): void {
    const notification = this.activeNotifications.get(challengeId);
    if (notification) {
      const content = '🚫 Challenge Cancelled';
      const expandedContent = `Challenge ${notification.type === 'incoming' ? 'from' : 'to'} ${notification.type === 'incoming' ? notification.fromNickname : notification.toNickname} was cancelled.`;
      
      this.appSession.dashboard.content.writeToMain(content);
      this.appSession.dashboard.content.writeToExpanded(expandedContent);
      
      // Remove the notification after a delay
      const timeoutHandle = setTimeout(() => {
        this.removeChallenge(challengeId);
        this.timeoutHandles.delete(challengeId);
      }, 3000);
      this.timeoutHandles.set(challengeId, timeoutHandle);
    }
  }

  /**
   * Get time left until expiration
   */
  private getTimeLeft(expiresAt: Date): string {
    const now = new Date();
    const timeLeft = expiresAt.getTime() - now.getTime();
    
    if (timeLeft <= 0) {
      return 'Expired';
    }
    
    const minutes = Math.floor(timeLeft / (1000 * 60));
    const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
    
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Get nickname for user ID
   */
  private getNicknameForUser(userId: string): string {
    // This would typically come from a user service
    // For now, return a placeholder
    return `Player ${userId.substring(0, 8)}`;
  }

  /**
   * Register callback for notification updates
   */
  onNotificationUpdate(callback: (notifications: ChallengeNotification[]) => void): void {
    this.notificationCallbacks.push(callback);
  }

  /**
   * Remove callback
   */
  removeCallback(callback: (notifications: ChallengeNotification[]) => void): void {
    const index = this.notificationCallbacks.indexOf(callback);
    if (index > -1) {
      this.notificationCallbacks.splice(index, 1);
    }
  }

  /**
   * Notify all callbacks
   */
  private notifyCallbacks(): void {
    const notifications = this.getActiveNotifications();
    this.notificationCallbacks.forEach(callback => {
      try {
        callback(notifications);
      } catch (error) {
        console.error('Error in challenge notification callback:', error);
      }
    });
  }

  /**
   * Clean up notifications
   */
  cleanup(): void {
    this.activeNotifications.clear();
    this.notificationCallbacks = [];
  }

  /**
   * Check for expired challenges and clean them up
   */
  checkExpiredChallenges(): void {
    const now = new Date();
    const expiredChallenges: string[] = [];

    this.activeNotifications.forEach((notification, challengeId) => {
      if (notification.expiresAt < now && notification.status === 'pending') {
        expiredChallenges.push(challengeId);
        this.showChallengeExpired(challengeId);
      }
    });

    expiredChallenges.forEach(challengeId => {
      this.updateChallengeStatus(challengeId, 'expired');
    });
  }

  /**
   * Start periodic cleanup of expired challenges
   */
  startPeriodicCleanup(): void {
    // Check for expired challenges every 30 seconds
    setInterval(() => {
      this.checkExpiredChallenges();
    }, 30000);
  }
}
