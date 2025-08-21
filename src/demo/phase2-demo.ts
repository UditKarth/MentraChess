import { MultiplayerDashboard } from '../dashboard/MultiplayerDashboard';
import { GameStatusDisplay } from '../dashboard/GameStatusDisplay';
import { ChallengeNotifications } from '../dashboard/ChallengeNotifications';
import { MatchmakingStatus } from '../dashboard/MatchmakingStatus';
import { GamePersistenceService } from '../services/GamePersistenceService';
import { GameHistoryService } from '../services/GameHistoryService';
import { GameExportImport } from '../utils/gameExportImport';
import { MultiplayerSessionState, PlayerColor, GameChallenge, SessionMode } from '../utils/types';

/**
 * Phase 2 Demo: Enhanced Multiplayer Features
 * 
 * This demonstrates the complete Phase 2 implementation including:
 * - Dashboard integration with real-time updates
 * - Game state persistence and recovery
 * - Challenge notifications
 * - Matchmaking status display
 * - Game history and statistics
 * - Export/import functionality
 */

console.log('🚀 Starting Phase 2 Demo: Enhanced Multiplayer Features\n');

// Mock AppSession for demo purposes
const mockAppSession = {
  dashboard: {
    content: {
      writeToMain: (content: string) => console.log(`[Main] ${content}`),
      writeToExpanded: (content: string) => console.log(`[Expanded] ${content}`)
    }
  }
} as any;

// Mock session data
const sessionId = 'demo-session-123';
const userId = 'demo-user-456';

async function demonstrateDashboardIntegration() {
  console.log('📊 Demonstrating Dashboard Integration...\n');

  // Create dashboard components
  const multiplayerDashboard = new MultiplayerDashboard(mockAppSession, sessionId, userId);
  const gameStatusDisplay = new GameStatusDisplay(mockAppSession, sessionId, userId);
  const challengeNotifications = new ChallengeNotifications(mockAppSession, sessionId, userId);
  const matchmakingStatus = new MatchmakingStatus(mockAppSession, sessionId, userId);

  // Simulate multiplayer session state
  const mockSessionState: MultiplayerSessionState = {
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
    gameId: 'demo-game-789',
    opponentId: 'opponent-123',
    playerColor: PlayerColor.WHITE,
    multiplayerGameMode: 'multiplayer_active',
    isConnected: true,
    gameStartTime: new Date(),
    matchmakingStatus: 'in_game',
    pendingChallenges: []
  };

  console.log('1. Updating multiplayer dashboard...');
  multiplayerDashboard.updateDashboard(mockSessionState);

  console.log('\n2. Updating game status display...');
  gameStatusDisplay.updateGameStatus(mockSessionState);

  console.log('\n3. Adding challenge notification...');
  const mockChallenge: GameChallenge = {
    id: 'challenge-123',
    fromUserId: 'challenger-456',
    fromNickname: 'ChessMaster',
    toUserId: userId,
    timestamp: new Date(),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000)
  };
  challengeNotifications.addChallenge(mockChallenge);

  console.log('\n4. Starting matchmaking search...');
  matchmakingStatus.startSearching({
    timeControl: 'rapid',
    ratingRange: { min: 1200, max: 1600 },
    allowUnrated: true
  });

  console.log('\n✅ Dashboard integration demonstration complete!\n');
}

async function demonstrateGamePersistence() {
  console.log('💾 Demonstrating Game Persistence...\n');

  const persistenceService = new GamePersistenceService();
  const historyService = new GameHistoryService();

  // Create mock game data
  const mockGameData = {
    gameId: 'persistence-demo-game',
    player1Id: 'player1',
    player2Id: 'player2',
    currentState: {
      board: [],
      currentPlayer: PlayerColor.WHITE,
      currentFEN: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      fullmoveNumber: 1,
      halfmoveClock: 0,
      userColor: PlayerColor.WHITE,
      mode: SessionMode.USER_TURN,
      aiDifficulty: null,
      gameMode: null,
      moveHistory: [],
      castlingRights: 'KQkq',
      enPassantTarget: '-',
      isCheck: false,
      isCheckmate: false,
      isStalemate: false,
      capturedByWhite: [],
      capturedByBlack: [],
      gameStartTime: new Date(),
      lastActivityTime: new Date()
    },
    moveHistory: [
      {
        from: [6, 4] as [number, number],
        to: [4, 4] as [number, number],
        piece: 'P',
        algebraic: 'e4',
        fromUserId: 'player1'
      },
      {
        from: [1, 4] as [number, number],
        to: [3, 4] as [number, number],
        piece: 'P',
        algebraic: 'e5',
        fromUserId: 'player2'
      }
    ],
    gameStartTime: new Date(),
    lastMoveTime: new Date()
  };

  console.log('1. Saving game state...');
  await persistenceService.saveGameState(mockGameData);

  console.log('2. Loading game state...');
  const loadedGame = await persistenceService.loadGameState('persistence-demo-game');
  console.log(`   Loaded game: ${loadedGame ? 'Success' : 'Failed'}`);

  console.log('3. Getting recoverable games...');
  const recoverableGames = await persistenceService.getRecoverableGames('player1');
  console.log(`   Found ${recoverableGames.length} recoverable games`);

  console.log('4. Adding game to history...');
  historyService.addGameToHistory(mockGameData);

  console.log('5. Getting user statistics...');
  const stats = historyService.getUserStats('player1');
  console.log(`   Total games: ${stats.totalGames}`);
  console.log(`   Win rate: ${stats.winRate}%`);

  console.log('6. Getting game history...');
  const history = historyService.getGameHistory('player1', 5);
  console.log(`   Recent games: ${history.length}`);

  console.log('\n✅ Game persistence demonstration complete!\n');
}

async function demonstrateExportImport() {
  console.log('📤 Demonstrating Export/Import Functionality...\n');

  const mockGameData = {
    gameId: 'export-demo-game',
    player1Id: 'player1',
    player2Id: 'player2',
    currentState: {
      board: [],
      currentPlayer: PlayerColor.WHITE,
      currentFEN: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      fullmoveNumber: 1,
      halfmoveClock: 0,
      userColor: PlayerColor.WHITE,
      mode: SessionMode.USER_TURN,
      aiDifficulty: null,
      gameMode: null,
      moveHistory: [],
      castlingRights: 'KQkq',
      enPassantTarget: '-',
      isCheck: false,
      isCheckmate: false,
      isStalemate: false,
      capturedByWhite: [],
      capturedByBlack: [],
      gameStartTime: new Date(),
      lastActivityTime: new Date()
    },
    moveHistory: [
      {
        from: [6, 4] as [number, number],
        to: [4, 4] as [number, number],
        piece: 'P',
        algebraic: 'e4',
        fromUserId: 'player1'
      }
    ],
    gameStartTime: new Date(),
    lastMoveTime: new Date()
  };

  console.log('1. Exporting game to JSON...');
  const jsonExport = GameExportImport.exportGame(mockGameData, {
    format: 'json',
    includeMoveHistory: true,
    includeMetadata: true
  });
  console.log(`   JSON export length: ${jsonExport.length} characters`);

  console.log('2. Exporting game to PGN...');
  const pgnExport = GameExportImport.exportGame(mockGameData, {
    format: 'pgn',
    includeMoveHistory: true,
    includeMetadata: true
  });
  console.log(`   PGN export length: ${pgnExport.length} characters`);

  console.log('3. Exporting game to FEN...');
  const fenExport = GameExportImport.exportGame(mockGameData, {
    format: 'fen',
    includeMoveHistory: false,
    includeMetadata: false
  });
  console.log(`   FEN: ${fenExport}`);

  console.log('4. Importing game from JSON...');
  const importedGame = GameExportImport.importGame(jsonExport, {
    format: 'json',
    validateMoves: true,
    preserveMetadata: true
  });
  console.log(`   Imported game ID: ${importedGame.gameId}`);

  console.log('5. Importing game from PGN...');
  const pgnGame = `[Event "Demo Game"]
[Site "MentraOS"]
[Date "2024.01.01"]
[Round "1"]
[White "Player1"]
[Black "Player2"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 *`;

  const importedPGN = GameExportImport.importGame(pgnGame, {
    format: 'pgn',
    validateMoves: false,
    preserveMetadata: true
  });
  console.log(`   Imported PGN game ID: ${importedPGN.gameId}`);

  console.log('\n✅ Export/Import demonstration complete!\n');
}

async function demonstrateRealTimeUpdates() {
  console.log('⚡ Demonstrating Real-Time Updates...\n');

  const multiplayerDashboard = new MultiplayerDashboard(mockAppSession, sessionId, userId);
  const gameStatusDisplay = new GameStatusDisplay(mockAppSession, sessionId, userId);
  const challengeNotifications = new ChallengeNotifications(mockAppSession, sessionId, userId);
  const matchmakingStatus = new MatchmakingStatus(mockAppSession, sessionId, userId);

  // Simulate real-time updates
  console.log('1. Simulating opponent move...');
  gameStatusDisplay.showOpponentMove({
    from: 'e7',
    to: 'e5',
    piece: 'P',
    algebraic: 'e5'
  });

  console.log('\n2. Simulating challenge acceptance...');
  challengeNotifications.showChallengeAccepted('challenge-123');

  console.log('\n3. Simulating match found...');
  matchmakingStatus.showMatchFound('ChessMaster', 1500);

  console.log('\n4. Simulating game end...');
  gameStatusDisplay.showGameEnd('checkmate', PlayerColor.WHITE);

  console.log('\n5. Simulating connection issues...');
  matchmakingStatus.showConnectionLost();
  
  setTimeout(() => {
    console.log('\n6. Simulating reconnection...');
    matchmakingStatus.showReconnectionSuccessful();
  }, 1000);

  console.log('\n✅ Real-time updates demonstration complete!\n');
}

async function demonstrateErrorHandling() {
  console.log('🛡️ Demonstrating Error Handling...\n');

  const gameStatusDisplay = new GameStatusDisplay(mockAppSession, sessionId, userId);
  const matchmakingStatus = new MatchmakingStatus(mockAppSession, sessionId, userId);

  console.log('1. Showing error message...');
  gameStatusDisplay.showError('Invalid move: King cannot move into check');

  console.log('\n2. Showing matchmaking error...');
  matchmakingStatus.setError('Connection timeout. Please try again.');

  console.log('\n3. Showing loading state...');
  gameStatusDisplay.showLoading('Connecting to opponent...');

  console.log('\n✅ Error handling demonstration complete!\n');
}

async function demonstrateStatistics() {
  console.log('📈 Demonstrating Statistics and Analytics...\n');

  const historyService = new GameHistoryService();

  // Add some mock games to generate statistics
  const mockGames = [
    { result: 'win', duration: 1800, opponent: 'PlayerA' },
    { result: 'loss', duration: 2400, opponent: 'PlayerB' },
    { result: 'win', duration: 1200, opponent: 'PlayerC' },
    { result: 'draw', duration: 3600, opponent: 'PlayerD' },
    { result: 'win', duration: 900, opponent: 'PlayerA' }
  ];

  console.log('1. Adding mock games to history...');
  mockGames.forEach((game, index) => {
    const mockGameData = {
      gameId: `mock-game-${index}`,
      player1Id: 'player1',
      player2Id: game.opponent,
      currentState: {
        board: [],
        currentPlayer: PlayerColor.WHITE,
        currentFEN: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        fullmoveNumber: 1,
        halfmoveClock: 0,
        userColor: PlayerColor.WHITE,
        mode: SessionMode.USER_TURN,
        aiDifficulty: null,
        gameMode: null,
        moveHistory: [],
        castlingRights: 'KQkq',
        enPassantTarget: '-',
        isCheck: false,
        isCheckmate: false,
        isStalemate: false,
        capturedByWhite: [],
        capturedByBlack: [],
        gameStartTime: new Date(Date.now() - (index * 24 * 60 * 60 * 1000)),
        lastActivityTime: new Date(Date.now() - (index * 24 * 60 * 60 * 1000))
      },
      moveHistory: [],
      gameStartTime: new Date(Date.now() - (index * 24 * 60 * 60 * 1000)),
      lastMoveTime: new Date(Date.now() - (index * 24 * 60 * 60 * 1000)),
      gameEndTime: new Date(Date.now() - (index * 24 * 60 * 60 * 1000) + game.duration * 1000),
      gameResult: game.result === 'win' ? 'white_win' : game.result === 'loss' ? 'black_win' : 'draw',
      winner: game.result === 'win' ? 'player1' : game.result === 'loss' ? game.opponent : undefined
    };
    historyService.addGameToHistory(mockGameData);
  });

  console.log('2. Getting comprehensive statistics...');
  const stats = historyService.getUserStats('player1');
  console.log(`   Total games: ${stats.totalGames}`);
  console.log(`   Wins: ${stats.wins}`);
  console.log(`   Losses: ${stats.losses}`);
  console.log(`   Draws: ${stats.draws}`);
  console.log(`   Win rate: ${stats.winRate}%`);
  console.log(`   Average game duration: ${stats.averageGameDuration}s`);
  console.log(`   Longest game: ${stats.longestGame}s`);
  console.log(`   Shortest game: ${stats.shortestGame}s`);
  console.log(`   Current streak: ${stats.currentStreak}`);
  console.log(`   Best streak: ${stats.bestStreak}`);

  console.log('\n3. Getting opponent statistics...');
  const opponentStats = historyService.getOpponentStats('player1');
  console.log(`   Opponents played: ${opponentStats.length}`);
  opponentStats.forEach(opponent => {
    console.log(`   ${opponent.opponentName}: ${opponent.gamesPlayed} games, ${opponent.winRate}% win rate`);
  });

  console.log('\n4. Getting recent games...');
  const recentGames = historyService.getRecentGames('player1', 7);
  console.log(`   Games in last 7 days: ${recentGames.length}`);

  console.log('\n5. Getting games by result...');
  const wins = historyService.getGamesByResult('player1', 'win');
  const losses = historyService.getGamesByResult('player1', 'loss');
  const draws = historyService.getGamesByResult('player1', 'draw');
  console.log(`   Wins: ${wins.length}, Losses: ${losses.length}, Draws: ${draws.length}`);

  console.log('\n✅ Statistics demonstration complete!\n');
}

async function runPhase2Demo() {
  try {
    console.log('🎯 Phase 2 Demo: Enhanced Multiplayer Features\n');
    console.log('This demo showcases the following Phase 2 features:\n');
    console.log('• Dashboard integration with real-time updates');
    console.log('• Game state persistence and recovery');
    console.log('• Challenge notifications and management');
    console.log('• Matchmaking status display');
    console.log('• Game history and statistics');
    console.log('• Export/import functionality (JSON, PGN, FEN)');
    console.log('• Error handling and user feedback');
    console.log('• Real-time status updates\n');

    await demonstrateDashboardIntegration();
    await demonstrateGamePersistence();
    await demonstrateExportImport();
    await demonstrateRealTimeUpdates();
    await demonstrateErrorHandling();
    await demonstrateStatistics();

    console.log('🎉 Phase 2 Demo completed successfully!');
    console.log('\n📋 Summary of implemented features:');
    console.log('✅ MultiplayerDashboard - Real-time game status display');
    console.log('✅ GameStatusDisplay - Detailed game state information');
    console.log('✅ ChallengeNotifications - Incoming/outgoing challenge management');
    console.log('✅ MatchmakingStatus - Search and connection status');
    console.log('✅ GamePersistenceService - Game state storage and recovery');
    console.log('✅ GameHistoryService - Statistics and replay functionality');
    console.log('✅ GameExportImport - Multi-format export/import (JSON, PGN, FEN)');
    console.log('✅ Real-time updates and error handling');
    console.log('✅ Comprehensive statistics and analytics');

    console.log('\n🚀 Phase 2 is ready for integration with the main ChessServer!');

  } catch (error) {
    console.error('❌ Phase 2 Demo failed:', error);
  }
}

// Run the demo
runPhase2Demo();
