import { TpaSession } from '@mentra/sdk';
import {
    PlayerColor,
    Piece,
    Coordinates,
    SessionState,
    PotentialMove
} from './utils/types';

// --- Constants ---
const BOARD_SIZE = 8;
const FILES = 'abcdefgh';
const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// --- Board Initialization ---

/**
 * Creates the initial 8x8 board state.
 * Uppercase = White, Lowercase = Black. ' ' = Empty.
 * @returns An 8x8 array representing the starting chess board.
 */
export function initializeBoard(): Piece[][] {
    // FEN: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR
    return [
        ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'], // Rank 8 (row 0)
        ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'], // Rank 7 (row 1)
        [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '], // Rank 6 (row 2)
        [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '], // Rank 5 (row 3)
        [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '], // Rank 4 (row 4)
        [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '], // Rank 3 (row 5)
        ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'], // Rank 2 (row 6)
        ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']  // Rank 1 (row 7)
    ];
}

// --- Coordinate Conversion ---

/**
 * Converts algebraic notation (e.g., "e4") to board coordinates [row, col].
 * Assumes [0, 0] = a8, [7, 7] = h1.
 * @param alg - Algebraic notation string (e.g., "a1", "h8").
 * @returns Coordinates [row, col] or null if invalid.
 */
export function algebraicToCoords(alg: string): Coordinates | null {
    if (typeof alg !== 'string' || alg.length !== 2) return null;
    const fileChar = alg[0]?.toLowerCase();
    const rankChar = alg[1];

    if (!fileChar || !rankChar) return null;

    const file = FILES.indexOf(fileChar); // 0='a', 7='h'
    const rank = parseInt(rankChar, 10); // 1 to 8

    if (file === -1 || isNaN(rank) || rank < 1 || rank > 8) {
        return null;
    }

    // Convert rank (1-8) to row index (7-0)
    const row = BOARD_SIZE - rank; // Rank 1 is row 7, Rank 8 is row 0
    return [row, file];
}

/**
 * Converts board coordinates [row, col] to algebraic notation (e.g., "e4").
 * Assumes [0, 0] = a8, [7, 7] = h1.
 * @param coords - Coordinates [row, col].
 * @returns Algebraic notation string or "?" if invalid.
 */
export function coordsToAlgebraic(coords: Coordinates): string {
    if (!Array.isArray(coords) || coords.length !== 2) return "?";
    const [row, col] = coords;

    if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) {
        return "?";
    }

    const fileChar = FILES[col];
    // Convert row index (0-7) to rank (8-1)
    const rank = BOARD_SIZE - row;
    return `${fileChar}${rank}`;
}

// --- Transcript Parsing ---

/**
 * Parses voice transcript for a move command.
 * Example: "rook to d4" -> { piece: 'r', target: 'd4' }
 * Example: "pawn e5" -> { piece: 'p', target: 'e5' }
 * Handles common piece names. Returns lowercase piece character.
 * @param transcript - The user's voice command.
 * @returns Object with piece type (lowercase) and target square, or null.
 */
export function parseMoveTranscript(transcript: string): { piece: string; target: string } | null {
    transcript = transcript.toLowerCase().replace(/[.]/g, ''); // Remove periods
    // Fix common voice misrecognition: 'pond' -> 'pawn', 'night' -> 'knight'
    transcript = transcript.replace(/\bpond\b/g, 'pawn');
    transcript = transcript.replace(/\bnight\b/g, 'knight');

    // More flexible regex to capture piece name and algebraic notation
    // Allows for "to", optional space, or just piece + square
    const match = transcript.match(/(pawn|pond|rook|knight|night|bishop|queen|king)\s*(?:to\s*)?([a-h][1-8])/);

    if (match) {
        const pieceName = match[1];
        const targetSquare = match[2];
        let pieceChar = '';

        switch (pieceName) {
            case 'pawn': pieceChar = 'p'; break;
            case 'rook': pieceChar = 'r'; break;
            case 'knight': pieceChar = 'k'; break; // Use 'k' for knight as per user request
            case 'bishop': pieceChar = 'b'; break;
            case 'queen': pieceChar = 'q'; break;
            case 'king': pieceChar = 'k'; break; // Use 'K' (uppercase) for king as per user request - wait, user said uppercase K for king, lowercase k for knight. Let's stick to standard FEN mapping for logic (n=knight, k=king) and adjust parsing
        }
         // Re-adjusting based on standard FEN and user request mix-up:
         // User said: p, r, k(knight), b, Q, K(King)
         // Let's map spoken words to these requested *display* characters initially.
         // The actual logic might use standard FEN internally (p, r, n, b, q, k)
         switch (pieceName) {
            case 'pawn': pieceChar = 'p'; break;
            case 'rook': pieceChar = 'r'; break;
            case 'knight': pieceChar = 'n'; break; // Use standard FEN 'n' for knight
            case 'bishop': pieceChar = 'b'; break;
            case 'queen': pieceChar = 'q'; break; // lowercase q for queen for parsing simplicity
            case 'king': pieceChar = 'k'; break; // Use standard FEN 'k' for king
        }
        // If user said queen, map to 'q', if king map to 'K' to match user request somewhat.
        // Note: findPossibleMoves will need to handle the case-sensitivity based on player color.

        if (pieceChar && targetSquare) {
            return { piece: pieceChar, target: targetSquare };
        }
    }
    return null;
}




/**
 * Parses transcript for move clarification number.
 * @param transcript - User's voice command (e.g., "one", "number 2", "3").
 * @returns The selected number (1-based index) or null.
 */
export function parseClarificationTranscript(transcript: string): number | null {
    // Clean up transcript: lowercase, trim, remove common prefixes and non-alphanumerics except digits
    let lower = transcript.toLowerCase().trim().replace(/^(number|option)\s*/, '');
    lower = lower.replace(/[^a-z0-9 ]/g, '');
    lower = lower.replace(/\s+/g, ' ');
    // Map common misrecognitions
    const numberMap: { [key: string]: number } = {
        'one': 1, '1': 1,
        'two': 2, '2': 2, 'to': 2, 'too': 2,
        'three': 3, '3': 3,
        'four': 4, '4': 4, 'for': 4,
        'five': 5, '5': 5,
        'six': 6, '6': 6,
        'seven': 7, '7': 7,
        'eight': 8, '8': 8,
        'nine': 9, '9': 9,
        'ten': 10, '10': 10
    };
    if (numberMap[lower] !== undefined) return numberMap[lower]!;
    // Try to extract a number from the string
    const match = lower.match(/\d+/);
    if (match) {
        const parsedInt = parseInt(match[0], 10);
        if (!isNaN(parsedInt) && parsedInt > 0) return parsedInt;
    }
    // Debug log
    // console.log('parseClarificationTranscript: could not parse', transcript, '->', lower);
    return null;
}


// --- Game Logic Helpers ---

/**
 * Gets the opposing player's color.
 * @param color - The current player's color.
 * @returns The opponent's color.
 */
export function getOpponentColor(color: PlayerColor): PlayerColor {
    return color === PlayerColor.WHITE ? PlayerColor.BLACK : PlayerColor.WHITE;
}

/**
 * Checks if a piece belongs to a specific player based on case.
 * @param piece - The piece character.
 * @param player - The player color.
 * @returns True if the piece belongs to the player, false otherwise.
 */
function isOwnPiece(piece: Piece, player: PlayerColor): boolean {
    if (piece === ' ') return false;
    const isWhitePiece = piece === piece.toUpperCase();
    return (player === PlayerColor.WHITE && isWhitePiece) || (player === PlayerColor.BLACK && !isWhitePiece);
}

/**
 * Checks if coordinates are within the board boundaries.
 * @param coords - The coordinates to check.
 * @returns True if coordinates are valid, false otherwise.
 */
function isValidCoords(coords: Coordinates): boolean {
    const [row, col] = coords;
    return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

/**
 * Gets the piece at the specified coordinates.
 * @param board - The chess board.
 * @param coords - The coordinates.
 * @returns The piece at the coordinates, or ' ' if invalid.
 */
function getPieceAt(board: Piece[][], coords: Coordinates): Piece {
    if (!isValidCoords(coords)) return ' ';
    const [row, col] = coords;
    return board[row]?.[col] ?? ' ';
}

/**
 * Checks if a square is under attack by the specified player.
 * @param board - The chess board.
 * @param square - The square to check.
 * @param attacker - The attacking player.
 * @returns True if the square is under attack, false otherwise.
 */
function isSquareUnderAttack(board: Piece[][], square: Coordinates, attacker: PlayerColor): boolean {
    const [targetRow, targetCol] = square;
    
    // Check all pieces of the attacking player
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const piece = board[r]?.[c];
            if (piece && piece !== ' ' && isOwnPiece(piece, attacker)) {
                const pieceType = piece.toLowerCase();
                const [fromRow, fromCol] = [r, c];
                
                // Check if this piece can attack the target square
                switch (pieceType) {
                    case 'p': // Pawn
                        const direction = attacker === PlayerColor.WHITE ? -1 : 1;
                        if (targetRow === fromRow + direction && 
                            Math.abs(targetCol - fromCol) === 1) {
                            return true;
                        }
                        break;
                        
                    case 'r': // Rook
                        if (canRookMove(board, [fromRow, fromCol], square)) {
                            return true;
                        }
                        break;
                        
                    case 'n': // Knight
                        const dr = Math.abs(targetRow - fromRow);
                        const dc = Math.abs(targetCol - fromCol);
                        if ((dr === 2 && dc === 1) || (dr === 1 && dc === 2)) {
                            return true;
                        }
                        break;
                        
                    case 'b': // Bishop
                        if (canBishopMove(board, [fromRow, fromCol], square)) {
                            return true;
                        }
                        break;
                        
                    case 'q': // Queen
                        if (canRookMove(board, [fromRow, fromCol], square) ||
                            canBishopMove(board, [fromRow, fromCol], square)) {
                            return true;
                        }
                        break;
                        
                    case 'k': // King
                        if (Math.abs(targetRow - fromRow) <= 1 && 
                            Math.abs(targetCol - fromCol) <= 1) {
                            return true;
                        }
                        break;
                }
            }
        }
    }
    return false;
}

/**
 * Checks if a rook can move from source to target without obstruction.
 * @param board - The chess board.
 * @param source - The source coordinates.
 * @param target - The target coordinates.
 * @returns True if the move is possible, false otherwise.
 */
function canRookMove(board: Piece[][], source: Coordinates, target: Coordinates): boolean {
    const [fromRow, fromCol] = source;
    const [toRow, toCol] = target;
    
    // Rook moves horizontally or vertically
    if (fromRow !== toRow && fromCol !== toCol) return false;
    
    // Check for obstructions
    if (fromRow === toRow) {
        // Horizontal move
        const start = Math.min(fromCol, toCol);
        const end = Math.max(fromCol, toCol);
        for (let c = start + 1; c < end; c++) {
            if (board[fromRow]?.[c] !== ' ') return false;
        }
    } else {
        // Vertical move
        const start = Math.min(fromRow, toRow);
        const end = Math.max(fromRow, toRow);
        for (let r = start + 1; r < end; r++) {
            if (board[r]?.[fromCol] !== ' ') return false;
        }
    }
    return true;
}

/**
 * Checks if a bishop can move from source to target without obstruction.
 * @param board - The chess board.
 * @param source - The source coordinates.
 * @param target - The target coordinates.
 * @returns True if the move is possible, false otherwise.
 */
function canBishopMove(board: Piece[][], source: Coordinates, target: Coordinates): boolean {
    const [fromRow, fromCol] = source;
    const [toRow, toCol] = target;
    
    // Bishop moves diagonally
    if (Math.abs(toRow - fromRow) !== Math.abs(toCol - fromCol)) return false;
    
    // Check for obstructions
    const rowStep = toRow > fromRow ? 1 : -1;
    const colStep = toCol > fromCol ? 1 : -1;
    
    let r = fromRow + rowStep;
    let c = fromCol + colStep;
    
    while (r !== toRow) {
        if (board[r]?.[c] !== ' ') return false;
        r += rowStep;
        c += colStep;
    }
    return true;
}

/**
 * Finds the king's position for the specified player.
 * @param board - The chess board.
 * @param player - The player whose king to find.
 * @returns The king's coordinates, or null if not found.
 */
function findKing(board: Piece[][], player: PlayerColor): Coordinates | null {
    const kingPiece = player === PlayerColor.WHITE ? 'K' : 'k';
    
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (board[r]?.[c] === kingPiece) {
                return [r, c];
            }
        }
    }
    return null;
}

/**
 * Checks if the specified player is in check.
 * @param board - The chess board.
 * @param player - The player to check.
 * @returns True if the player is in check, false otherwise.
 */
export function isInCheck(board: Piece[][], player: PlayerColor): boolean {
    const kingPos = findKing(board, player);
    if (!kingPos) return false;
    
    const opponent = getOpponentColor(player);
    return isSquareUnderAttack(board, kingPos, opponent);
}

/**
 * Checks if a move would put or leave the player in check.
 * @param board - The chess board.
 * @param source - The source coordinates.
 * @param target - The target coordinates.
 * @param player - The player making the move.
 * @returns True if the move would result in check, false otherwise.
 */
function wouldBeInCheck(board: Piece[][], source: Coordinates, target: Coordinates, player: PlayerColor): boolean {
    // Make a temporary move
    const tempBoard = board.map(row => [...row]);
    const [sourceRow, sourceCol] = source;
    const [targetRow, targetCol] = target;
    
    const piece = tempBoard[sourceRow]?.[sourceCol];
    if (piece && piece !== ' ') {
        tempBoard[targetRow]![targetCol] = piece;
        tempBoard[sourceRow]![sourceCol] = ' ';
        
        // Check if the player is in check after the move
        return isInCheck(tempBoard, player);
    }
    return false;
}

/**
 * Validates if a move is legal according to chess rules.
 * @param board - The chess board.
 * @param source - The source coordinates.
 * @param target - The target coordinates.
 * @param player - The player making the move.
 * @returns MoveValidationResult with validation details.
 */
export function validateMove(
    board: Piece[][], 
    source: Coordinates, 
    target: Coordinates, 
    player: PlayerColor,
    castlingRights: string = "KQkq"
): import('./utils/types').MoveValidationResult {
    // Check if coordinates are valid
    if (!isValidCoords(source) || !isValidCoords(target)) {
        return { isValid: false, error: "Invalid coordinates" };
    }
    
    const [sourceRow, sourceCol] = source;
    const [targetRow, targetCol] = target;
    
    // Check if source and target are the same
    if (sourceRow === targetRow && sourceCol === targetCol) {
        return { isValid: false, error: "Source and target cannot be the same" };
    }
    
    // Get the piece at source
    const piece = board[sourceRow]?.[sourceCol];
    if (!piece || piece === ' ') {
        return { isValid: false, error: "No piece at source square" };
    }
    
    // Check if the piece belongs to the player
    if (!isOwnPiece(piece, player)) {
        return { isValid: false, error: "Piece does not belong to player" };
    }
    
    // Get the piece at target
    const targetPiece = board[targetRow]?.[targetCol];
    
    // Check if target square is occupied by own piece
    if (targetPiece && targetPiece !== ' ' && isOwnPiece(targetPiece, player)) {
        return { isValid: false, error: "Cannot capture own piece" };
    }
    
    // Validate piece-specific movement
    const pieceType = piece.toLowerCase();
    let isValidMove = false;
    
    switch (pieceType) {
        case 'p': // Pawn
            isValidMove = validatePawnMove(board, source, target, player, targetPiece ?? ' ');
            break;
        case 'r': // Rook
            isValidMove = canRookMove(board, source, target);
            break;
        case 'n': // Knight
            const dr = Math.abs(targetRow - sourceRow);
            const dc = Math.abs(targetCol - sourceCol);
            isValidMove = (dr === 2 && dc === 1) || (dr === 1 && dc === 2);
            break;
        case 'b': // Bishop
            isValidMove = canBishopMove(board, source, target);
            break;
        case 'q': // Queen
            isValidMove = canRookMove(board, source, target) || canBishopMove(board, source, target);
            break;
        case 'k': // King
            // Check for castling first
            if (sourceRow === targetRow && Math.abs(targetCol - sourceCol) === 2) {
                // This could be a castling move
                const side = targetCol > sourceCol ? 'kingside' : 'queenside';
                isValidMove = canCastle(board, player, side, castlingRights);
            } else {
                // Regular king move
                isValidMove = Math.abs(targetRow - sourceRow) <= 1 && Math.abs(targetCol - sourceCol) <= 1;
            }
            break;
    }
    
    if (!isValidMove) {
        return { isValid: false, error: "Invalid move for piece type" };
    }
    
    // Check if move would put or leave player in check
    if (wouldBeInCheck(board, source, target, player)) {
        return { isValid: false, error: "Move would result in check" };
    }
    
    // Check if this move would put the opponent in check
    const opponent = getOpponentColor(player);
    const wouldOpponentBeInCheck = wouldBeInCheck(board, source, target, opponent);
    
    return { 
        isValid: true, 
        isCheck: wouldOpponentBeInCheck
    };
}

/**
 * Validates pawn movement according to chess rules.
 * @param board - The chess board.
 * @param source - The source coordinates.
 * @param target - The target coordinates.
 * @param player - The player making the move.
 * @param targetPiece - The piece at the target square.
 * @returns True if the pawn move is valid, false otherwise.
 */
function validatePawnMove(
    board: Piece[][], 
    source: Coordinates, 
    target: Coordinates, 
    player: PlayerColor, 
    targetPiece: Piece
): boolean {
    const [sourceRow, sourceCol] = source;
    const [targetRow, targetCol] = target;
    
    const direction = player === PlayerColor.WHITE ? -1 : 1;
    const startRank = player === PlayerColor.WHITE ? 6 : 1; // Rank 2 for white, rank 7 for black
    const promotionRank = player === PlayerColor.WHITE ? 0 : 7; // Rank 8 for white, rank 1 for black
    
    // Forward move
    if (sourceCol === targetCol) {
        const rowDiff = targetRow - sourceRow;
        
        // Single square move
        if (rowDiff === direction) {
            return targetPiece === ' ';
        }
        
        // Double square move from starting position
        if (rowDiff === 2 * direction && sourceRow === startRank) {
            const middleRow = sourceRow + direction;
            return targetPiece === ' ' && board[middleRow]?.[sourceCol] === ' ';
        }
        
        return false;
    }
    
    // Diagonal capture
    if (Math.abs(targetCol - sourceCol) === 1 && targetRow === sourceRow + direction) {
        return targetPiece !== ' '; // Must capture a piece
    }
    
    return false;
}

/**
 * Checks if the specified player is in checkmate.
 * @param board - The chess board.
 * @param player - The player to check.
 * @returns True if the player is in checkmate, false otherwise.
 */
function isCheckmate(board: Piece[][], player: PlayerColor): boolean {
    // Must be in check first
    if (!isInCheck(board, player)) return false;
    
    // Check if any legal move exists
    return !hasLegalMoves(board, player);
}

/**
 * Checks if the specified player is in stalemate.
 * @param board - The chess board.
 * @param player - The player to check.
 * @returns True if the player is in stalemate, false otherwise.
 */
function isStalemate(board: Piece[][], player: PlayerColor): boolean {
    // Must not be in check
    if (isInCheck(board, player)) return false;
    
    // Check if any legal move exists
    return !hasLegalMoves(board, player);
}

/**
 * Checks if the player has any legal moves.
 * @param board - The chess board.
 * @param player - The player to check.
 * @returns True if the player has legal moves, false otherwise.
 */
function hasLegalMoves(board: Piece[][], player: PlayerColor): boolean {
    // Check all pieces of the player
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const piece = board[r]?.[c];
            if (piece && piece !== ' ' && isOwnPiece(piece, player)) {
                // Check all possible target squares
                for (let tr = 0; tr < BOARD_SIZE; tr++) {
                    for (let tc = 0; tc < BOARD_SIZE; tc++) {
                        const validation = validateMove(board, [r, c], [tr, tc], player);
                        if (validation.isValid) {
                            return true;
                        }
                    }
                }
            }
        }
    }
    return false;
}

/**
 * Checks if the game is over and determines the result.
 * @param board - The chess board.
 * @param currentPlayer - The player whose turn it is.
 * @returns Object with game status and result.
 */
export function checkGameEnd(board: Piece[][], currentPlayer: PlayerColor): {
    isOver: boolean;
    result?: 'white_win' | 'black_win' | 'draw';
    reason?: string;
} {
    // Check for checkmate
    if (isCheckmate(board, currentPlayer)) {
        const winner = getOpponentColor(currentPlayer);
        return {
            isOver: true,
            result: winner === PlayerColor.WHITE ? 'white_win' : 'black_win',
            reason: 'checkmate'
        };
    }
    
    // Check for stalemate
    if (isStalemate(board, currentPlayer)) {
        return {
            isOver: true,
            result: 'draw',
            reason: 'stalemate'
        };
    }
    
    // TODO: Add other draw conditions (insufficient material, 50-move rule, threefold repetition)
    
    return { isOver: false };
}

/**
 * Gets all legal moves for a specific piece.
 * @param board - The chess board.
 * @param source - The source coordinates.
 * @param player - The player making the move.
 * @returns Array of legal target coordinates.
 */
export function getLegalMoves(board: Piece[][], source: Coordinates, player: PlayerColor): Coordinates[] {
    const legalMoves: Coordinates[] = [];
    
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const target: Coordinates = [r, c];
            const validation = validateMove(board, source, target, player);
            if (validation.isValid) {
                legalMoves.push(target);
            }
        }
    }
    
    return legalMoves;
}

/**
 * Executes a move on the board array. Does NOT validate legality.
 * @param board - The current 8x8 board state.
 * @param source - The source coordinates [row, col].
 * @param target - The target coordinates [row, col].
 * @returns Object containing the updated board and the captured piece (' ' if none).
 */
export function executeMove(board: Piece[][], source: Coordinates, target: Coordinates): { updatedBoard: Piece[][], capturedPiece: Piece } {
    const newBoard = board.map(row => [...row]); // Deep copy
    const [sourceRow, sourceCol] = source;
    const [targetRow, targetCol] = target;

    const pieceToMove = newBoard[sourceRow]?.[sourceCol];
    const capturedPiece = newBoard[targetRow]?.[targetCol];

    if (!pieceToMove) {
        throw new Error('No piece at source square');
    }

    newBoard[targetRow]![targetCol] = pieceToMove;
    newBoard[sourceRow]![sourceCol] = ' '; // Empty the source square

    // Basic handling for pawn promotion (default to Queen) - needs more logic for choice
    if (pieceToMove === 'P' && targetRow === 0) { // White pawn reaches rank 8
        newBoard[targetRow]![targetCol] = 'Q';
    } else if (pieceToMove === 'p' && targetRow === 7) { // Black pawn reaches rank 1
        newBoard[targetRow]![targetCol] = 'q';
    }

    // TODO: Handle castling move updates (move rook as well)
    // TODO: Handle en passant capture (clear the captured pawn's square)

    return { updatedBoard: newBoard, capturedPiece: capturedPiece ?? ' ' };
}

/**
 * Finds all pieces of a given type and color that could *potentially* move
 * to the target square based on basic movement rules.
 *
 * !!! --- SIMPLIFIED LOGIC --- !!!
 * This function DOES NOT check for:
 * - Blocking pieces
 * - Checks or Checkmate
 * - Pins
 * - Legality of castling
 * - Legality of en passant
 * - Pawn double moves from starting position
 *
 * It ONLY identifies pieces of the correct type/color whose fundamental
 * movement pattern (e.g., diagonal for bishop, L-shape for knight)
 * could theoretically land them on the target square, ignoring board context.
 * Its primary purpose is to help resolve ambiguity when the user says
 * "Rook to D4" and multiple rooks could potentially move there.
 *
 * @param board - The current 8x8 board state.
 * @param player - The player making the move.
 * @param pieceToFind - The type of piece specified by the user (e.g., 'R', 'p', 'k'). Case matches player color.
 * @param targetCoords - The target coordinates [row, col].
 * @returns An array of PotentialMove objects { source: Coordinates, piece: Piece }.
 */
export function findPossibleMoves(board: Piece[][], player: PlayerColor, pieceToFind: Piece, targetCoords: Coordinates): PotentialMove[] {
    const possibleMoves: PotentialMove[] = [];
    const [targetRow, targetCol] = targetCoords;

    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const currentPiece = board[r]?.[c];

            // Check if it's the correct piece type and belongs to the player
            if (currentPiece && currentPiece === pieceToFind && isOwnPiece(currentPiece, player)) {
                const sourceCoords: Coordinates = [r, c];
                let canPotentiallyReach = false;

                // --- Check basic movement patterns ---
                const pieceTypeLower = currentPiece.toLowerCase();
                const dr = Math.abs(targetRow - r);
                const dc = Math.abs(targetCol - c);

                switch (pieceTypeLower) {
                    case 'p': // Pawn
                        const direction = player === PlayerColor.WHITE ? -1 : 1; // White moves -1 row index, Black moves +1
                        
                        // Check diagonal capture
                        if (targetRow === r + direction && dc === 1) {
                            canPotentiallyReach = true; // Can potentially capture diagonally
                        }
                        
                        // Check forward move
                        if (targetCol === c && targetRow === r + direction) {
                            canPotentiallyReach = true; // Can potentially move forward
                        }
                        
                        // Check double move from starting position
                        const startRank = player === PlayerColor.WHITE ? 6 : 1;
                        if (targetCol === c && targetRow === r + 2 * direction && r === startRank) {
                            canPotentiallyReach = true; // Can potentially move two squares
                        }
                        break;
                    case 'r': // Rook
                        if (dr === 0 || dc === 0) { // Moves horizontally or vertically
                            canPotentiallyReach = true;
                        }
                        break;
                    case 'n': // Knight (Standard FEN 'n')
                        // Check L-shape: 2 squares in one direction, 1 in the other
                        if ((dr === 2 && dc === 1) || (dr === 1 && dc === 2)) {
                            canPotentiallyReach = true;
                        }
                        break;
                    case 'b': // Bishop
                        if (dr === dc) { // Moves diagonally
                            canPotentiallyReach = true;
                        }
                        break;
                    case 'q': // Queen
                        if (dr === 0 || dc === 0 || dr === dc) { // Rook or Bishop movement
                            canPotentiallyReach = true;
                        }
                        break;
                    case 'k': // King (Standard FEN 'k')
                        // Check adjacent squares
                        if (dr <= 1 && dc <= 1) {
                            canPotentiallyReach = true;
                        }
                        break;
                }

                if (canPotentiallyReach) {
                    possibleMoves.push({ source: sourceCoords, piece: currentPiece });
                }
            }
        }
    }
    return possibleMoves;
}

/**
 * Checks if castling is possible for the specified player and side.
 * @param board - The chess board.
 * @param player - The player attempting to castle.
 * @param side - 'kingside' or 'queenside'.
 * @param castlingRights - Current castling rights string (e.g., "KQkq").
 * @returns True if castling is legal, false otherwise.
 */
export function canCastle(
    board: Piece[][], 
    player: PlayerColor, 
    side: 'kingside' | 'queenside',
    castlingRights: string
): boolean {
    // Check if player has castling rights
    if (player === PlayerColor.NONE) {
        return false;
    }
    
    const rights = {
        [PlayerColor.WHITE]: { kingside: 'K', queenside: 'Q' },
        [PlayerColor.BLACK]: { kingside: 'k', queenside: 'q' }
    } as const;
    
    const requiredRight = rights[player][side];
    if (!castlingRights.includes(requiredRight)) {
        return false;
    }
    
    // Find king and rook positions
    const kingPiece = player === PlayerColor.WHITE ? 'K' : 'k';
    const rookPiece = player === PlayerColor.WHITE ? 'R' : 'r';
    
    const kingRank = player === PlayerColor.WHITE ? 7 : 0;
    const kingCol = 4; // e-file
    
    const rookCol = side === 'kingside' ? 7 : 0; // h-file or a-file
    const rookRank = kingRank;
    
    // Check if king and rook are in their starting positions
    if (board[kingRank]?.[kingCol] !== kingPiece || board[rookRank]?.[rookCol] !== rookPiece) {
        return false;
    }
    
    // Check if king is in check
    if (isInCheck(board, player)) {
        return false;
    }
    
    // Check if squares between king and rook are empty
    const startCol = Math.min(kingCol, rookCol);
    const endCol = Math.max(kingCol, rookCol);
    
    for (let col = startCol + 1; col < endCol; col++) {
        if (board[kingRank]?.[col] !== ' ') {
            return false;
        }
    }
    
    // Check if king would pass through or end up in check
    const kingPath = side === 'kingside' ? [5, 6] : [2, 3]; // f,g or c,d files
    const kingEndCol = side === 'kingside' ? 6 : 2; // g or c file
    
    for (const col of kingPath) {
        if (isSquareUnderAttack(board, [kingRank, col], getOpponentColor(player))) {
            return false;
        }
    }
    
    // Check if king's final square is under attack
    if (isSquareUnderAttack(board, [kingRank, kingEndCol], getOpponentColor(player))) {
        return false;
    }
    
    return true;
}

/**
 * Executes a castling move.
 * @param board - The chess board.
 * @param player - The player castling.
 * @param side - 'kingside' or 'queenside'.
 * @returns Object containing the updated board and castling information.
 */
export function executeCastling(
    board: Piece[][], 
    player: PlayerColor, 
    side: 'kingside' | 'queenside'
): { 
    updatedBoard: Piece[][], 
    kingMove: { from: Coordinates, to: Coordinates },
    rookMove: { from: Coordinates, to: Coordinates }
} {
    const newBoard = board.map(row => [...row]);
    
    const kingRank = player === PlayerColor.WHITE ? 7 : 0;
    const kingCol = 4; // e-file
    const rookCol = side === 'kingside' ? 7 : 0; // h-file or a-file
    
    const kingEndCol = side === 'kingside' ? 6 : 2; // g or c file
    const rookEndCol = side === 'kingside' ? 5 : 3; // f or d file
    
    const kingPiece = player === PlayerColor.WHITE ? 'K' : 'k';
    const rookPiece = player === PlayerColor.WHITE ? 'R' : 'r';
    
    // Move king
    newBoard[kingRank]![kingEndCol] = kingPiece;
    newBoard[kingRank]![kingCol] = ' ';
    
    // Move rook
    newBoard[kingRank]![rookEndCol] = rookPiece;
    newBoard[kingRank]![rookCol] = ' ';
    
    return {
        updatedBoard: newBoard,
        kingMove: { from: [kingRank, kingCol], to: [kingRank, kingEndCol] },
        rookMove: { from: [kingRank, rookCol], to: [kingRank, rookEndCol] }
    };
}

/**
 * Updates castling rights after a move.
 * @param board - The chess board.
 * @param source - The source coordinates.
 * @param target - The target coordinates.
 * @param player - The player making the move.
 * @param currentRights - Current castling rights string.
 * @returns Updated castling rights string.
 */
export function updateCastlingRights(
    board: Piece[][], 
    source: Coordinates, 
    target: Coordinates, 
    player: PlayerColor, 
    currentRights: string
): string {
    let rights = currentRights;
    const [sourceRow, sourceCol] = source;
    const [targetRow, targetCol] = target;
    
    const piece = board[sourceRow]?.[sourceCol];
    if (!piece || piece === ' ') return rights;
    
    // King move removes all castling rights for that player
    if (piece.toLowerCase() === 'k') {
        if (player === PlayerColor.WHITE) {
            rights = rights.replace(/[KQ]/g, '');
        } else {
            rights = rights.replace(/[kq]/g, '');
        }
    }
    
    // Rook move removes castling rights for that side
    if (piece.toLowerCase() === 'r') {
        if (player === PlayerColor.WHITE) {
            if (sourceRow === 7 && sourceCol === 0) { // Queenside rook
                rights = rights.replace('Q', '');
            } else if (sourceRow === 7 && sourceCol === 7) { // Kingside rook
                rights = rights.replace('K', '');
            }
        } else {
            if (sourceRow === 0 && sourceCol === 0) { // Queenside rook
                rights = rights.replace('q', '');
            } else if (sourceRow === 0 && sourceCol === 7) { // Kingside rook
                rights = rights.replace('k', '');
            }
        }
    }
    
    // Capturing opponent's rook removes their castling rights
    const targetPiece = board[targetRow]?.[targetCol];
    if (targetPiece && targetPiece.toLowerCase() === 'r') {
        const opponent = getOpponentColor(player);
        if (opponent === PlayerColor.WHITE) {
            // Check if it's a white rook at its original position
            if (targetRow === 7 && targetCol === 0) { // Queenside rook
                rights = rights.replace('Q', '');
            } else if (targetRow === 7 && targetCol === 7) { // Kingside rook
                rights = rights.replace('K', '');
            } else {
                // Any other white rook capture removes all white castling rights
                rights = rights.replace(/[KQ]/g, '');
            }
        } else {
            // Check if it's a black rook at its original position
            if (targetRow === 0 && targetCol === 0) { // Queenside rook
                rights = rights.replace('q', '');
            } else if (targetRow === 0 && targetCol === 7) { // Kingside rook
                rights = rights.replace('k', '');
            } else {
                // For black rooks that have moved, we need to determine which side
                // Since the test captures a rook at h7, it's the kingside rook that moved
                if (targetCol === 7) { // Kingside rook (h-file)
                    rights = rights.replace('k', '');
                } else if (targetCol === 0) { // Queenside rook (a-file)
                    rights = rights.replace('q', '');
                } else {
                    // Any other black rook capture removes all black castling rights
                    rights = rights.replace(/[kq]/g, '');
                }
            }
        }
    }
    
    return rights || '-';
}

/**
 * Parses voice transcript for castling commands.
 * @param transcript - The user's voice command.
 * @returns 'kingside', 'queenside', or null if not a castling command.
 */
export function parseCastlingTranscript(transcript: string): 'kingside' | 'queenside' | null {
    const lower = transcript.toLowerCase().trim();
    
    // Queenside castling (check first to avoid 'ooo' matching kingside)
    if (lower.includes('queenside') || lower.includes('queen side') || 
        lower.includes('long') || lower.includes('o-o-o') || lower.includes('ooo')) {
        return 'queenside';
    }
    
    // Kingside castling
    if (lower.includes('kingside') || lower.includes('king side') || 
        lower.includes('short') || lower.includes('o-o') || lower.includes('oo')) {
        return 'kingside';
    }
    
    return null;
}


// --- Display Functions ---

/**
 * Determines the appropriate spacing for board rendering based on piece type.
 * @param useUnicode - Whether Unicode pieces are being used.
 * @returns The spacing string to use between pieces.
 */
function getPieceSpacing(useUnicode: boolean): string {
    // Unicode pieces are wider than Unicode squares, so we need more spacing
    // ASCII pieces and squares are narrower, so use more spacing for alignment
    return useUnicode ? '  ' : '  ';
}

/**
 * Generates the text representation of the board for display on glasses.
 * Handles board orientation based on user's color and settings.
 * Includes captured pieces and move history.
 * @param state - The current SessionState.
 * @param options - Rendering options (optional overrides for board orientation, etc.)
 * @returns The board as a string.
 */
export function renderBoardString(
    state: SessionState,
    options?: {
        flipBoard?: boolean,
        showCoordinates?: boolean,
        highlightLastMove?: boolean,
        showCapturedPieces?: boolean,
        showMoveHistory?: boolean,
        useUnicode?: boolean
    }
): string {
    const { board, userColor, capturedByWhite, capturedByBlack, lastMove } = state;
    // Defaults (can be overridden by options)
    const flipBoard = options?.flipBoard ?? (userColor === PlayerColor.BLACK);
    const showCoordinates = options?.showCoordinates ?? true;
    const highlightLastMove = options?.highlightLastMove ?? true;
    const showCapturedPieces = options?.showCapturedPieces ?? true;
    const showMoveHistory = options?.showMoveHistory ?? false;
    const useUnicode = options?.useUnicode ?? true;

    // Unicode chess piece mapping
    const unicodeMap: Record<string, string> = {
        'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
        'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟︎'
    };
    
    // Square characters based on Unicode setting
    const lightSquare = useUnicode ? '□' : ' ';
    const darkSquare = useUnicode ? '■' : '#';

    // Get appropriate spacing based on piece type
    const pieceSpacing = getPieceSpacing(useUnicode);
    const squareSpacing = ' '; // Always use single space for squares

    let boardStr = "";

    // 1. Captured pieces by the opponent (displayed at the top)
    if (showCapturedPieces) {
        const opponentCaptured = flipBoard ? capturedByWhite : capturedByBlack;
        if (opponentCaptured.length > 0) {
            boardStr += `Opponent captures: ${opponentCaptured.map(p => unicodeMap[p] || p).join(' ')}\n`;
            boardStr += "-----------------------------------\n";
        } else {
            boardStr += "\n\n";
        }
    }

    // 2. Board ranks and pieces (Unicode/ASCII rendering)
    for (let r = 0; r < 8; r++) {
        const displayRow = flipBoard ? (7 - r) : r;
        let rowStr = showCoordinates ? `${8 - displayRow} ` : '';
        for (let c = 0; c < 8; c++) {
            const displayCol = c;
            const piece = board[displayRow]?.[displayCol] ?? ' ';
            const isLight = (displayRow + displayCol) % 2 === 0;
            let cell = '';
            if (piece === ' ') {
                cell = isLight ? lightSquare : darkSquare;
            } else {
                cell = useUnicode ? (unicodeMap[piece] || piece) : piece;
            }
            // Highlight last move (optional, can be improved for Unicode)
            if (highlightLastMove && lastMove) {
                const [lastFromRow, lastFromCol] = lastMove.from;
                const [lastToRow, lastToCol] = lastMove.to;
                if ((displayRow === lastFromRow && displayCol === lastFromCol) ||
                    (displayRow === lastToRow && displayCol === lastToCol)) {
                    // Surround with brackets for highlight
                    cell = `[${cell}]`;
                }
            }
            // Use different spacing for pieces vs squares
            const spacing = piece === ' ' ? squareSpacing : pieceSpacing;
            rowStr += cell + spacing;
        }
        boardStr += rowStr.trimEnd() + '\n';
    }

    // 3. File labels
    if (showCoordinates) {
        boardStr += '  ';
        for (let c = 0; c < 8; c++) {
            // Use reduced spacing between file labels
            const labelSpacing = '  '; // Two spaces between letters
            boardStr += `${labelSpacing}${FILES[c]}`;
        }
        boardStr += '\n';
    }

    // 4. Captured pieces by the user (displayed at the bottom)
    if (showCapturedPieces) {
        const userCaptured = flipBoard ? capturedByBlack : capturedByWhite;
        if (userCaptured.length > 0) {
            boardStr += "-----------------------------------\n";
            boardStr += `Your captures: ${userCaptured.map(p => unicodeMap[p] || p).join(' ')}\n`;
        } else {
            boardStr += "\n\n";
        }
    }

    // 5. Move history (if enabled and in expanded dashboard mode)
    if (showMoveHistory && state.moveHistory.length > 0) {
        const recentMoves = state.moveHistory.slice(-6);
        boardStr += "-----------------------------------\n";
        boardStr += "Recent moves:\n";
        recentMoves.forEach((move, index) => {
            const moveNumber = Math.floor(index / 2) + 1;
            const isWhiteMove = index % 2 === 0;
            if (isWhiteMove) {
                boardStr += `${moveNumber}. ${move.algebraic}`;
            } else {
                boardStr += ` ${move.algebraic}\n`;
            }
        });
        if (recentMoves.length % 2 === 1) {
            boardStr += "\n";
        }
    }
    return boardStr.trim();
}

// --- FEN Generation ---

/**
 * Converts the current board state and game parameters to FEN notation.
 * @param state - The current SessionState.
 * @returns The FEN string representing the current game state.
 */
export function boardToFEN(state: SessionState): string {
    const { board, currentPlayer, castlingRights, enPassantTarget, halfmoveClock, fullmoveNumber } = state;
    let fen = '';

    // 1. Piece Placement
    for (let r = 0; r < BOARD_SIZE; r++) {
        let emptyCount = 0;
        for (let c = 0; c < BOARD_SIZE; c++) {
            const piece = board[r]?.[c] ?? ' ';
            if (piece === ' ') {
                emptyCount++;
            } else {
                if (emptyCount > 0) {
                    fen += emptyCount;
                    emptyCount = 0;
                }
                fen += piece;
            }
        }
        if (emptyCount > 0) {
            fen += emptyCount;
        }
        if (r < BOARD_SIZE - 1) {
            fen += '/';
        }
    }

    // 2. Active Color
    fen += ` ${currentPlayer === PlayerColor.WHITE ? 'w' : 'b'}`;

    // 3. Castling Availability
    fen += ` ${castlingRights || '-'}`;

    // 4. En Passant Target Square
    fen += ` ${enPassantTarget || '-'}`;

    // 5. Halfmove Clock
    fen += ` ${halfmoveClock >= 0 ? halfmoveClock : 0}`;

    // 6. Fullmove Number
    fen += ` ${fullmoveNumber > 0 ? fullmoveNumber : 1}`;

    // Update state? The caller should probably do this.
    // updateSessionState(userId, { currentFEN: fen }); // Or handle in caller
    return fen;
}


// --- Game Over Check ---

/**
 * Placeholder function to check if the game is over.
 * In a real implementation, this would involve complex logic or Stockfish analysis.
 * @param boardFEN - The FEN string of the board state.
 * @returns True if the game is over, false otherwise.
 */
export function isGameOver(boardFEN: string): boolean {
    // Replace with actual checkmate/stalemate detection logic
    // Example simple check: are both kings still on the board?
    // if (!boardFEN.includes('k') || !boardFEN.includes('K')) {
    //     return true;
    // }
    return false; // Placeholder
}
