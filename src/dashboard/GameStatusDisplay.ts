import { AppSession } from '@mentra/sdk';
import { SessionState, PlayerColor, MultiplayerSessionState } from '../utils/types';

export interface GameStatusData {
  currentPlayer: PlayerColor;
  isMyTurn: boolean;
  moveCount: number;
  gameTime: number;
  isCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  lastMove?: {
    from: string;
    to: string;
    piece: string;
    algebraic: string;
  } | undefined;
  capturedPieces: {
    white: string[];
    black: string[];
  };
}

export class GameStatusDisplay {
  private appSession: AppSession;
  private sessionId: string;
  private userId: string;

  constructor(appSession: AppSession, sessionId: string, userId: string) {
    this.appSession = appSession;
    this.sessionId = sessionId;
    this.userId = userId;
  }

  /**
   * Update game status display
   */
  updateGameStatus(state: MultiplayerSessionState): void {
    const statusData = this.createGameStatusData(state);
    this.displayGameStatus(statusData);
  }

  /**
   * Create game status data from session state
   */
  private createGameStatusData(state: MultiplayerSessionState): GameStatusData {
    const isMyTurn = state.currentPlayer === state.playerColor;
    
    return {
      currentPlayer: state.currentPlayer,
      isMyTurn,
      moveCount: state.fullmoveNumber || 0,
      gameTime: this.getGameTime(state),
      isCheck: state.isCheck || false,
      isCheckmate: state.isCheckmate || false,
      isStalemate: state.isStalemate || false,
      lastMove: state.lastOpponentMove ? {
        from: Array.isArray(state.lastOpponentMove.from) ? `${state.lastOpponentMove.from[0]},${state.lastOpponentMove.from[1]}` : state.lastOpponentMove.from,
        to: Array.isArray(state.lastOpponentMove.to) ? `${state.lastOpponentMove.to[0]},${state.lastOpponentMove.to[1]}` : state.lastOpponentMove.to,
        piece: String(state.lastOpponentMove.piece),
        algebraic: state.lastOpponentMove.algebraic || `${state.lastOpponentMove.from}-${state.lastOpponentMove.to}`
      } : undefined,
      capturedPieces: {
        white: state.capturedByWhite || [],
        black: state.capturedByBlack || []
      }
    };
  }

  /**
   * Display game status on AR glasses
   */
  private displayGameStatus(data: GameStatusData): void {
    const mainContent = this.createMainStatusContent(data);
    const expandedContent = this.createExpandedStatusContent(data);

    this.appSession.dashboard.content.writeToMain(mainContent);
    this.appSession.dashboard.content.writeToExpanded(expandedContent);
  }

  /**
   * Create main status content (compact view)
   */
  private createMainStatusContent(data: GameStatusData): string {
    if (data.isCheckmate) {
      return '🏁 Checkmate!';
    }
    
    if (data.isStalemate) {
      return '🤝 Stalemate';
    }
    
    if (data.isCheck) {
      return data.isMyTurn ? '⚠️ Check - Your Turn!' : '⚠️ Check - Opponent\'s Turn';
    }
    
    return data.isMyTurn ? '♟️ Your Turn' : '⏸️ Opponent\'s Turn';
  }

  /**
   * Create expanded status content (detailed view)
   */
  private createExpandedStatusContent(data: GameStatusData): string {
    let content = '';

    // Game status
    if (data.isCheckmate) {
      content += 'CHECKMATE!\n';
      content += data.currentPlayer === PlayerColor.WHITE ? 'Black wins!' : 'White wins!';
    } else if (data.isStalemate) {
      content += 'STALEMATE!\n';
      content += 'The game is a draw.';
    } else if (data.isCheck) {
      content += 'CHECK!\n';
      content += data.isMyTurn ? 'You must move out of check.' : 'Opponent is in check.';
    } else {
      content += data.isMyTurn ? 'Your turn to move.' : 'Waiting for opponent...';
    }

    content += '\n\n';

    // Turn information
    const currentPlayerText = data.currentPlayer === PlayerColor.WHITE ? 'White' : 'Black';
    content += `Current Player: ${currentPlayerText}\n`;
    content += `Move: ${data.moveCount}\n`;
    content += `Time: ${this.formatTime(data.gameTime)}\n\n`;

    // Last move
    if (data.lastMove) {
      content += `Last Move: ${data.lastMove.algebraic}\n`;
      content += `(${data.lastMove.piece} ${data.lastMove.from} → ${data.lastMove.to})\n\n`;
    }

    // Captured pieces
    const userColor = this.getUserColor();
    const userCaptured = userColor === PlayerColor.WHITE ? data.capturedPieces.white : data.capturedPieces.black;
    const opponentCaptured = userColor === PlayerColor.WHITE ? data.capturedPieces.black : data.capturedPieces.white;

    if (userCaptured.length > 0 || opponentCaptured.length > 0) {
      content += 'Captured Pieces:\n';
      content += `You: ${userCaptured.join(' ') || 'None'}\n`;
      content += `Opponent: ${opponentCaptured.join(' ') || 'None'}\n\n`;
    }

    // Game state indicators
    if (data.isCheck) {
      content += '⚠️ You are in CHECK!\n';
      content += 'Make a move to get out of check.';
    } else if (data.isMyTurn) {
      content += '✅ Make your move!';
    } else {
      content += '⏳ Opponent is thinking...';
    }

    return content;
  }

  /**
   * Get game time in seconds
   */
  private getGameTime(state: MultiplayerSessionState): number {
    if (!state.gameStartTime) return 0;
    return Math.floor((Date.now() - state.gameStartTime.getTime()) / 1000);
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
   * Get user's color (this would come from session state)
   */
  private getUserColor(): PlayerColor {
    // This should be retrieved from the session state
    // For now, return white as default
    return PlayerColor.WHITE;
  }

  /**
   * Show move confirmation
   */
  showMoveConfirmation(move: { from: string; to: string; piece: string; algebraic: string }): void {
    const content = `Move Confirmed: ${move.algebraic}\n`;
    const expandedContent = `Move: ${move.piece} ${move.from} → ${move.to}\n\nWaiting for opponent...`;
    
    this.appSession.dashboard.content.writeToMain(content);
    this.appSession.dashboard.content.writeToExpanded(expandedContent);
  }

  /**
   * Show opponent move
   */
  showOpponentMove(move: { from: string; to: string; piece: string; algebraic: string }): void {
    const content = `Opponent: ${move.algebraic}`;
    const expandedContent = `Opponent played: ${move.piece} ${move.from} → ${move.to}\n\nYour turn!`;
    
    this.appSession.dashboard.content.writeToMain(content);
    this.appSession.dashboard.content.writeToExpanded(expandedContent);
  }

  /**
   * Show game end
   */
  showGameEnd(result: 'checkmate' | 'stalemate' | 'resignation' | 'draw', winner?: PlayerColor): void {
    let mainContent = '';
    let expandedContent = '';

    switch (result) {
      case 'checkmate':
        mainContent = '🏁 Checkmate!';
        expandedContent = winner ? 
          `${winner === PlayerColor.WHITE ? 'White' : 'Black'} wins by checkmate!` :
          'Checkmate!';
        break;
      case 'stalemate':
        mainContent = '🤝 Stalemate';
        expandedContent = 'The game is a draw by stalemate.';
        break;
      case 'resignation':
        mainContent = '🏳️ Resignation';
        expandedContent = winner ? 
          `${winner === PlayerColor.WHITE ? 'White' : 'Black'} wins by resignation.` :
          'Game ended by resignation.';
        break;
      case 'draw':
        mainContent = '🤝 Draw';
        expandedContent = 'The game is a draw.';
        break;
    }

    expandedContent += '\n\nSay "new game" to start a new game.';

    this.appSession.dashboard.content.writeToMain(mainContent);
    this.appSession.dashboard.content.writeToExpanded(expandedContent);
  }

  /**
   * Show error message
   */
  showError(message: string): void {
    const content = '❌ Error';
    const expandedContent = `${message}\n\nPlease try again.`;
    
    this.appSession.dashboard.content.writeToMain(content);
    this.appSession.dashboard.content.writeToExpanded(expandedContent);
  }

  /**
   * Show loading state
   */
  showLoading(message: string): void {
    const content = '⏳ Loading...';
    const expandedContent = message;
    
    this.appSession.dashboard.content.writeToMain(content);
    this.appSession.dashboard.content.writeToExpanded(expandedContent);
  }
}
