// Test script to compare all three display modes
const { renderBoardString, renderCompactBoardString, renderUltraCompactBoardString } = require('./dist/chess_logic');
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

console.log("=== ALL DISPLAY MODES COMPARISON ===");

// Test full board
console.log("\n=== FULL BOARD MODE ===");
const fullBoard = renderBoardString(testState, { useUnicode: true });
console.log("Full board length:", fullBoard.length);
console.log("Full board lines:", fullBoard.split('\n').length);
console.log("Full board:");
console.log(fullBoard);

// Test compact board
console.log("\n=== COMPACT BOARD MODE ===");
const compactBoard = renderCompactBoardString(testState, { useUnicode: true });
console.log("Compact board length:", compactBoard.length);
console.log("Compact board lines:", compactBoard.split('\n').length);
console.log("Compact board:");
console.log(compactBoard);

// Test ultra-compact board
console.log("\n=== ULTRA-COMPACT BOARD MODE ===");
const ultraCompactBoard = renderUltraCompactBoardString(testState, { useUnicode: true });
console.log("Ultra-compact board length:", ultraCompactBoard.length);
console.log("Ultra-compact board lines:", ultraCompactBoard.split('\n').length);
console.log("Ultra-compact board:");
console.log(ultraCompactBoard);

// Line length analysis
console.log("\n=== LINE LENGTH ANALYSIS ===");
const fullLines = fullBoard.split('\n');
const compactLines = compactBoard.split('\n');
const ultraCompactLines = ultraCompactBoard.split('\n');

console.log("Full board line lengths:");
fullLines.forEach((line, i) => {
    console.log(`Line ${i + 1}: ${line.length} chars`);
});

console.log("\nCompact board line lengths:");
compactLines.forEach((line, i) => {
    console.log(`Line ${i + 1}: ${line.length} chars`);
});

console.log("\nUltra-compact board line lengths:");
ultraCompactLines.forEach((line, i) => {
    console.log(`Line ${i + 1}: ${line.length} chars`);
});

// Size reduction analysis
const fullToCompactReduction = ((fullBoard.length - compactBoard.length) / fullBoard.length * 100).toFixed(1);
const fullToUltraReduction = ((fullBoard.length - ultraCompactBoard.length) / fullBoard.length * 100).toFixed(1);
const compactToUltraReduction = ((compactBoard.length - ultraCompactBoard.length) / compactBoard.length * 100).toFixed(1);

console.log(`\n=== SIZE REDUCTION ANALYSIS ===`);
console.log(`Full → Compact: ${fullToCompactReduction}% reduction`);
console.log(`Full → Ultra-compact: ${fullToUltraReduction}% reduction`);
console.log(`Compact → Ultra-compact: ${compactToUltraReduction}% reduction`);

console.log(`\n=== SUMMARY ===`);
console.log(`Full board: ${fullBoard.length} chars, ${fullLines.length} lines`);
console.log(`Compact board: ${compactBoard.length} chars, ${compactLines.length} lines`);
console.log(`Ultra-compact board: ${ultraCompactBoard.length} chars, ${ultraCompactLines.length} lines`);

// Test with a game state that has moves
console.log("\n=== TEST WITH GAME STATE (e4 opening) ===");
const gameState = {
    ...testState,
    board: [
        ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
        ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
        [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
        [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
        [' ', ' ', ' ', ' ', 'P', ' ', ' ', ' '], // White pawn moved to e4
        [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
        ['P', 'P', 'P', 'P', ' ', 'P', 'P', 'P'], // White pawn removed from e2
        ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
    ]
};

console.log("Ultra-compact board with e4 move:");
console.log(renderUltraCompactBoardString(gameState, { useUnicode: true }));
