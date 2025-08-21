import { AppSession } from '@mentra/sdk';

export interface MatchmakingStatusData {
  status: 'idle' | 'searching' | 'waiting_response' | 'connected' | 'error';
  searchTime: number;
  estimatedWaitTime?: number;
  queuePosition?: number;
  totalPlayersInQueue?: number;
  preferences: {
    timeControl?: 'blitz' | 'rapid' | 'classical';
    ratingRange?: { min: number; max: number };
    allowUnrated?: boolean;
  };
  errorMessage?: string;
}

export class MatchmakingStatus {
  private appSession: AppSession;
  private sessionId: string;
  private userId: string;
  private searchStartTime: number | undefined = undefined;
  private statusCallbacks: Array<(status: MatchmakingStatusData) => void> = [];

  constructor(appSession: AppSession, sessionId: string, userId: string) {
    this.appSession = appSession;
    this.sessionId = sessionId;
    this.userId = userId;
  }

  /**
   * Start matchmaking search
   */
  startSearching(preferences: MatchmakingStatusData['preferences']): void {
    this.searchStartTime = Date.now();
    const statusData: MatchmakingStatusData = {
      status: 'searching',
      searchTime: 0,
      preferences
    };
    
    this.updateDisplay(statusData);
    this.notifyCallbacks(statusData);
  }

  /**
   * Update search status
   */
  updateSearchStatus(queuePosition?: number, totalPlayersInQueue?: number, estimatedWaitTime?: number): void {
    if (!this.searchStartTime) return;

    const searchTime = Math.floor((Date.now() - this.searchStartTime) / 1000);
    const statusData: MatchmakingStatusData = {
      status: 'searching',
      searchTime,
      queuePosition: queuePosition || undefined,
      totalPlayersInQueue: totalPlayersInQueue || undefined,
      estimatedWaitTime: estimatedWaitTime || undefined,
      preferences: {} // This would be maintained from the start
    };

    this.updateDisplay(statusData);
    this.notifyCallbacks(statusData);
  }

  /**
   * Set waiting for response status
   */
  setWaitingForResponse(opponentName: string): void {
    const statusData: MatchmakingStatusData = {
      status: 'waiting_response',
      searchTime: 0,
      preferences: {}
    };

    this.updateDisplay(statusData, opponentName);
    this.notifyCallbacks(statusData);
  }

  /**
   * Set connected status
   */
  setConnected(opponentName: string): void {
    const statusData: MatchmakingStatusData = {
      status: 'connected',
      searchTime: 0,
      preferences: {}
    };

    this.updateDisplay(statusData, opponentName);
    this.notifyCallbacks(statusData);
  }

  /**
   * Set error status
   */
  setError(errorMessage: string): void {
    const statusData: MatchmakingStatusData = {
      status: 'error',
      searchTime: 0,
      errorMessage,
      preferences: {}
    };

    this.updateDisplay(statusData);
    this.notifyCallbacks(statusData);
  }

  /**
   * Reset to idle status
   */
  resetToIdle(): void {
    this.searchStartTime = undefined;
    const statusData: MatchmakingStatusData = {
      status: 'idle',
      searchTime: 0,
      preferences: {}
    };

    this.updateDisplay(statusData);
    this.notifyCallbacks(statusData);
  }

  /**
   * Update the display on AR glasses
   */
  private updateDisplay(statusData: MatchmakingStatusData, opponentName?: string): void {
    const mainContent = this.createMainContent(statusData);
    const expandedContent = this.createExpandedContent(statusData, opponentName);

    this.appSession.dashboard.content.writeToMain(mainContent);
    this.appSession.dashboard.content.writeToExpanded(expandedContent);
  }

  /**
   * Create main content for matchmaking status
   */
  private createMainContent(statusData: MatchmakingStatusData): string {
    switch (statusData.status) {
      case 'searching':
        return '🔍 Searching...';
      case 'waiting_response':
        return '⏳ Waiting...';
      case 'connected':
        return '✅ Connected';
      case 'error':
        return '❌ Error';
      default:
        return '♟️ Chess';
    }
  }

  /**
   * Create expanded content for matchmaking status
   */
  private createExpandedContent(statusData: MatchmakingStatusData, opponentName?: string): string {
    let content = '';

    switch (statusData.status) {
      case 'searching':
        content += 'Searching for opponent...\n\n';
        content += `Search time: ${this.formatTime(statusData.searchTime)}\n`;
        
        if (statusData.queuePosition && statusData.totalPlayersInQueue) {
          content += `Position: ${statusData.queuePosition}/${statusData.totalPlayersInQueue}\n`;
        }
        
        if (statusData.estimatedWaitTime) {
          content += `Estimated wait: ${this.formatTime(statusData.estimatedWaitTime)}\n`;
        }
        
        content += '\nPreferences:\n';
        if (statusData.preferences.timeControl) {
          content += `• Time: ${statusData.preferences.timeControl}\n`;
        }
        if (statusData.preferences.ratingRange) {
          content += `• Rating: ${statusData.preferences.ratingRange.min}-${statusData.preferences.ratingRange.max}\n`;
        }
        if (statusData.preferences.allowUnrated) {
          content += '• Allow unrated players\n';
        }
        
        content += '\nSay "cancel" to stop searching.';
        break;

      case 'waiting_response':
        content += `Waiting for ${opponentName || 'opponent'} to respond...\n\n`;
        content += 'Challenge sent successfully.\n';
        content += 'Say "cancel" to withdraw challenge.';
        break;

      case 'connected':
        content += `Connected to ${opponentName || 'opponent'}!\n\n`;
        content += 'Game is ready to begin.\n';
        content += 'Starting game...';
        break;

      case 'error':
        content += 'Matchmaking Error\n\n';
        content += statusData.errorMessage || 'An error occurred during matchmaking.\n';
        content += 'Please try again.';
        break;

      default:
        content += 'Ready for matchmaking\n\n';
        content += 'Say "find match" to search for an opponent.\n';
        content += 'Say "play [friend]" to challenge a friend.';
        break;
    }

    return content;
  }

  /**
   * Format time in MM:SS format
   */
  private formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  /**
   * Show match found notification
   */
  showMatchFound(opponentName: string, opponentRating?: number): void {
    const content = '🎯 Match Found!';
    let expandedContent = `Opponent: ${opponentName}\n`;
    
    if (opponentRating) {
      expandedContent += `Rating: ${opponentRating}\n`;
    }
    
    expandedContent += '\nStarting game...';

    this.appSession.dashboard.content.writeToMain(content);
    this.appSession.dashboard.content.writeToExpanded(expandedContent);
  }

  /**
   * Show matchmaking cancelled
   */
  showMatchmakingCancelled(): void {
    const content = '🚫 Cancelled';
    const expandedContent = 'Matchmaking cancelled.\n\nReady for new search.';

    this.appSession.dashboard.content.writeToMain(content);
    this.appSession.dashboard.content.writeToExpanded(expandedContent);
  }

  /**
   * Show connection lost
   */
  showConnectionLost(): void {
    const content = '🔌 Disconnected';
    const expandedContent = 'Connection to opponent lost.\n\nAttempting to reconnect...';

    this.appSession.dashboard.content.writeToMain(content);
    this.appSession.dashboard.content.writeToExpanded(expandedContent);
  }

  /**
   * Show reconnection successful
   */
  showReconnectionSuccessful(): void {
    const content = '🔗 Reconnected';
    const expandedContent = 'Connection restored!\n\nGame can continue.';

    this.appSession.dashboard.content.writeToMain(content);
    this.appSession.dashboard.content.writeToExpanded(expandedContent);
  }

  /**
   * Show queue position update
   */
  showQueueUpdate(position: number, total: number): void {
    const content = `🔍 #${position}`;
    const expandedContent = `Queue position: ${position}/${total}\n\nPlease wait...`;

    this.appSession.dashboard.content.writeToMain(content);
    this.appSession.dashboard.content.writeToExpanded(expandedContent);
  }

  /**
   * Register callback for status updates
   */
  onStatusUpdate(callback: (status: MatchmakingStatusData) => void): void {
    this.statusCallbacks.push(callback);
  }

  /**
   * Remove callback
   */
  removeCallback(callback: (status: MatchmakingStatusData) => void): void {
    const index = this.statusCallbacks.indexOf(callback);
    if (index > -1) {
      this.statusCallbacks.splice(index, 1);
    }
  }

  /**
   * Notify all callbacks
   */
  private notifyCallbacks(statusData: MatchmakingStatusData): void {
    this.statusCallbacks.forEach(callback => {
      try {
        callback(statusData);
      } catch (error) {
        console.error('Error in matchmaking status callback:', error);
      }
    });
  }

  /**
   * Get current search time
   */
  getCurrentSearchTime(): number {
    if (!this.searchStartTime) return 0;
    return Math.floor((Date.now() - this.searchStartTime) / 1000);
  }

  /**
   * Check if currently searching
   */
  isSearching(): boolean {
    return this.searchStartTime !== undefined;
  }

  /**
   * Clean up status
   */
  cleanup(): void {
    this.searchStartTime = undefined;
    this.statusCallbacks = [];
  }
}
