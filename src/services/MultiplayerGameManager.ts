import { NetworkService } from './NetworkService';
import { SessionState, GameMove, PlayerColor, SessionMode } from '../utils/types';
import { 
  validateMove, 
  executeMove, 
  checkGameEnd, 
  boardToFEN,
  updateCastlingRights,
  isInCheck
} from '../chess_logic';

/**
 * Manages real-time multiplayer chess games with move synchronization
 * and game state management
 */
export class MultiplayerGameManager {
  private activeGames: Map<string, MultiplayerGame> = new Map();
  private networkService: NetworkService;
  private gameStateCallbacks: Map<string, Array<(gameState: SessionState) => void>> = new Map();
  private moveCallbacks: Map<string, Array<(move: GameMove, fen: string) => void>> = new Map();
  private gameEndCallbacks: Map<string, Array<(reason: string, winner?: string) => void>> = new Map();

  constructor(networkService: NetworkService) {
    this.networkService = networkService;
    this.setupNetworkEventHandlers();
  }

  /**
   * Set up network event handlers for real-time communication
   */
  private setupNetworkEventHandlers(): void {
    // Handle incoming moves
    this.networkService.on('move', async (data) => {
      const { gameId, fen, move } = data.data;
      await this.handleIncomingMove(gameId, fen, move);
    });

    // Handle validated moves
    this.networkService.on('validated_move', async (data) => {
      const { gameId, fen, move, validation } = data.data;
      await this.handleValidatedMove(gameId, fen, move, validation);
    });

    // Handle move acknowledgments
    this.networkService.on('move_ack', async (data) => {
      const { moveId, accepted, error } = data.data;
      await this.handleMoveAcknowledgment(data.gameId, moveId, accepted, error);
    });

    // Handle game state updates
    this.networkService.on('game_state_update', async (data) => {
      const { state, moveHistory } = data.data;
      await this.handleGameStateUpdate(data.gameId, state, moveHistory);
    });

    // Handle game state sync requests
    this.networkService.on('game_state_sync_request', async (data) => {
      await this.handleGameStateSyncRequest(data.gameId, data.fromUserId);
    });

    // Handle game state sync responses
    this.networkService.on('game_state_sync_response', async (data) => {
      const { state } = data.data;
      await this.handleGameStateSyncResponse(data.gameId, state);
    });

    // Handle game end
    this.networkService.on('game_end', async (data) => {
      const { reason, winner } = data.data;
      await this.handleGameEnd(data.gameId, reason, winner);
    });
  }

  /**
   * Create a new multiplayer game
   */
  async createGame(gameId: string, player1Id: string, player2Id: string): Promise<void> {
    const game: MultiplayerGame = {
      gameId,
      player1Id,
      player2Id,
      currentState: this.createInitialGameState(),
      moveHistory: [],
      lastMoveTime: new Date(),
      isActive: true,
      pendingMoves: new Map(),
      gameStartTime: new Date()
    };

    this.activeGames.set(gameId, game);

    // Add players to network service
    this.networkService.addGameParticipant(gameId, player1Id);
    this.networkService.addGameParticipant(gameId, player2Id);

    // Send initial game state to both players
    await this.networkService.sendGameState(gameId, game.currentState);

    console.log(`[MultiplayerGameManager] Created game ${gameId} with players ${player1Id} and ${player2Id}`);
  }

  /**
   * Make a move in a multiplayer game
   */
  async makeMove(gameId: string, userId: string, move: GameMove): Promise<{ success: boolean; error?: string }> {
    const game = this.activeGames.get(gameId);
    if (!game) {
      return { success: false, error: 'Game not found' };
    }

    if (!game.isActive) {
      return { success: false, error: 'Game is not active' };
    }

    // Verify it's the player's turn
    if (game.currentState.currentPlayer !== this.getPlayerColor(gameId, userId)) {
      return { success: false, error: 'Not your turn' };
    }

    // Validate the move
    const validation = validateMove(
      game.currentState.board,
      move.from,
      move.to,
      game.currentState.currentPlayer,
      game.currentState.castlingRights
    );

    if (!validation.isValid) {
      return { success: false, error: validation.error || 'Invalid move' };
    }

    // Execute the move locally
    const { updatedBoard, capturedPiece } = executeMove(game.currentState.board, move.from, move.to);
    
    // Update game state
    game.currentState.board = updatedBoard;
    game.currentState.currentPlayer = game.currentState.currentPlayer === PlayerColor.WHITE ? PlayerColor.BLACK : PlayerColor.WHITE;
    game.currentState.currentFEN = boardToFEN(game.currentState);
    game.currentState.castlingRights = updateCastlingRights(
      game.currentState.board,
      move.from,
      move.to,
      game.currentState.currentPlayer === PlayerColor.WHITE ? PlayerColor.BLACK : PlayerColor.WHITE,
      game.currentState.castlingRights
    );

    // Update captured pieces
    if (capturedPiece !== ' ') {
      if (game.currentState.currentPlayer === PlayerColor.WHITE) {
        game.currentState.capturedByWhite.push(capturedPiece);
      } else {
        game.currentState.capturedByBlack.push(capturedPiece);
      }
    }

    // Add move to history
    const moveWithMetadata: GameMove = {
      ...move,
      fromUserId: userId,
      moveTime: Date.now() - game.lastMoveTime.getTime()
    };
    game.moveHistory.push(moveWithMetadata);
    game.currentState.moveHistory = game.moveHistory;
    game.lastMoveTime = new Date();

    // Check for game end conditions
    const gameEnd = checkGameEnd(game.currentState.board, game.currentState.currentPlayer);
    if (gameEnd.isOver) {
      game.currentState.isCheckmate = gameEnd.result === 'white_win' || gameEnd.result === 'black_win';
      game.currentState.isStalemate = gameEnd.result === 'draw';
      game.currentState.gameResult = gameEnd.result;
      game.isActive = false;
    }

    // Send move to opponent
    await this.networkService.sendValidatedMove(gameId, game.currentState.currentFEN, moveWithMetadata, validation);

    // Notify local callbacks
    this.notifyMoveCallbacks(gameId, moveWithMetadata, game.currentState.currentFEN);
    this.notifyGameStateCallbacks(gameId, game.currentState);

    return { success: true };
  }

  /**
   * Handle incoming move from opponent
   */
  private async handleIncomingMove(gameId: string, fen: string, move: GameMove): Promise<void> {
    const game = this.activeGames.get(gameId);
    if (!game || !game.isActive) return;

    // Validate the move
    const validation = validateMove(
      game.currentState.board,
      move.from,
      move.to,
      game.currentState.currentPlayer,
      game.currentState.castlingRights
    );

    if (!validation.isValid) {
      // Send rejection acknowledgment
      await this.networkService.sendMoveAcknowledgment(gameId, move.algebraic || 'unknown', false, validation.error);
      return;
    }

    // Execute the move
    const { updatedBoard, capturedPiece } = executeMove(game.currentState.board, move.from, move.to);
    
    // Update game state
    game.currentState.board = updatedBoard;
    game.currentState.currentPlayer = game.currentState.currentPlayer === PlayerColor.WHITE ? PlayerColor.BLACK : PlayerColor.WHITE;
    game.currentState.currentFEN = boardToFEN(game.currentState);
    game.currentState.castlingRights = updateCastlingRights(
      game.currentState.board,
      move.from,
      move.to,
      game.currentState.currentPlayer === PlayerColor.WHITE ? PlayerColor.BLACK : PlayerColor.WHITE,
      game.currentState.castlingRights
    );

    // Update captured pieces
    if (capturedPiece !== ' ') {
      if (game.currentState.currentPlayer === PlayerColor.WHITE) {
        game.currentState.capturedByWhite.push(capturedPiece);
      } else {
        game.currentState.capturedByBlack.push(capturedPiece);
      }
    }

    // Add move to history
    game.moveHistory.push(move);
    game.currentState.moveHistory = game.moveHistory;
    game.lastMoveTime = new Date();

    // Check for game end conditions
    const gameEnd = checkGameEnd(game.currentState.board, game.currentState.currentPlayer);
    if (gameEnd.isOver) {
      game.currentState.isCheckmate = gameEnd.result === 'white_win' || gameEnd.result === 'black_win';
      game.currentState.isStalemate = gameEnd.result === 'draw';
      game.currentState.gameResult = gameEnd.result;
      game.isActive = false;
    }

    // Send acknowledgment
    await this.networkService.sendMoveAcknowledgment(gameId, move.algebraic || 'unknown', true);

    // Notify callbacks
    this.notifyMoveCallbacks(gameId, move, game.currentState.currentFEN);
    this.notifyGameStateCallbacks(gameId, game.currentState);

    // Check if game ended
    if (gameEnd.isOver) {
      await this.endGame(gameId, gameEnd.reason || 'game_over', undefined);
    }
  }

  /**
   * Handle validated move from opponent
   */
  private async handleValidatedMove(gameId: string, fen: string, move: GameMove, validation: any): Promise<void> {
    // Similar to handleIncomingMove but with pre-validated move
    await this.handleIncomingMove(gameId, fen, move);
  }

  /**
   * Handle move acknowledgment
   */
  private async handleMoveAcknowledgment(gameId: string, moveId: string, accepted: boolean, error?: string): Promise<void> {
    const game = this.activeGames.get(gameId);
    if (!game) return;

    if (!accepted) {
      console.warn(`[MultiplayerGameManager] Move ${moveId} was rejected: ${error}`);
      // Could implement move rollback here if needed
    }
  }

  /**
   * Handle game state update
   */
  private async handleGameStateUpdate(gameId: string, state: SessionState, moveHistory: GameMove[]): Promise<void> {
    const game = this.activeGames.get(gameId);
    if (!game) return;

    // Update local game state
    game.currentState = state;
    game.moveHistory = moveHistory;

    // Notify callbacks
    this.notifyGameStateCallbacks(gameId, state);
  }

  /**
   * Handle game state sync request
   */
  private async handleGameStateSyncRequest(gameId: string, requestingUserId: string): Promise<void> {
    const game = this.activeGames.get(gameId);
    if (!game) return;

    // Send current game state to requesting user
    await this.networkService.respondToGameStateSync(gameId, game.currentState);
  }

  /**
   * Handle game state sync response
   */
  private async handleGameStateSyncResponse(gameId: string, state: SessionState): Promise<void> {
    const game = this.activeGames.get(gameId);
    if (!game) return;

    // Update local game state with received state
    game.currentState = state;
    game.moveHistory = state.moveHistory;

    // Notify callbacks
    this.notifyGameStateCallbacks(gameId, state);
  }

  /**
   * End a game
   */
  async endGame(gameId: string, reason: string, winner?: string): Promise<void> {
    const game = this.activeGames.get(gameId);
    if (!game) return;

    game.isActive = false;
    game.currentState.gameResult = winner === game.player1Id ? 'white_win' : 
                                   winner === game.player2Id ? 'black_win' : 'draw';

    // Send game end notification
    await this.networkService.sendGameEnd(gameId, reason as any, winner);

    // Notify callbacks
    this.notifyGameEndCallbacks(gameId, reason, winner);

    console.log(`[MultiplayerGameManager] Game ${gameId} ended: ${reason}, winner: ${winner}`);
  }

  /**
   * Handle game end
   */
  private async handleGameEnd(gameId: string, reason: string, winner?: string): Promise<void> {
    await this.endGame(gameId, reason, winner);
  }

  /**
   * Get current game state
   */
  getGameState(gameId: string): SessionState | null {
    const game = this.activeGames.get(gameId);
    return game ? game.currentState : null;
  }

  /**
   * Get player color for a user in a game
   */
  getPlayerColor(gameId: string, userId: string): PlayerColor | null {
    const game = this.activeGames.get(gameId);
    if (!game) return null;

    if (game.player1Id === userId) return PlayerColor.WHITE;
    if (game.player2Id === userId) return PlayerColor.BLACK;
    return null;
  }

  /**
   * Check if it's a user's turn
   */
  isUserTurn(gameId: string, userId: string): boolean {
    const game = this.activeGames.get(gameId);
    if (!game || !game.isActive) return false;

    const playerColor = this.getPlayerColor(gameId, userId);
    return playerColor === game.currentState.currentPlayer;
  }

  /**
   * Check if a user is participating in a game
   */
  isUserInGame(userId: string, gameId: string): boolean {
    const game = this.activeGames.get(gameId);
    if (!game) return false;

    return game.player1Id === userId || game.player2Id === userId;
  }

  /**
   * Register callbacks for game events
   */
  onGameStateChange(gameId: string, callback: (state: SessionState) => void): void {
    if (!this.gameStateCallbacks.has(gameId)) {
      this.gameStateCallbacks.set(gameId, []);
    }
    this.gameStateCallbacks.get(gameId)!.push(callback);
  }

  onMove(gameId: string, callback: (move: GameMove, fen: string) => void): void {
    if (!this.moveCallbacks.has(gameId)) {
      this.moveCallbacks.set(gameId, []);
    }
    this.moveCallbacks.get(gameId)!.push(callback);
  }

  onGameEnd(gameId: string, callback: (reason: string, winner?: string) => void): void {
    if (!this.gameEndCallbacks.has(gameId)) {
      this.gameEndCallbacks.set(gameId, []);
    }
    this.gameEndCallbacks.get(gameId)!.push(callback);
  }

  /**
   * Notify callbacks
   */
  private notifyGameStateCallbacks(gameId: string, state: SessionState): void {
    const callbacks = this.gameStateCallbacks.get(gameId);
    if (callbacks) {
      for (const callback of callbacks) {
        try {
          callback(state);
        } catch (error) {
          console.error(`[MultiplayerGameManager] Error in game state callback:`, error);
        }
      }
    }
  }

  private notifyMoveCallbacks(gameId: string, move: GameMove, fen: string): void {
    const callbacks = this.moveCallbacks.get(gameId);
    if (callbacks) {
      for (const callback of callbacks) {
        try {
          callback(move, fen);
        } catch (error) {
          console.error(`[MultiplayerGameManager] Error in move callback:`, error);
        }
      }
    }
  }

  private notifyGameEndCallbacks(gameId: string, reason: string, winner?: string): void {
    const callbacks = this.gameEndCallbacks.get(gameId);
    if (callbacks) {
      for (const callback of callbacks) {
        try {
          callback(reason, winner);
        } catch (error) {
          console.error(`[MultiplayerGameManager] Error in game end callback:`, error);
        }
      }
    }
  }

  /**
   * Create initial game state
   */
  private createInitialGameState(): SessionState {
    return {
      mode: SessionMode.USER_TURN,
      userColor: PlayerColor.WHITE,
      aiDifficulty: null,
      gameMode: 'multiplayer',
      board: [
        ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
        ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
        [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
        [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
        [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
        [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
        ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
        ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
      ],
      capturedByWhite: [],
      capturedByBlack: [],
      currentPlayer: PlayerColor.WHITE,
      currentFEN: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      castlingRights: "KQkq",
      enPassantTarget: "-",
      halfmoveClock: 0,
      fullmoveNumber: 1,
      moveHistory: [],
      isCheck: false,
      isCheckmate: false,
      isStalemate: false,
      gameStartTime: new Date(),
      lastActivityTime: new Date()
    };
  }

  /**
   * Clean up a game
   */
  async cleanupGame(gameId: string): Promise<void> {
    const game = this.activeGames.get(gameId);
    if (!game) return;

    // Remove players from network service
    this.networkService.removeGameParticipant(gameId, game.player1Id);
    this.networkService.removeGameParticipant(gameId, game.player2Id);

    // Clear callbacks
    this.gameStateCallbacks.delete(gameId);
    this.moveCallbacks.delete(gameId);
    this.gameEndCallbacks.delete(gameId);

    // Remove game
    this.activeGames.delete(gameId);

    console.log(`[MultiplayerGameManager] Cleaned up game ${gameId}`);
  }

  /**
   * Get all active games
   */
  getActiveGames(): string[] {
    return Array.from(this.activeGames.keys());
  }

  /**
   * Get game statistics
   */
  getGameStats(gameId: string): GameStats | null {
    const game = this.activeGames.get(gameId);
    if (!game) return null;

    return {
      gameId,
      player1Id: game.player1Id,
      player2Id: game.player2Id,
      isActive: game.isActive,
      moveCount: game.moveHistory.length,
      gameDuration: Date.now() - game.gameStartTime.getTime(),
      lastMoveTime: game.lastMoveTime
    };
  }

  /**
   * Clean up all games and resources
   */
  async cleanup(): Promise<void> {
    const gameIds = Array.from(this.activeGames.keys());
    
    for (const gameId of gameIds) {
      await this.cleanupGame(gameId);
    }

    console.log(`[MultiplayerGameManager] Cleaned up all games`);
  }
}

/**
 * Represents a multiplayer chess game
 */
interface MultiplayerGame {
  gameId: string;
  player1Id: string;
  player2Id: string;
  currentState: SessionState;
  moveHistory: GameMove[];
  lastMoveTime: Date;
  isActive: boolean;
  pendingMoves: Map<string, GameMove>;
  gameStartTime: Date;
}

/**
 * Game statistics
 */
interface GameStats {
  gameId: string;
  player1Id: string;
  player2Id: string;
  isActive: boolean;
  moveCount: number;
  gameDuration: number;
  lastMoveTime: Date;
}
