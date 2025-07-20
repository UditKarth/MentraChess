import { 
    initializeBoard, 
    validateMove, 
    checkGameEnd, 
    getLegalMoves,
    isInCheck
} from '../chess_logic';
import { PlayerColor, Coordinates, Piece } from '../utils/types';

describe('Move Validation Tests', () => {
    let board: Piece[][];

    beforeEach(() => {
        board = initializeBoard();
    });

    describe('Basic Move Validation', () => {
        test('should validate valid pawn move', () => {
            const result = validateMove(board, [6, 4], [4, 4], PlayerColor.WHITE); // e2 to e4
            expect(result.isValid).toBe(true);
        });

        test('should reject invalid pawn move', () => {
            const result = validateMove(board, [6, 4], [3, 4], PlayerColor.WHITE); // e2 to e5 (too far)
            expect(result.isValid).toBe(false);
            expect(result.error).toBe('Invalid move for piece type');
        });

        test('should reject moving opponent piece', () => {
            const result = validateMove(board, [1, 4], [3, 4], PlayerColor.WHITE); // e7 to e5 (black pawn)
            expect(result.isValid).toBe(false);
            expect(result.error).toBe('Piece does not belong to player');
        });

        test('should reject moving to occupied square with own piece', () => {
            const result = validateMove(board, [6, 4], [6, 3], PlayerColor.WHITE); // e2 to d2 (occupied)
            expect(result.isValid).toBe(false);
            expect(result.error).toBe('Cannot capture own piece');
        });

        test('should reject moving from empty square', () => {
            const result = validateMove(board, [4, 4], [5, 4], PlayerColor.WHITE); // e4 to e5 (empty)
            expect(result.isValid).toBe(false);
            expect(result.error).toBe('No piece at source square');
        });
    });

    describe('Piece-Specific Validation', () => {
        test('should validate knight move', () => {
            const result = validateMove(board, [7, 1], [5, 2], PlayerColor.WHITE); // Nb1 to Nc3
            expect(result.isValid).toBe(true);
        });

        test('should validate bishop move', () => {
            // Clear the path for bishop from c1 to g5
            board[6]![3] = ' '; // Clear d2
            board[5]![4] = ' '; // Clear e3
            board[4]![5] = ' '; // Clear f4
            
            const result = validateMove(board, [7, 2], [3, 6], PlayerColor.WHITE); // Bc1 to Bg5
            expect(result.isValid).toBe(true);
        });

        test('should validate rook move', () => {
            // Clear the path for rook from a1 to a3
            board[6]![0] = ' '; // Clear a2
            
            const result = validateMove(board, [7, 0], [5, 0], PlayerColor.WHITE); // Ra1 to Ra3
            expect(result.isValid).toBe(true);
        });

        test('should validate queen move', () => {
            // Clear the path for queen from d1 to a4 (diagonal move)
            board[6]![2] = ' '; // Clear c2
            board[5]![1] = ' '; // Clear b3
            
            const result = validateMove(board, [7, 3], [4, 0], PlayerColor.WHITE); // Qd1 to Qa4
            expect(result.isValid).toBe(true);
        });

        test('should validate king move', () => {
            // First move pawn to clear king path
            board[6]![4] = ' '; // Clear e2
            board[5]![4] = 'P'; // Move pawn to e3
            
            const result = validateMove(board, [7, 4], [6, 4], PlayerColor.WHITE); // Ke1 to Ke2
            expect(result.isValid).toBe(true);
        });
    });

    describe('Check Detection', () => {
        test('should detect check', () => {
            // Set up a position where white is in check
            board = [
                ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
                ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
                [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
                [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
                [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
                [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
                ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
                ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
            ];
            
            // Move black queen to attack white king
            board[1]![3] = ' '; // Clear d7
            board[6]![4] = ' '; // Clear e2 (remove white pawn)
            board[4]![4] = 'q'; // Move queen to e4 (attacking e1)
            
            // Check if white is in check by using isInCheck directly
            const isWhiteInCheck = isInCheck(board, PlayerColor.WHITE);

            expect(isWhiteInCheck).toBe(true);
        });

        test('should reject move that puts own king in check', () => {
            // Set up position where moving a piece would put own king in check
            board = [
                ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
                ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
                [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
                [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
                [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
                [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
                ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
                ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
            ];
            
            // Move black queen to attack e1
            board[1]![3] = ' '; // Clear d7
            board[6]![4] = ' '; // Clear e2 (remove white pawn)
            board[5]![4] = 'P'; // Place white pawn at e3
            board[4]![4] = 'q'; // Move queen to e4
            board[4]![5] = 'p'; // Place black pawn at f4 for capture
            
            // Try to move white pawn diagonally, which would leave king in check
            const result = validateMove(board, [5, 4], [4, 5], PlayerColor.WHITE); // e3 to f4 (diagonal capture)
            expect(result.isValid).toBe(false);
            expect(result.error).toBe('Move would result in check');
        });
    });

    describe('Game End Detection', () => {
        test('should detect checkmate', () => {
            // Set up a simple checkmate position (fool's mate)
            board = [
                ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
                ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
                [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
                [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
                [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
                [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
                ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
                ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
            ];
            
            // Move white pawn to f3
            board[6]![5] = ' '; // Clear f2
            board[5]![5] = 'P'; // Move pawn to f3
            
            // Move black pawn to e5
            board[1]![4] = ' '; // Clear e7
            board[3]![4] = 'p'; // Move pawn to e5
            
            // Move white pawn to g4
            board[6]![6] = ' '; // Clear g2
            board[4]![6] = 'P'; // Move pawn to g4
            
            // Move black queen to h4 (checkmate)
            board[1]![3] = ' '; // Clear d7
            board[4]![7] = 'q'; // Move queen to h4
            
            const result = checkGameEnd(board, PlayerColor.WHITE);
            expect(result.isOver).toBe(true);
            expect(result.result).toBe('black_win');
            expect(result.reason).toBe('checkmate');
        });

        test.skip('should detect stalemate', () => {
            // TODO: Create a proper stalemate position
            // This test is complex and needs a valid stalemate setup
            expect(true).toBe(true);
        });

        test('should not detect game end in normal position', () => {
            const result = checkGameEnd(board, PlayerColor.WHITE);
            expect(result.isOver).toBe(false);
        });
    });

    describe('Legal Moves Generation', () => {
        test('should generate legal moves for pawn', () => {
            const legalMoves = getLegalMoves(board, [6, 4], PlayerColor.WHITE); // e2 pawn
            expect(legalMoves).toContainEqual([4, 4]); // e4
            expect(legalMoves).toContainEqual([5, 4]); // e3
        });

        test('should generate legal moves for knight', () => {
            const legalMoves = getLegalMoves(board, [7, 1], PlayerColor.WHITE); // Nb1
            expect(legalMoves).toContainEqual([5, 2]); // Nc3
            expect(legalMoves).toContainEqual([5, 0]); // Na3
        });

        test('should return empty array for blocked piece', () => {
            const legalMoves = getLegalMoves(board, [7, 0], PlayerColor.WHITE); // Ra1 (blocked by pawn)
            expect(legalMoves).toEqual([]);
        });
    });

    describe('Edge Cases', () => {
        test('should handle invalid coordinates', () => {
            const result = validateMove(board, [-1, 0], [0, 0], PlayerColor.WHITE);
            expect(result.isValid).toBe(false);
            expect(result.error).toBe('Invalid coordinates');
        });

        test('should handle same source and target', () => {
            const result = validateMove(board, [6, 4], [6, 4], PlayerColor.WHITE);
            expect(result.isValid).toBe(false);
            expect(result.error).toBe('Source and target cannot be the same');
        });

        test('should handle pawn promotion', () => {
            // Set up pawn near promotion
            board[1]![4] = 'P'; // White pawn at e7
            board[0]![4] = ' '; // Clear e8 (remove black king)
            
            const result = validateMove(board, [1, 4], [0, 4], PlayerColor.WHITE); // e7 to e8
            expect(result.isValid).toBe(true);
        });
    });
}); 