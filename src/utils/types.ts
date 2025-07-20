/**
 * Represents the color of a player or piece.
 */
export enum PlayerColor {
    WHITE = 'white',
    BLACK = 'black',
    NONE = 'none' // For empty squares or game state
  }
  
  /**
   * Represents the type of a chess piece.
   * Uses standard FEN notation characters (uppercase for white, lowercase for black).
   */
  export type Piece = 'P' | 'N' | 'B' | 'R' | 'Q' | 'K' | 'p' | 'n' | 'b' | 'r' | 'q' | 'k' | ' '; // ' ' for empty square
  
  /**
   * Represents the AI difficulty level.
   */
  export enum Difficulty {
    EASY = 'easy',
    MEDIUM = 'medium',
    HARD = 'hard'
  }
  
  /**
   * Represents the different states the user's session can be in.
   */
  export enum SessionMode {
    INITIALIZING = 'initializing',
    CHOOSING_COLOR = 'choosing_color',
    CHOOSING_DIFFICULTY = 'choosing_difficulty',
    USER_TURN = 'user_turn',
    AI_TURN = 'ai_turn',
    AWAITING_CLARIFICATION = 'awaiting_clarification', // When a user move is ambiguous
    GAME_OVER = 'game_over'
  }
  
  /**
   * Represents coordinates on the chessboard (row, column).
   * Standard array indexing: [0, 0] is top-left (A8). [7, 7] is bottom-right (H1).
   */
  export type Coordinates = [number, number]; // [row, col]
  
  /**
   * Represents a potential move, including the source coordinates.
   */
  export interface PotentialMove {
    source: Coordinates;
    piece: Piece;
  }
  
  /**
   * Represents a completed move in the game.
   */
  export interface GameMove {
    piece: Piece;
    from: Coordinates;
    to: Coordinates;
    captured?: Piece;
    promotion?: Piece;
    isCheck?: boolean;
    isCheckmate?: boolean;
    isStalemate?: boolean;
    algebraic: string; // e.g., "e4", "Nxd4", "O-O"
    timestamp?: Date;
    isCastling?: boolean;
    castlingSide?: 'kingside' | 'queenside';
  }
  
  /**
   * Data stored when awaiting clarification for an ambiguous move.
   */
  export interface ClarificationData {
    pieceType: Piece; // The type of piece the user intended to move (e.g., 'R' or 'r')
    targetSquare: Coordinates;
    possibleMoves: PotentialMove[]; // List of pieces that could make the move
  }
  
  /**
   * Represents the state of a single user's chess session.
   */
  export interface SessionState {
    mode: SessionMode;
    userColor: PlayerColor;
    aiDifficulty: Difficulty | null;
    board: Piece[][]; // 8x8 array representing the board state ([0][0] = a8)
    capturedByWhite: Piece[]; // Pieces captured by white (black pieces)
    capturedByBlack: Piece[]; // Pieces captured by black (white pieces)
    currentPlayer: PlayerColor; // Whose turn it is
    clarificationData?: ClarificationData | undefined; // Data for ambiguous move resolution
    timeoutId?: NodeJS.Timeout | null; // For modes that might time out
  
    // --- Move History ---
    moveHistory: GameMove[]; // Complete history of moves
    lastMove?: GameMove; // The most recent move made
  
    // --- FEN Related State ---
    currentFEN: string; // Stores the current board state in FEN
    castlingRights: string; // e.g., "KQkq", "Kq", "-", etc.
    enPassantTarget: string; // Algebraic notation of target square (e.g., "e3") or "-"
    halfmoveClock: number; // Number of halfmoves since last capture or pawn advance (for 50-move rule)
    fullmoveNumber: number; // Starts at 1, increments after Black's move
  
    // --- Game Status ---
    isCheck: boolean;
    isCheckmate: boolean;
    isStalemate: boolean;
    gameResult?: 'white_win' | 'black_win' | 'draw' | undefined;
    gameStartTime: Date;
    lastActivityTime: Date;
  }
  
  /**
   * Represents the result of a move validation.
   */
  export interface MoveValidationResult {
    isValid: boolean;
    error?: string;
    isCheck?: boolean;
    isCheckmate?: boolean;
    isStalemate?: boolean;
    legalMoves?: PotentialMove[];
  }
  
  /**
   * Represents AI move generation options.
   */
  export interface AIMoveOptions {
    difficulty: Difficulty;
    maxTimeMs?: number;
    maxDepth?: number;
    useOpeningBook?: boolean;
  }
  
  /**
   * Represents a game statistics summary.
   */
  export interface GameStats {
    totalMoves: number;
    capturesByWhite: number;
    capturesByBlack: number;
    gameDuration: number; // in seconds
    averageMoveTime: number; // in seconds
    checkCount: number;
    gameResult: 'white_win' | 'black_win' | 'draw' | 'ongoing';
  }
  