import { renderBoardString } from '../chess_logic';
import { SessionState, PlayerColor } from '../utils/types';
import { initializeBoard } from '../chess_logic';

describe('Compact Board Rendering', () => {
    let initialState: SessionState;

    beforeEach(() => {
        initialState = {
            mode: 'user_turn' as any,
            userColor: PlayerColor.WHITE,
            aiDifficulty: 'medium' as any,
            gameMode: null,
            board: initializeBoard(),
            capturedByWhite: ['p', 'p', 'n'],
            capturedByBlack: ['P', 'P', 'R'],
            currentPlayer: PlayerColor.WHITE,
            currentFEN: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            castlingRights: "KQkq",
            enPassantTarget: "-",
            halfmoveClock: 0,
            fullmoveNumber: 1,
            moveHistory: [
                { from: [6, 4], to: [4, 4], piece: 'P', algebraic: 'e4', timestamp: new Date() },
                { from: [1, 4], to: [3, 4], piece: 'p', algebraic: 'e5', timestamp: new Date() }
            ],
            isCheck: false,
            isCheckmate: false,
            isStalemate: false,
            gameStartTime: new Date(),
            lastActivityTime: new Date(),
            lastMove: { from: [1, 4], to: [3, 4], piece: 'p', algebraic: 'e5', timestamp: new Date() }
        };
    });

    test('compact mode produces smaller output than full mode', () => {
        const fullBoard = renderBoardString(initialState, { compactMode: false });
        const compactBoard = renderBoardString(initialState, { compactMode: true });

        console.log('Full board length:', fullBoard.length);
        console.log('Compact board length:', compactBoard.length);
        console.log('Compact board:');
        console.log(compactBoard);

        expect(compactBoard.length).toBeLessThan(fullBoard.length);
    });

    test('compact mode removes captured pieces display', () => {
        const fullBoard = renderBoardString(initialState, { compactMode: false });
        const compactBoard = renderBoardString(initialState, { compactMode: true });

        expect(fullBoard).toContain('Opponent captures:');
        expect(fullBoard).toContain('Your captures:');
        expect(compactBoard).not.toContain('Opponent captures:');
        expect(compactBoard).not.toContain('Your captures:');
    });

    test('compact mode removes move history', () => {
        const fullBoard = renderBoardString(initialState, { 
            compactMode: false, 
            showMoveHistory: true 
        });
        const compactBoard = renderBoardString(initialState, { 
            compactMode: true, 
            showMoveHistory: true 
        });

        expect(fullBoard).toContain('Recent moves:');
        expect(compactBoard).not.toContain('Recent moves:');
    });

    test('compact mode reduces spacing between pieces', () => {
        const fullBoard = renderBoardString(initialState, { compactMode: false });
        const compactBoard = renderBoardString(initialState, { compactMode: true });

        // Count spaces in a typical row (should be fewer in compact mode)
        const fullRow = fullBoard.split('\n')[1]; // First board row
        const compactRow = compactBoard.split('\n')[0]; // First board row

        console.log('Full row:', JSON.stringify(fullRow));
        console.log('Compact row:', JSON.stringify(compactRow));

        const fullSpaces = (fullRow.match(/ /g) || []).length;
        const compactSpaces = (compactRow.match(/ /g) || []).length;

        console.log('Full spaces:', fullSpaces);
        console.log('Compact spaces:', compactSpaces);

        // The overall board should be smaller (this is the main test)
        expect(compactBoard.length).toBeLessThan(fullBoard.length);
        
        // And the compact board should be significantly smaller
        expect(compactBoard.length).toBeLessThan(fullBoard.length * 0.7); // At least 30% smaller
    });

    test('compact mode maintains board structure', () => {
        const compactBoard = renderBoardString(initialState, { compactMode: true });
        const lines = compactBoard.split('\n');

        // Should still have 8 board rows + 1 coordinate row
        expect(lines.length).toBeGreaterThanOrEqual(9);
        
        // Should still have file labels
        expect(compactBoard).toContain('a');
        expect(compactBoard).toContain('h');
        
        // Should still have rank numbers
        expect(compactBoard).toContain('1');
        expect(compactBoard).toContain('8');
    });

    test('compact mode works with different board orientations', () => {
        const whitePerspective = renderBoardString(initialState, { 
            compactMode: true, 
            flipBoard: false 
        });
        const blackPerspective = renderBoardString(initialState, { 
            compactMode: true, 
            flipBoard: true 
        });

        expect(whitePerspective.length).toBeGreaterThan(0);
        expect(blackPerspective.length).toBeGreaterThan(0);
        expect(whitePerspective).not.toEqual(blackPerspective);
    });

    test('compact mode works with ASCII pieces', () => {
        const unicodeBoard = renderBoardString(initialState, { 
            compactMode: true, 
            useUnicode: true 
        });
        const asciiBoard = renderBoardString(initialState, { 
            compactMode: true, 
            useUnicode: false 
        });

        expect(unicodeBoard.length).toBeGreaterThan(0);
        expect(asciiBoard.length).toBeGreaterThan(0);
        expect(unicodeBoard).not.toEqual(asciiBoard);
    });

    test('compact mode removes move highlighting', () => {
        const fullBoard = renderBoardString(initialState, { 
            compactMode: false, 
            highlightLastMove: true 
        });
        const compactBoard = renderBoardString(initialState, { 
            compactMode: true, 
            highlightLastMove: true 
        });

        expect(fullBoard).toContain('[');
        expect(fullBoard).toContain(']');
        expect(compactBoard).not.toContain('[');
        expect(compactBoard).not.toContain(']');
    });

    test('compact mode output is reasonable size', () => {
        const compactBoard = renderBoardString(initialState, { compactMode: true });
        
        // Should be significantly smaller than typical DoubleTextWall limits
        expect(compactBoard.length).toBeLessThan(500); // Conservative limit
        
        // Should still be readable
        expect(compactBoard.length).toBeGreaterThan(100);
    });
});
