// Test script to generate board output and analyze layout
const { renderBoardString } = require('./dist/chess_logic');
const { initializeBoard } = require('./dist/chess_logic');
const { PlayerColor, SessionMode, Difficulty } = require('./dist/utils/types');

// Create a test state
const testState = {
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

console.log("=== BOARD OUTPUT ANALYSIS ===");
console.log("Board text length:", testState.board.flat().join('').length);
console.log("Board dimensions:", testState.board.length, "x", testState.board[0].length);

// Test Unicode board
console.log("\n=== UNICODE BOARD ===");
const unicodeBoard = renderBoardString(testState, { useUnicode: true });
console.log("Unicode board length:", unicodeBoard.length);
console.log("Unicode board lines:", unicodeBoard.split('\n').length);
console.log("Unicode board:");
console.log(unicodeBoard);

// Test ASCII board
console.log("\n=== ASCII BOARD ===");
const asciiBoard = renderBoardString(testState, { useUnicode: false });
console.log("ASCII board length:", asciiBoard.length);
console.log("ASCII board lines:", asciiBoard.split('\n').length);
console.log("ASCII board:");
console.log(asciiBoard);

// Analyze line lengths
console.log("\n=== LINE LENGTH ANALYSIS ===");
const unicodeLines = unicodeBoard.split('\n');
const asciiLines = asciiBoard.split('\n');

console.log("Unicode line lengths:");
unicodeLines.forEach((line, i) => {
    console.log(`Line ${i + 1}: ${line.length} chars - "${line}"`);
});

console.log("\nASCII line lengths:");
asciiLines.forEach((line, i) => {
    console.log(`Line ${i + 1}: ${line.length} chars - "${line}"`);
});

// Test with captured pieces
console.log("\n=== BOARD WITH CAPTURED PIECES ===");
const stateWithCaptures = {
    ...testState,
    capturedByWhite: ['p', 'p', 'n'],
    capturedByBlack: ['P', 'P']
};
const boardWithCaptures = renderBoardString(stateWithCaptures, { useUnicode: true });
console.log("Board with captures:");
console.log(boardWithCaptures);
console.log("Total length:", boardWithCaptures.length);
console.log("Total lines:", boardWithCaptures.split('\n').length);
