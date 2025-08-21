import { SessionState, PlayerColor, GameMove, Coordinates, SessionMode } from './types';
import { GameStateData } from '../services/GamePersistenceService';

export interface ExportOptions {
  format: 'json' | 'pgn' | 'fen';
  includeMoveHistory: boolean;
  includeMetadata: boolean;
  includeAnalysis?: boolean;
}

export interface ImportOptions {
  format: 'json' | 'pgn' | 'fen';
  validateMoves: boolean;
  preserveMetadata: boolean;
}

export interface PGNMove {
  moveNumber: number;
  whiteMove?: string;
  blackMove?: string;
  whiteClock?: string;
  blackClock?: string;
  evaluation?: string;
  comment?: string;
}

export interface PGNData {
  event: string;
  site: string;
  date: string;
  round: string;
  white: string;
  black: string;
  result: string;
  whiteElo?: string;
  blackElo?: string;
  timeControl?: string;
  moves: PGNMove[];
  metadata: Record<string, string>;
}

export class GameExportImport {
  /**
   * Export game data in specified format
   */
  static exportGame(gameData: GameStateData, options: ExportOptions): string {
    switch (options.format) {
      case 'json':
        return this.exportToJSON(gameData, options);
      case 'pgn':
        return this.exportToPGN(gameData, options);
      case 'fen':
        return this.exportToFEN(gameData);
      default:
        throw new Error(`Unsupported export format: ${options.format}`);
    }
  }

  /**
   * Import game data from specified format
   */
  static importGame(importData: string, options: ImportOptions): GameStateData {
    // Try to detect format automatically
    const format = this.detectFormat(importData);
    
    switch (format) {
      case 'json':
        return this.importFromJSON(importData, options);
      case 'pgn':
        return this.importFromPGN(importData, options);
      case 'fen':
        return this.importFromFEN(importData, options);
      default:
        throw new Error(`Unsupported import format: ${format}`);
    }
  }

  /**
   * Export to JSON format
   */
  private static exportToJSON(gameData: GameStateData, options: ExportOptions): string {
    const exportData: any = {
      gameId: gameData.gameId,
      player1Id: gameData.player1Id,
      player2Id: gameData.player2Id,
      gameStartTime: gameData.gameStartTime.toISOString(),
      lastMoveTime: gameData.lastMoveTime.toISOString()
    };

    if (options.includeMetadata) {
      exportData.gameEndTime = gameData.gameEndTime?.toISOString();
      exportData.gameResult = gameData.gameResult;
      exportData.winner = gameData.winner;
    }

    if (options.includeMoveHistory) {
      exportData.moveHistory = gameData.moveHistory;
    }

    exportData.currentState = gameData.currentState;

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Export to PGN format
   */
  private static exportToPGN(gameData: GameStateData, options: ExportOptions): string {
    const pgnData: PGNData = {
      event: 'AR Chess Game',
      site: 'MentraOS',
      date: gameData.gameStartTime.toISOString().split('T')[0] || '',
      round: '1',
      white: this.getPlayerName(gameData.player1Id),
      black: this.getPlayerName(gameData.player2Id),
      result: this.getPGNResult(gameData.gameResult),
      timeControl: '300', // 5 minutes per side
      moves: [],
      metadata: {}
    };

    if (options.includeMetadata) {
      pgnData.metadata = {
        GameId: gameData.gameId,
        StartTime: gameData.gameStartTime.toISOString(),
        EndTime: gameData.gameEndTime?.toISOString() || '',
        Player1Id: gameData.player1Id,
        Player2Id: gameData.player2Id
      };
    }

    // Convert moves to PGN format
    if (options.includeMoveHistory) {
      pgnData.moves = this.convertMovesToPGN(gameData.moveHistory);
    }

    return this.formatPGN(pgnData);
  }

  /**
   * Export to FEN format
   */
  private static exportToFEN(gameData: GameStateData): string {
    return gameData.currentState.currentFEN || this.boardToFEN(gameData.currentState);
  }

  /**
   * Import from JSON format
   */
  private static importFromJSON(importData: string, options: ImportOptions): GameStateData {
    try {
      const data = JSON.parse(importData);
      
      // Validate required fields
      if (!data.gameId || !data.player1Id || !data.player2Id) {
        throw new Error('Invalid JSON data: missing required fields');
      }

      const gameData: GameStateData = {
        gameId: data.gameId,
        player1Id: data.player1Id,
        player2Id: data.player2Id,
        currentState: data.currentState,
        moveHistory: data.moveHistory || [],
        gameStartTime: new Date(data.gameStartTime),
        lastMoveTime: new Date(data.lastMoveTime),
        gameEndTime: data.gameEndTime ? new Date(data.gameEndTime) : new Date(),
        gameResult: data.gameResult,
        winner: data.winner
      };

      if (options.validateMoves) {
        this.validateGameData(gameData);
      }

      return gameData;
    } catch (error) {
      throw new Error(`Failed to import JSON data: ${(error as Error).message}`);
    }
  }

  /**
   * Import from PGN format
   */
  private static importFromPGN(importData: string, options: ImportOptions): GameStateData {
    try {
      const pgnData = this.parsePGN(importData);
      
      // Create game data from PGN
      const gameData: GameStateData = {
        gameId: pgnData.metadata.GameId || `pgn_import_${Date.now()}`,
        player1Id: pgnData.white,
        player2Id: pgnData.black,
        currentState: this.createInitialState(),
        moveHistory: [],
        gameStartTime: new Date(pgnData.date),
        lastMoveTime: new Date(pgnData.date),
        gameResult: this.getGameResultFromPGN(pgnData.result),
        winner: this.getWinnerFromPGN(pgnData.result, pgnData.white, pgnData.black)
      };

      // Convert PGN moves to internal format
      if (options.preserveMetadata) {
        gameData.moveHistory = this.convertPGNToMoves(pgnData.moves);
      }

      if (options.validateMoves) {
        this.validateGameData(gameData);
      }

      return gameData;
    } catch (error) {
      throw new Error(`Failed to import PGN data: ${(error as Error).message}`);
    }
  }

  /**
   * Import from FEN format
   */
  private static importFromFEN(importData: string, options: ImportOptions): GameStateData {
    try {
      const fen = importData.trim();
      
      // Validate FEN format
      if (!this.isValidFEN(fen)) {
        throw new Error('Invalid FEN format');
      }

      const gameData: GameStateData = {
        gameId: `fen_import_${Date.now()}`,
        player1Id: 'White Player',
        player2Id: 'Black Player',
        currentState: this.fenToState(fen),
        moveHistory: [],
        gameStartTime: new Date(),
        lastMoveTime: new Date()
      };

      return gameData;
    } catch (error) {
      throw new Error(`Failed to import FEN data: ${(error as Error).message}`);
    }
  }

  /**
   * Detect import format automatically
   */
  private static detectFormat(data: string): 'json' | 'pgn' | 'fen' {
    const trimmed = data.trim();
    
    // Check for JSON
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        JSON.parse(trimmed);
        return 'json';
      } catch {
        // Not valid JSON
      }
    }
    
    // Check for PGN
    if (trimmed.includes('[Event') || trimmed.includes('1.')) {
      return 'pgn';
    }
    
    // Check for FEN
    if (trimmed.includes('/') && trimmed.includes(' ')) {
      const parts = trimmed.split(' ');
      if (parts.length >= 4 && parts[0] && parts[0].includes('/')) {
        return 'fen';
      }
    }
    
    throw new Error('Unable to detect import format');
  }

  /**
   * Convert moves to PGN format
   */
  private static convertMovesToPGN(moves: GameMove[]): PGNMove[] {
    const pgnMoves: PGNMove[] = [];
    
    for (let i = 0; i < moves.length; i += 2) {
      const moveNumber = Math.floor(i / 2) + 1;
      const pgnMove: PGNMove = { moveNumber };
      
      // White move
      if (i < moves.length) {
        pgnMove.whiteMove = moves[i]?.algebraic || `${moves[i]?.from}-${moves[i]?.to}`;
      }
      
      // Black move
      if (i + 1 < moves.length) {
        pgnMove.blackMove = moves[i + 1]?.algebraic || `${moves[i + 1]?.from}-${moves[i + 1]?.to}`;
      }
      
      pgnMoves.push(pgnMove);
    }
    
    return pgnMoves;
  }

  /**
   * Convert PGN moves to internal format
   */
  private static convertPGNToMoves(pgnMoves: PGNMove[]): GameMove[] {
    const moves: GameMove[] = [];
    
    for (const pgnMove of pgnMoves) {
      if (pgnMove.whiteMove) {
        moves.push(this.pgnMoveToGameMove(pgnMove.whiteMove, PlayerColor.WHITE));
      }
      if (pgnMove.blackMove) {
        moves.push(this.pgnMoveToGameMove(pgnMove.blackMove, PlayerColor.BLACK));
      }
    }
    
    return moves;
  }

  /**
   * Convert PGN move to GameMove
   */
  private static pgnMoveToGameMove(pgnMove: string, player: PlayerColor): GameMove {
    // This is a simplified conversion - would need more sophisticated parsing
    const move: GameMove = {
      from: [0, 0] as Coordinates, // Default coordinates
      to: [0, 0] as Coordinates, // Default coordinates
      piece: 'P', // Default to pawn
      algebraic: pgnMove
    };
    
    // Basic parsing - could be enhanced
          if (pgnMove.includes('-')) {
        const [from, to] = pgnMove.split('-');
        move.from = this.algebraicToCoordinates(from || '') || [0, 0];
        move.to = this.algebraicToCoordinates(to || '') || [0, 0];
      } else if (pgnMove.includes('x')) {
        const [from, to] = pgnMove.split('x');
        move.from = this.algebraicToCoordinates(from || '') || [0, 0];
        move.to = this.algebraicToCoordinates(to || '') || [0, 0];
      }
    
    return move;
  }

  /**
   * Convert algebraic notation to coordinates
   */
  private static algebraicToCoordinates(algebraic: string): Coordinates | null {
    if (!algebraic || algebraic.length !== 2) return null;
    
    const file = algebraic.charCodeAt(0) - 'a'.charCodeAt(0);
    const rank = 8 - parseInt(algebraic[1] || '0');
    
    if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
    
    return [rank, file];
  }

  /**
   * Format PGN data as string
   */
  private static formatPGN(pgnData: PGNData): string {
    let pgn = '';
    
    // Add metadata
    pgn += `[Event "${pgnData.event}"]\n`;
    pgn += `[Site "${pgnData.site}"]\n`;
    pgn += `[Date "${pgnData.date}"]\n`;
    pgn += `[Round "${pgnData.round}"]\n`;
    pgn += `[White "${pgnData.white}"]\n`;
    pgn += `[Black "${pgnData.black}"]\n`;
    pgn += `[Result "${pgnData.result}"]\n`;
    
    if (pgnData.whiteElo) pgn += `[WhiteElo "${pgnData.whiteElo}"]\n`;
    if (pgnData.blackElo) pgn += `[BlackElo "${pgnData.blackElo}"]\n`;
    if (pgnData.timeControl) pgn += `[TimeControl "${pgnData.timeControl}"]\n`;
    
    // Add custom metadata
    for (const [key, value] of Object.entries(pgnData.metadata)) {
      pgn += `[${key} "${value}"]\n`;
    }
    
    pgn += '\n';
    
    // Add moves
    for (const move of pgnData.moves) {
      pgn += `${move.moveNumber}.`;
      if (move.whiteMove) pgn += ` ${move.whiteMove}`;
      if (move.blackMove) pgn += ` ${move.blackMove}`;
      pgn += ' ';
    }
    
    pgn += pgnData.result;
    
    return pgn;
  }

  /**
   * Parse PGN data from string
   */
  private static parsePGN(pgnText: string): PGNData {
    const lines = pgnText.split('\n');
    const pgnData: PGNData = {
      event: '',
      site: '',
      date: '',
      round: '',
      white: '',
      black: '',
      result: '',
      moves: [],
      metadata: {}
    };
    
    let inMoves = false;
    let movesText = '';
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        // Parse metadata
        const match = trimmed.match(/\[(\w+)\s+"([^"]*)"\]/);
        if (match) {
          const [, key, value] = match;
          switch (key) {
            case 'Event': pgnData.event = value || ''; break;
            case 'Site': pgnData.site = value || ''; break;
            case 'Date': pgnData.date = value || ''; break;
            case 'Round': pgnData.round = value || ''; break;
            case 'White': pgnData.white = value || ''; break;
            case 'Black': pgnData.black = value || ''; break;
            case 'Result': pgnData.result = value || ''; break;
            case 'WhiteElo': pgnData.whiteElo = value || ''; break;
            case 'BlackElo': pgnData.blackElo = value || ''; break;
            case 'TimeControl': pgnData.timeControl = value || ''; break;
            default: if (key) pgnData.metadata[key] = value || ''; break;
          }
        }
      } else if (trimmed && !inMoves) {
        // Start of moves section
        inMoves = true;
        movesText = trimmed;
      } else if (inMoves) {
        movesText += ' ' + trimmed;
      }
    }
    
    // Parse moves
    if (movesText) {
      pgnData.moves = this.parsePGNMoves(movesText);
    }
    
    return pgnData;
  }

  /**
   * Parse PGN moves from text
   */
  private static parsePGNMoves(movesText: string): PGNMove[] {
    const moves: PGNMove[] = [];
    const moveRegex = /(\d+)\.\s*([^\s]+)(?:\s+([^\s]+))?/g;
    let match;
    
    while ((match = moveRegex.exec(movesText)) !== null) {
      const [, moveNumber, whiteMove, blackMove] = match;
      const pgnMove: PGNMove = {
        moveNumber: parseInt(moveNumber || '0')
      };
      
      if (whiteMove && whiteMove !== '...') {
        pgnMove.whiteMove = whiteMove;
      }
      
      if (blackMove) {
        pgnMove.blackMove = blackMove;
      }
      
      moves.push(pgnMove);
    }
    
    return moves;
  }

  /**
   * Get PGN result from game result
   */
  private static getPGNResult(gameResult?: string): string {
    switch (gameResult) {
      case 'white_win': return '1-0';
      case 'black_win': return '0-1';
      case 'draw': return '1/2-1/2';
      default: return '*';
    }
  }

  /**
   * Get game result from PGN result
   */
  private static getGameResultFromPGN(pgnResult: string): 'white_win' | 'black_win' | 'draw' | 'resignation' | undefined {
    switch (pgnResult) {
      case '1-0': return 'white_win';
      case '0-1': return 'black_win';
      case '1/2-1/2': return 'draw';
      default: return undefined;
    }
  }

  /**
   * Get winner from PGN result
   */
  private static getWinnerFromPGN(pgnResult: string, white: string, black: string): string | undefined {
    switch (pgnResult) {
      case '1-0': return white;
      case '0-1': return black;
      default: return undefined;
    }
  }

  /**
   * Validate FEN format
   */
  private static isValidFEN(fen: string): boolean {
    const parts = fen.split(' ');
    if (parts.length < 4) return false;
    
    // Basic validation - could be more comprehensive
    const board = parts[0];
    const turn = parts[1];
    const castling = parts[2];
    const enPassant = parts[3];
    
        return Boolean(board && board.includes('/') &&
           (turn === 'w' || turn === 'b') &&
           castling && castling.length > 0 &&
           (enPassant === '-' || (enPassant && /^[a-h][36]$/.test(enPassant))));
  }

  /**
   * Convert FEN to game state
   */
  private static fenToState(fen: string): SessionState {
    // This would need to be implemented based on your chess logic
    // For now, return a basic state
    return {
      board: [],
      currentPlayer: PlayerColor.WHITE,
      currentFEN: fen,
      fullmoveNumber: 1,
      halfmoveClock: 0,
      userColor: PlayerColor.WHITE,
      mode: SessionMode.USER_TURN,
      isCheck: false,
      isCheckmate: false,
      isStalemate: false,
      capturedByWhite: [],
      capturedByBlack: [],
      aiDifficulty: null,
      moveHistory: [],
      gameStartTime: new Date(),
      lastActivityTime: new Date(),
      castlingRights: 'KQkq',
      enPassantTarget: '-'
    };
  }

  /**
   * Convert board to FEN
   */
  private static boardToFEN(state: SessionState): string {
    return state.currentFEN || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  }

  /**
   * Create initial game state
   */
  private static createInitialState(): SessionState {
    return {
      board: [],
      currentPlayer: PlayerColor.WHITE,
      currentFEN: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      fullmoveNumber: 1,
      halfmoveClock: 0,
      userColor: PlayerColor.WHITE,
      mode: SessionMode.USER_TURN,
      isCheck: false,
      isCheckmate: false,
      isStalemate: false,
      capturedByWhite: [],
      capturedByBlack: [],
      aiDifficulty: null,
      moveHistory: [],
      gameStartTime: new Date(),
      lastActivityTime: new Date(),
      castlingRights: 'KQkq',
      enPassantTarget: '-'
    };
  }

  /**
   * Validate game data
   */
  private static validateGameData(gameData: GameStateData): void {
    if (!gameData.gameId) {
      throw new Error('Game ID is required');
    }
    
    if (!gameData.player1Id || !gameData.player2Id) {
      throw new Error('Both players are required');
    }
    
    if (!gameData.currentState) {
      throw new Error('Game state is required');
    }
    
    // Additional validation could be added here
  }

  /**
   * Get player name (placeholder implementation)
   */
  private static getPlayerName(userId: string): string {
    return `Player ${userId.substring(0, 8)}`;
  }
}
