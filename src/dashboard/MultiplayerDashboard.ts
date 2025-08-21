import { AppSession } from '@mentra/sdk';
import { SessionState, PlayerColor, MultiplayerSessionState } from '../utils/types';

export interface DashboardData {
  gameStatus: string;
  opponentInfo: {
    name: string;
    rating?: number;
    connectionStatus: 'online' | 'offline' | 'disconnected';
  };
  gameStats: {
    moveCount: number;
    timeElapsed: number;
    isMyTurn: boolean;
  };
  challenges: {
    incoming: Array<{
      id: string;
      fromUserId: string;
      fromNickname: string;
      timestamp: Date;
    }>;
    outgoing: Array<{
      id: string;
      toUserId: string;
      toNickname: string;
      timestamp: Date;
    }>;
  };
  matchmakingStatus: 'idle' | 'searching' | 'waiting_response' | 'connected' | 'challenging' | 'in_game';
}

export class MultiplayerDashboard {
  private appSession: AppSession;
  private sessionId: string;
  private userId: string;
  private updateCallbacks: Array<(data: DashboardData) => void> = [];

  constructor(appSession: AppSession, sessionId: string, userId: string) {
    this.appSession = appSession;
    this.sessionId = sessionId;
    this.userId = userId;
  }

  /**
   * Update dashboard with current game state
   */
  updateDashboard(state: MultiplayerSessionState): void {
    const dashboardData = this.createDashboardData(state);
    
    // Update dashboard content
    this.updateDashboardContent(dashboardData);
    
    // Notify callbacks
    this.updateCallbacks.forEach(callback => callback(dashboardData));
  }

  /**
   * Create dashboard data from session state
   */
  private createDashboardData(state: MultiplayerSessionState): DashboardData {
    const isMyTurn = state.currentPlayer === state.playerColor;
    const opponentId = state.opponentId || '';
    const opponentNickname = this.getOpponentNickname(opponentId);

    return {
      gameStatus: this.getGameStatus(state, isMyTurn),
      opponentInfo: {
        name: opponentNickname,
        rating: this.getOpponentRating(opponentId) || undefined,
        connectionStatus: this.getConnectionStatus(state)
      },
      gameStats: {
        moveCount: state.fullmoveNumber || 0,
        timeElapsed: this.getTimeElapsed(state),
        isMyTurn
      },
      challenges: {
        incoming: this.getIncomingChallenges(state),
        outgoing: this.getOutgoingChallenges(state)
      },
      matchmakingStatus: state.matchmakingStatus || 'idle'
    };
  }

  /**
   * Update dashboard content on the AR glasses
   */
  private updateDashboardContent(data: DashboardData): void {
    const mainContent = this.createMainContent(data);
    const expandedContent = this.createExpandedContent(data);

    this.appSession.dashboard.content.writeToMain(mainContent);
    this.appSession.dashboard.content.writeToExpanded(expandedContent);
  }

  /**
   * Create main dashboard content (compact view)
   */
  private createMainContent(data: DashboardData): string {
    switch (data.matchmakingStatus) {
      case 'searching':
        return '🔍 Searching...';
      case 'waiting_response':
        return '⏳ Waiting...';
      case 'connected':
        return data.gameStats.isMyTurn ? '♟️ Your Turn' : '⏸️ Opponent\'s Turn';
      default:
        return '♟️ Chess';
    }
  }

  /**
   * Create expanded dashboard content (detailed view)
   */
  private createExpandedContent(data: DashboardData): string {
    let content = '';

    // Game status
    content += `${data.gameStatus}\n\n`;

    // Opponent information
    if (data.opponentInfo.name) {
      content += `Opponent: ${data.opponentInfo.name}\n`;
      if (data.opponentInfo.rating) {
        content += `Rating: ${data.opponentInfo.rating}\n`;
      }
      content += `Status: ${this.formatConnectionStatus(data.opponentInfo.connectionStatus)}\n\n`;
    }

    // Game statistics
    content += `Moves: ${data.gameStats.moveCount}\n`;
    content += `Time: ${this.formatTime(data.gameStats.timeElapsed)}\n\n`;

    // Turn indicator
    if (data.matchmakingStatus === 'connected') {
      content += data.gameStats.isMyTurn ? 'Your turn to move!' : 'Waiting for opponent...\n';
    }

    // Challenge notifications
    if (data.challenges.incoming.length > 0) {
      content += `\nIncoming Challenges: ${data.challenges.incoming.length}\n`;
      data.challenges.incoming.forEach(challenge => {
        content += `• ${challenge.fromNickname}\n`;
      });
    }

    if (data.challenges.outgoing.length > 0) {
      content += `\nOutgoing Challenges: ${data.challenges.outgoing.length}\n`;
      data.challenges.outgoing.forEach(challenge => {
        content += `• ${challenge.toNickname}\n`;
      });
    }

    // Matchmaking status
    if (data.matchmakingStatus === 'searching') {
      content += '\nSearching for opponent...\nSay "cancel" to stop searching';
    } else if (data.matchmakingStatus === 'waiting_response') {
      content += '\nWaiting for opponent to respond...\nSay "cancel" to cancel challenge';
    }

    return content;
  }

  /**
   * Get game status text
   */
  private getGameStatus(state: MultiplayerSessionState, isMyTurn: boolean): string {
    switch (state.multiplayerGameMode) {
      case 'multiplayer_active':
        if (state.isCheck) {
          return isMyTurn ? 'CHECK - Your Turn!' : 'CHECK - Opponent\'s Turn';
        }
        return isMyTurn ? 'Your Turn' : 'Opponent\'s Turn';
      case 'multiplayer_waiting':
        return 'Waiting for opponent...';
      case 'multiplayer_ended':
        return 'Game Ended';
      default:
        return 'Ready to Play';
    }
  }

  /**
   * Get opponent nickname
   */
  private getOpponentNickname(opponentId: string): string {
    // This would typically come from a user service
    // For now, return a placeholder
    return opponentId ? `Player ${opponentId.substring(0, 8)}` : '';
  }

  /**
   * Get opponent rating
   */
  private getOpponentRating(opponentId: string): number | undefined {
    // This would typically come from a rating service
    // For now, return undefined
    return undefined;
  }

  /**
   * Get connection status
   */
  private getConnectionStatus(state: MultiplayerSessionState): 'online' | 'offline' | 'disconnected' {
    if (!state.isConnected) return 'disconnected';
    // Additional logic could check last heartbeat time
    return 'online';
  }

  /**
   * Get time elapsed in seconds
   */
  private getTimeElapsed(state: MultiplayerSessionState): number {
    if (!state.gameStartTime) return 0;
    return Math.floor((Date.now() - state.gameStartTime.getTime()) / 1000);
  }

  /**
   * Get incoming challenges
   */
  private getIncomingChallenges(state: MultiplayerSessionState): Array<{
    id: string;
    fromUserId: string;
    fromNickname: string;
    timestamp: Date;
  }> {
    return state.pendingChallenges
      .filter(challenge => challenge.toUserId === this.userId && challenge.accepted === undefined)
      .map(challenge => ({
        id: challenge.id,
        fromUserId: challenge.fromUserId,
        fromNickname: challenge.fromNickname,
        timestamp: challenge.timestamp
      }));
  }

  /**
   * Get outgoing challenges
   */
  private getOutgoingChallenges(state: MultiplayerSessionState): Array<{
    id: string;
    toUserId: string;
    toNickname: string;
    timestamp: Date;
  }> {
    return state.pendingChallenges
      .filter(challenge => challenge.fromUserId === this.userId && challenge.accepted === undefined)
      .map(challenge => ({
        id: challenge.id,
        toUserId: challenge.toUserId,
        toNickname: this.getOpponentNickname(challenge.toUserId),
        timestamp: challenge.timestamp
      }));
  }

  /**
   * Format connection status for display
   */
  private formatConnectionStatus(status: 'online' | 'offline' | 'disconnected'): string {
    switch (status) {
      case 'online': return '🟢 Online';
      case 'offline': return '🔴 Offline';
      case 'disconnected': return '⚫ Disconnected';
    }
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
   * Register callback for dashboard updates
   */
  onUpdate(callback: (data: DashboardData) => void): void {
    this.updateCallbacks.push(callback);
  }

  /**
   * Remove callback
   */
  removeCallback(callback: (data: DashboardData) => void): void {
    const index = this.updateCallbacks.indexOf(callback);
    if (index > -1) {
      this.updateCallbacks.splice(index, 1);
    }
  }

  /**
   * Clean up dashboard
   */
  cleanup(): void {
    this.updateCallbacks = [];
  }
}
