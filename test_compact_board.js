// Test script to compare compact vs full board rendering
const { renderBoardString, renderCompactBoardString } = require('./dist/chess_logic');
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

console.log("=== BOARD RENDERING COMPARISON ===");

// Test full board
console.log("\n=== FULL BOARD (Original) ===");
const fullBoard = renderBoardString(testState, { useUnicode: true });
console.log("Full board length:", fullBoard.length);
console.log("Full board lines:", fullBoard.split('\n').length);
console.log("Full board:");
console.log(fullBoard);

// Test compact board
console.log("\n=== COMPACT BOARD (New) ===");
const compactBoard = renderCompactBoardString(testState, { useUnicode: true });
console.log("Compact board length:", compactBoard.length);
console.log("Compact board lines:", compactBoard.split('\n').length);
console.log("Compact board:");
console.log(compactBoard);

// Test compact board with coordinates
console.log("\n=== COMPACT BOARD WITH COORDINATES ===");
const compactBoardWithCoords = renderCompactBoardString(testState, { useUnicode: true, showCoordinates: true });
console.log("Compact board with coords length:", compactBoardWithCoords.length);
console.log("Compact board with coords lines:", compactBoardWithCoords.split('\n').length);
console.log("Compact board with coords:");
console.log(compactBoardWithCoords);

// Test with captured pieces
console.log("\n=== COMPACT BOARD WITH CAPTURED PIECES ===");
const stateWithCaptures = {
    ...testState,
    capturedByWhite: ['p', 'p', 'n'],
    capturedByBlack: ['P', 'P']
};
const compactBoardWithCaptures = renderCompactBoardString(stateWithCaptures, { 
    useUnicode: true, 
    showCapturedPieces: true 
});
console.log("Compact board with captures length:", compactBoardWithCaptures.length);
console.log("Compact board with captures lines:", compactBoardWithCaptures.split('\n').length);
console.log("Compact board with captures:");
console.log(compactBoardWithCaptures);

// Line length analysis
console.log("\n=== LINE LENGTH ANALYSIS ===");
const fullLines = fullBoard.split('\n');
const compactLines = compactBoard.split('\n');

console.log("Full board line lengths:");
fullLines.forEach((line, i) => {
    console.log(`Line ${i + 1}: ${line.length} chars`);
});

console.log("\nCompact board line lengths:");
compactLines.forEach((line, i) => {
    console.log(`Line ${i + 1}: ${line.length} chars`);
});

// Size reduction analysis
const sizeReduction = ((fullBoard.length - compactBoard.length) / fullBoard.length * 100).toFixed(1);
const lineReduction = ((fullLines.length - compactLines.length) / fullLines.length * 100).toFixed(1);

console.log(`\n=== SIZE REDUCTION ANALYSIS ===`);
console.log(`Character reduction: ${sizeReduction}%`);
console.log(`Line reduction: ${lineReduction}%`);
console.log(`Full board: ${fullBoard.length} chars, ${fullLines.length} lines`);
console.log(`Compact board: ${compactBoard.length} chars, ${compactLines.length} lines`);
