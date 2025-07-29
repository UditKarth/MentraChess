import { 
    initializeBoard, 
    algebraicToCoords, 
    coordsToAlgebraic,
    parseMoveTranscript,
    findPossibleMoves,
    executeMove,
    boardToFEN,
    renderBoardString
} from '../chess_logic';
import { PlayerColor, Difficulty, Piece, SessionMode, SessionState } from '../utils/types';

describe('Chess Logic Tests', () => {
    describe('Board Initialization', () => {
        test('should initialize board correctly', () => {
            const board = initializeBoard();
            expect(board).toBeDefined();
            expect(board.length).toBe(8);
            expect(board[0]?.length).toBe(8);
            expect(board[0]?.join('')).toBe('rnbqkbnr');
            expect(board[7]?.join('')).toBe('RNBQKBNR');
        });
    });

    describe('Coordinate Conversion', () => {
        test('should convert algebraic to coordinates correctly', () => {
            const testCases = [
                { algebraic: 'a1', expected: [7, 0] },
                { algebraic: 'h8', expected: [0, 7] },
                { algebraic: 'e4', expected: [4, 4] },
                { algebraic: 'd5', expected: [3, 3] }
            ];

            testCases.forEach(({ algebraic, expected }) => {
                const coords = algebraicToCoords(algebraic);
                expect(coords).toEqual(expected);
            });
        });

        test('should convert coordinates to algebraic correctly', () => {
            const testCases = [
                { coords: [7, 0], expected: 'a1' },
                { coords: [0, 7], expected: 'h8' },
                { coords: [4, 4], expected: 'e4' },
                { coords: [3, 3], expected: 'd5' }
            ];

            testCases.forEach(({ coords, expected }) => {
                const algebraic = coordsToAlgebraic(coords as [number, number]);
                expect(algebraic).toBe(expected);
            });
        });

        test('should handle invalid algebraic notation', () => {
            expect(algebraicToCoords('')).toBeNull();
            expect(algebraicToCoords('a')).toBeNull();
            expect(algebraicToCoords('a9')).toBeNull();
            expect(algebraicToCoords('i1')).toBeNull();
        });
    });

    describe('Move Parsing', () => {
        test('should parse move transcripts correctly', () => {
            const testCases = [
                { input: 'rook to d4', expected: { piece: 'r', target: 'd4' } },
                { input: 'pawn e5', expected: { piece: 'p', target: 'e5' } },
                { input: 'knight f3', expected: { piece: 'n', target: 'f3' } },
                { input: 'bishop to c4', expected: { piece: 'b', target: 'c4' } },
                { input: 'queen d2', expected: { piece: 'q', target: 'd2' } },
                { input: 'king e2', expected: { piece: 'k', target: 'e2' } }
            ];

            testCases.forEach(({ input, expected }) => {
                const result = parseMoveTranscript(input);
                expect(result).toEqual(expected);
            });
        });

        test('should handle voice misrecognition for piece names', () => {
            const testCases = [
                { input: 'pond e4', expected: { piece: 'p', target: 'e4' } },
                { input: 'night to f3', expected: { piece: 'n', target: 'f3' } },
                { input: 'Night e5', expected: { piece: 'n', target: 'e5' } }
            ];

            testCases.forEach(({ input, expected }) => {
                const result = parseMoveTranscript(input);
                expect(result).toEqual(expected);
            });
        });

        test('should handle invalid move transcripts', () => {
            expect(parseMoveTranscript('invalid move')).toBeNull();
            expect(parseMoveTranscript('')).toBeNull();
            expect(parseMoveTranscript('move to nowhere')).toBeNull();
        });
    });



    describe('Move Execution', () => {
        test('should execute pawn move correctly', () => {
            const board = initializeBoard();
            const source: [number, number] = [6, 4]; // e2
            const target: [number, number] = [4, 4]; // e4
            
            const { updatedBoard, capturedPiece } = executeMove(board, source, target);
            
            expect(capturedPiece).toBe(' ');
            expect(updatedBoard[6]?.[4]).toBe(' ');
            expect(updatedBoard[4]?.[4]).toBe('P');
        });

        test('should handle pawn promotion', () => {
            const board = initializeBoard();
            // Set up white pawn near promotion
            board[1]![4] = 'P'; // White pawn at e7
            
            const source: [number, number] = [1, 4]; // e7
            const target: [number, number] = [0, 4]; // e8
            
            const { updatedBoard } = executeMove(board, source, target);
            
            expect(updatedBoard[0]?.[4]).toBe('Q'); // Should promote to queen
        });
    });

    describe('FEN Generation', () => {
        test('should generate correct FEN for initial position', () => {
            const board = initializeBoard();
            const fen = boardToFEN({
                board,
                currentPlayer: PlayerColor.WHITE,
                castlingRights: "KQkq",
                enPassantTarget: "-",
                halfmoveClock: 0,
                fullmoveNumber: 1,
                mode: SessionMode.USER_TURN,
                userColor: PlayerColor.WHITE,
                aiDifficulty: Difficulty.MEDIUM,
                capturedByWhite: [],
                capturedByBlack: [],
                currentFEN: "",
                moveHistory: [],
                isCheck: false,
                isCheckmate: false,
                isStalemate: false,
                gameStartTime: new Date(),
                lastActivityTime: new Date()
            });
            
            expect(fen).toContain('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR');
            expect(fen).toContain('w KQkq - 0 1');
        });
    });

    describe('Possible Moves', () => {
        test('should find possible pawn moves', () => {
            const board = initializeBoard();
            const targetCoords = algebraicToCoords('e4');
            
            if (targetCoords) {
                const possibleMoves = findPossibleMoves(board, PlayerColor.WHITE, 'P', targetCoords);
                expect(possibleMoves.length).toBeGreaterThan(0);
                
                // Should find the e2 pawn that can move to e4
                const e2Pawn = possibleMoves.find(move => 
                    move.source[0] === 6 && move.source[1] === 4
                );
                expect(e2Pawn).toBeDefined();
            }
        });
    });

    describe('Board Rendering', () => {
        test('should render board with correct spacing for Unicode and ASCII pieces', () => {
            const state: SessionState = {
                mode: SessionMode.USER_TURN,
                userColor: PlayerColor.WHITE,
                aiDifficulty: Difficulty.MEDIUM,
                board: initializeBoard(),
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

            const unicodeBoard = renderBoardString(state, { useUnicode: true });
            const asciiBoard = renderBoardString(state, { useUnicode: false });

            // Check that Unicode board uses single spaces between pieces
            const unicodeLines = unicodeBoard.split('\n').filter(line => line.match(/^[1-8]/));
            const asciiLines = asciiBoard.split('\n').filter(line => line.match(/^[1-8]/));
            
            // Find lines with pieces to compare spacing
            const unicodePieceLines = unicodeLines.filter(line => 
                line.includes('♔') || line.includes('♕') || line.includes('♖') || line.includes('♗') || 
                line.includes('♚') || line.includes('♛') || line.includes('♜') || line.includes('♝') ||
                line.includes('♟︎') || line.includes('♙')
            );
            
            const asciiPieceLines = asciiLines.filter(line => 
                line.includes('K') || line.includes('Q') || line.includes('R') || line.includes('B') || 
                line.includes('k') || line.includes('q') || line.includes('r') || line.includes('b') ||
                line.includes('p') || line.includes('P')
            );
            
            // Verify that Unicode uses single spaces and ASCII uses double spaces
            unicodePieceLines.forEach(line => {
                // Check for single space between any Unicode pieces
                expect(line).toMatch(/♔ |♕ |♖ |♗ |♘ |♙ |♚ |♛ |♜ |♝ |♞ |♟︎ /);
            });
            
            asciiPieceLines.forEach(line => {
                // Check for double spaces between ASCII pieces
                expect(line).toMatch(/K  |Q  |R  |B  |N  |P  |k  |q  |r  |b  |n  |p  /);
            });
            
            // Both should have the same number of board lines
            expect(unicodeLines.length).toBe(asciiLines.length);
            expect(unicodeLines.length).toBe(8);
        });
    });
}); 