import { 
    initializeBoard, 
    canCastle, 
    executeCastling, 
    updateCastlingRights,
    parseCastlingTranscript
} from '../chess_logic';
import { PlayerColor, Piece } from '../utils/types';

describe('Castling Tests', () => {
    let board: Piece[][];

    beforeEach(() => {
        board = initializeBoard();
    });

    describe('Castling Validation', () => {
        test('should allow kingside castling for white', () => {
            // Clear path between king and rook
            board[7]![5] = ' '; // Clear f1
            board[7]![6] = ' '; // Clear g1
            
            const result = canCastle(board, PlayerColor.WHITE, 'kingside', 'KQkq');
            expect(result).toBe(true);
        });

        test('should allow queenside castling for white', () => {
            // Clear path between king and rook
            board[7]![1] = ' '; // Clear b1
            board[7]![2] = ' '; // Clear c1
            board[7]![3] = ' '; // Clear d1
            
            const result = canCastle(board, PlayerColor.WHITE, 'queenside', 'KQkq');
            expect(result).toBe(true);
        });

        test('should allow kingside castling for black', () => {
            // Clear path between king and rook
            board[0]![5] = ' '; // Clear f8
            board[0]![6] = ' '; // Clear g8
            
            const result = canCastle(board, PlayerColor.BLACK, 'kingside', 'KQkq');
            expect(result).toBe(true);
        });

        test('should allow queenside castling for black', () => {
            // Clear path between king and rook
            board[0]![1] = ' '; // Clear b8
            board[0]![2] = ' '; // Clear c8
            board[0]![3] = ' '; // Clear d8
            
            const result = canCastle(board, PlayerColor.BLACK, 'queenside', 'KQkq');
            expect(result).toBe(true);
        });

        test('should reject castling when king has moved', () => {
            // Move king away from starting position
            board[7]![4] = ' '; // Clear e1
            board[6]![4] = 'K'; // Move king to e2
            
            const result = canCastle(board, PlayerColor.WHITE, 'kingside', 'KQkq');
            expect(result).toBe(false);
        });

        test('should reject castling when rook has moved', () => {
            // Move rook away from starting position
            board[7]![7] = ' '; // Clear h1
            board[6]![7] = 'R'; // Move rook to h2
            
            const result = canCastle(board, PlayerColor.WHITE, 'kingside', 'KQkq');
            expect(result).toBe(false);
        });

        test('should reject castling when path is blocked', () => {
            // Block the path with a piece
            board[7]![5] = 'B'; // Block f1 with bishop
            
            const result = canCastle(board, PlayerColor.WHITE, 'kingside', 'KQkq');
            expect(result).toBe(false);
        });

        test('should reject castling when king is in check', () => {
            // Set up position where white king is in check
            board[6]![4] = 'q'; // Black queen at e2 attacking e1
            
            const result = canCastle(board, PlayerColor.WHITE, 'kingside', 'KQkq');
            expect(result).toBe(false);
        });

        test('should reject castling when king would pass through check', () => {
            // Clear path but place piece attacking f1
            board[7]![5] = ' '; // Clear f1
            board[7]![6] = ' '; // Clear g1
            board[6]![5] = 'q'; // Black queen at f2 attacking f1
            
            const result = canCastle(board, PlayerColor.WHITE, 'kingside', 'KQkq');
            expect(result).toBe(false);
        });

        test('should reject castling when no castling rights', () => {
            const result = canCastle(board, PlayerColor.WHITE, 'kingside', '');
            expect(result).toBe(false);
        });
    });

    describe('Castling Execution', () => {
        test('should execute kingside castling for white', () => {
            // Clear path
            board[7]![5] = ' '; // Clear f1
            board[7]![6] = ' '; // Clear g1
            
            const result = executeCastling(board, PlayerColor.WHITE, 'kingside');
            
            expect(result.updatedBoard[7]![4]).toBe(' '); // King moved from e1
            expect(result.updatedBoard[7]![6]).toBe('K'); // King moved to g1
            expect(result.updatedBoard[7]![7]).toBe(' '); // Rook moved from h1
            expect(result.updatedBoard[7]![5]).toBe('R'); // Rook moved to f1
            
            expect(result.kingMove.from).toEqual([7, 4]);
            expect(result.kingMove.to).toEqual([7, 6]);
            expect(result.rookMove.from).toEqual([7, 7]);
            expect(result.rookMove.to).toEqual([7, 5]);
        });

        test('should execute queenside castling for white', () => {
            // Clear path
            board[7]![1] = ' '; // Clear b1
            board[7]![2] = ' '; // Clear c1
            board[7]![3] = ' '; // Clear d1
            
            const result = executeCastling(board, PlayerColor.WHITE, 'queenside');
            
            expect(result.updatedBoard[7]![4]).toBe(' '); // King moved from e1
            expect(result.updatedBoard[7]![2]).toBe('K'); // King moved to c1
            expect(result.updatedBoard[7]![0]).toBe(' '); // Rook moved from a1
            expect(result.updatedBoard[7]![3]).toBe('R'); // Rook moved to d1
            
            expect(result.kingMove.from).toEqual([7, 4]);
            expect(result.kingMove.to).toEqual([7, 2]);
            expect(result.rookMove.from).toEqual([7, 0]);
            expect(result.rookMove.to).toEqual([7, 3]);
        });

        test('should execute kingside castling for black', () => {
            // Clear path
            board[0]![5] = ' '; // Clear f8
            board[0]![6] = ' '; // Clear g8
            
            const result = executeCastling(board, PlayerColor.BLACK, 'kingside');
            
            expect(result.updatedBoard[0]![4]).toBe(' '); // King moved from e8
            expect(result.updatedBoard[0]![6]).toBe('k'); // King moved to g8
            expect(result.updatedBoard[0]![7]).toBe(' '); // Rook moved from h8
            expect(result.updatedBoard[0]![5]).toBe('r'); // Rook moved to f8
        });
    });

    describe('Castling Rights Updates', () => {
        test('should remove all castling rights when king moves', () => {
            const rights = updateCastlingRights(board, [7, 4], [6, 4], PlayerColor.WHITE, 'KQkq');
            expect(rights).toBe('kq'); // Only black rights remain
        });

        test('should remove kingside castling when kingside rook moves', () => {
            const rights = updateCastlingRights(board, [7, 7], [6, 7], PlayerColor.WHITE, 'KQkq');
            expect(rights).toBe('Qkq'); // White queenside and black rights remain
        });

        test('should remove queenside castling when queenside rook moves', () => {
            const rights = updateCastlingRights(board, [7, 0], [6, 0], PlayerColor.WHITE, 'KQkq');
            expect(rights).toBe('Kkq'); // White kingside and black rights remain
        });

        test('should remove opponent castling rights when capturing their rook', () => {
            // Set up position where white can capture black's kingside rook
            board[0]![7] = ' '; // Clear h8
            board[1]![7] = 'r'; // Move rook to h7
            
            const rights = updateCastlingRights(board, [6, 7], [1, 7], PlayerColor.WHITE, 'KQkq');
            expect(rights).toBe('KQq'); // Black kingside right removed
        });
    });

    describe('Castling Voice Commands', () => {
        test('should parse kingside castling commands', () => {
            const commands = [
                'kingside',
                'king side',
                'short',
                'o-o',
                'oo'
            ];
            
            commands.forEach(command => {
                const result = parseCastlingTranscript(command);
                expect(result).toBe('kingside');
            });
        });

        test('should parse queenside castling commands', () => {
            const commands = [
                'queenside',
                'queen side',
                'long',
                'o-o-o',
                'ooo'
            ];
            
            commands.forEach(command => {
                const result = parseCastlingTranscript(command);
                expect(result).toBe('queenside');
            });
        });

        test('should reject non-castling commands', () => {
            const commands = [
                'move pawn',
                'knight to f3',
                'castle',
                'king move',
                ''
            ];
            
            commands.forEach(command => {
                const result = parseCastlingTranscript(command);
                expect(result).toBeNull();
            });
        });
    });

    describe('Complex Castling Scenarios', () => {
        test('should handle castling in complex positions', () => {
            // Set up a complex position where castling should still be possible
            board = [
                ['r', ' ', ' ', ' ', 'k', ' ', ' ', 'r'],
                ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
                [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
                [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
                [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
                [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
                ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
                ['R', ' ', ' ', ' ', 'K', ' ', ' ', 'R']
            ];
            
            // Both sides should be able to castle kingside
            expect(canCastle(board, PlayerColor.WHITE, 'kingside', 'KQkq')).toBe(true);
            expect(canCastle(board, PlayerColor.BLACK, 'kingside', 'KQkq')).toBe(true);
        });

        test('should handle castling with pieces in non-blocking positions', () => {
            // Set up position with pieces that don't block castling
            board[7]![1] = 'N'; // Knight at b1 (blocks queenside)
            board[7]![6] = 'N'; // Knight at g1 (blocks kingside)
            
            // Should not be able to castle when path is blocked
            expect(canCastle(board, PlayerColor.WHITE, 'kingside', 'KQkq')).toBe(false);
            expect(canCastle(board, PlayerColor.WHITE, 'queenside', 'KQkq')).toBe(false);
        });
    });
}); 