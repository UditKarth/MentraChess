/**
 * Phase 2 Simple Demo - Showcasing Enhanced Multiplayer Features
 * 
 * This demo demonstrates the key Phase 2 features:
 * - Dashboard Integration
 * - Game Persistence
 * - Challenge Management
 * - Matchmaking Status
 * - Export/Import Functionality
 */

// Mock AppSession for demo purposes
class MockAppSession {
  private dashboardContent: string = '';
  private notifications: string[] = [];

  updateDashboard(content: string): void {
    this.dashboardContent = content;
    console.log('📱 Dashboard Updated:', content);
  }

  showNotification(message: string): void {
    this.notifications.push(message);
    console.log('🔔 Notification:', message);
  }

  getDashboardContent(): string {
    return this.dashboardContent;
  }

  getNotifications(): string[] {
    return this.notifications;
  }
}

// Simplified Dashboard Component
class SimpleMultiplayerDashboard {
  private session: MockAppSession;
  private gameStatus: string = 'idle';
  private opponentInfo: any = null;
  private challenges: any[] = [];

  constructor(session: MockAppSession) {
    this.session = session;
  }

  updateGameStatus(status: string, opponent?: any): void {
    this.gameStatus = status;
    this.opponentInfo = opponent;
    
    const content = this.generateDashboardContent();
    this.session.updateDashboard(content);
  }

  addChallenge(challenge: any): void {
    this.challenges.push(challenge);
    this.session.showNotification(`New challenge from ${challenge.fromNickname}!`);
    this.updateGameStatus(this.gameStatus, this.opponentInfo);
  }

  private generateDashboardContent(): string {
    let content = `🎮 Chess Multiplayer Dashboard\n`;
    content += `Status: ${this.gameStatus}\n`;
    
    if (this.opponentInfo) {
      content += `Opponent: ${this.opponentInfo.name}\n`;
      content += `Rating: ${this.opponentInfo.rating || 'Unrated'}\n`;
    }
    
    if (this.challenges.length > 0) {
      content += `Challenges: ${this.challenges.length} pending\n`;
    }
    
    return content;
  }
}

// Simplified Game Persistence
class SimpleGamePersistence {
  private games: Map<string, any> = new Map();
  private gameHistory: any[] = [];

  saveGame(gameId: string, gameData: any): void {
    this.games.set(gameId, {
      ...gameData,
      savedAt: new Date(),
      lastMoveTime: new Date()
    });
    console.log(`💾 Game ${gameId} saved successfully`);
  }

  loadGame(gameId: string): any | null {
    const game = this.games.get(gameId);
    if (game) {
      console.log(`📂 Game ${gameId} loaded successfully`);
      return game;
    }
    console.log(`❌ Game ${gameId} not found`);
    return null;
  }

  addToHistory(gameData: any): void {
    this.gameHistory.push({
      ...gameData,
      completedAt: new Date()
    });
    console.log(`📊 Game added to history`);
  }

  getGameHistory(): any[] {
    return this.gameHistory;
  }

  getGameStatistics(): any {
    const totalGames = this.gameHistory.length;
    const wins = this.gameHistory.filter(g => g.result === 'win').length;
    const losses = this.gameHistory.filter(g => g.result === 'loss').length;
    const draws = this.gameHistory.filter(g => g.result === 'draw').length;

    return {
      totalGames,
      wins,
      losses,
      draws,
      winRate: totalGames > 0 ? (wins / totalGames * 100).toFixed(1) + '%' : '0%'
    };
  }
}

// Simplified Export/Import
class SimpleGameExportImport {
  static exportToJSON(gameData: any): string {
    const exportData = {
      gameId: gameData.gameId,
      players: gameData.players,
      moves: gameData.moves || [],
      result: gameData.result,
      exportedAt: new Date().toISOString(),
      version: '1.0'
    };
    
    const jsonString = JSON.stringify(exportData, null, 2);
    console.log(`📤 Game exported to JSON (${jsonString.length} bytes)`);
    return jsonString;
  }

  static importFromJSON(jsonString: string): any {
    try {
      const gameData = JSON.parse(jsonString);
      console.log(`📥 Game imported from JSON successfully`);
      return gameData;
    } catch (error) {
      console.log(`❌ Failed to import game: ${error}`);
      return null;
    }
  }

  static exportToPGN(gameData: any): string {
    let pgn = '[Event "AR Chess Game"]\n';
    pgn += `[Date "${new Date().toISOString().split('T')[0]}"]\n`;
    pgn += `[White "${gameData.players?.white || 'Unknown'}"]\n`;
    pgn += `[Black "${gameData.players?.black || 'Unknown'}"]\n`;
    pgn += `[Result "${gameData.result || '*'}"]\n\n`;
    
    if (gameData.moves && gameData.moves.length > 0) {
      gameData.moves.forEach((move: any, index: number) => {
        if (index % 2 === 0) {
          pgn += `${Math.floor(index / 2) + 1}. `;
        }
        pgn += `${move.algebraic || '??'} `;
      });
    }
    
    pgn += ` ${gameData.result || '*'}`;
    
    console.log(`📤 Game exported to PGN (${pgn.length} bytes)`);
    return pgn;
  }
}

// Demo Functions
async function demonstrateDashboardFeatures() {
  console.log('\n🎯 === DASHBOARD FEATURES DEMO ===\n');
  
  const session = new MockAppSession();
  const dashboard = new SimpleMultiplayerDashboard(session);

  // Simulate different game states
  console.log('1. Starting matchmaking...');
  dashboard.updateGameStatus('searching');
  await sleep(1000);

  console.log('2. Match found!');
  dashboard.updateGameStatus('in_game', { name: 'ChessMaster2024', rating: 1850 });
  await sleep(1000);

  console.log('3. Receiving challenge...');
  dashboard.addChallenge({
    id: 'challenge-001',
    fromUserId: 'user123',
    fromNickname: 'GrandmasterPro',
    timestamp: new Date()
  });
  await sleep(1000);

  console.log('4. Game ended');
  dashboard.updateGameStatus('idle');
}

async function demonstratePersistenceFeatures() {
  console.log('\n💾 === PERSISTENCE FEATURES DEMO ===\n');
  
  const persistence = new SimpleGamePersistence();

  // Save a game
  console.log('1. Saving a game...');
  const gameData = {
    gameId: 'game-001',
    players: { white: 'Player1', black: 'Player2' },
    moves: [
      { from: 'e2', to: 'e4', algebraic: 'e4' },
      { from: 'e7', to: 'e5', algebraic: 'e5' },
      { from: 'g1', to: 'f3', algebraic: 'Nf3' }
    ],
    result: 'white_win'
  };
  
  persistence.saveGame('game-001', gameData);

  // Load the game
  console.log('2. Loading the game...');
  const loadedGame = persistence.loadGame('game-001');

  // Add to history
  console.log('3. Adding to history...');
  persistence.addToHistory(gameData);

  // Get statistics
  console.log('4. Getting statistics...');
  const stats = persistence.getGameStatistics();
  console.log('📊 Statistics:', stats);
}

async function demonstrateExportImportFeatures() {
  console.log('\n📤 === EXPORT/IMPORT FEATURES DEMO ===\n');
  
  const gameData = {
    gameId: 'game-002',
    players: { white: 'Alice', black: 'Bob' },
    moves: [
      { from: 'd2', to: 'd4', algebraic: 'd4' },
      { from: 'd7', to: 'd5', algebraic: 'd5' },
      { from: 'c2', to: 'c4', algebraic: 'c4' }
    ],
    result: 'draw'
  };

  // Export to JSON
  console.log('1. Exporting to JSON...');
  const jsonExport = SimpleGameExportImport.exportToJSON(gameData);
  console.log('JSON Export:', jsonExport.substring(0, 100) + '...');

  // Import from JSON
  console.log('2. Importing from JSON...');
  const importedGame = SimpleGameExportImport.importFromJSON(jsonExport);
  console.log('Imported Game ID:', importedGame?.gameId);

  // Export to PGN
  console.log('3. Exporting to PGN...');
  const pgnExport = SimpleGameExportImport.exportToPGN(gameData);
  console.log('PGN Export:');
  console.log(pgnExport);
}

async function demonstrateRealTimeUpdates() {
  console.log('\n⚡ === REAL-TIME UPDATES DEMO ===\n');
  
  const session = new MockAppSession();
  const dashboard = new SimpleMultiplayerDashboard(session);

  // Simulate real-time game updates
  const gameStates = [
    { status: 'waiting_for_opponent', opponent: { name: 'ChessPro', rating: 2100 } },
    { status: 'opponent_moved', opponent: { name: 'ChessPro', rating: 2100 } },
    { status: 'your_turn', opponent: { name: 'ChessPro', rating: 2100 } },
    { status: 'check', opponent: { name: 'ChessPro', rating: 2100 } },
    { status: 'game_over', opponent: { name: 'ChessPro', rating: 2100 } }
  ];

  for (let i = 0; i < gameStates.length; i++) {
    const gameState = gameStates[i];
    if (gameState) {
      console.log(`${i + 1}. Game state: ${gameState.status}`);
      dashboard.updateGameStatus(gameState.status, gameState.opponent);
      await sleep(800);
    }
  }
}

async function demonstrateChallengeSystem() {
  console.log('\n🎯 === CHALLENGE SYSTEM DEMO ===\n');
  
  const session = new MockAppSession();
  const dashboard = new SimpleMultiplayerDashboard(session);

  // Simulate incoming challenges
  const challenges = [
    { id: 'ch1', fromNickname: 'GrandmasterPro', rating: 2200 },
    { id: 'ch2', fromNickname: 'ChessNovice', rating: 1200 },
    { id: 'ch3', fromNickname: 'TacticalMaster', rating: 1950 }
  ];

  for (const challenge of challenges) {
    console.log(`Challenge from ${challenge.fromNickname} (${challenge.rating})`);
    dashboard.addChallenge(challenge);
    await sleep(500);
  }

  // Show final dashboard state
  console.log('\nFinal Dashboard State:');
  console.log(session.getDashboardContent());
}

// Utility function for demo timing
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Main demo runner
async function runPhase2SimpleDemo() {
  console.log('🚀 Starting Phase 2 Simple Demo...\n');
  console.log('This demo showcases the key Phase 2 features:\n');
  console.log('• Dashboard Integration');
  console.log('• Game Persistence');
  console.log('• Challenge Management');
  console.log('• Export/Import Functionality');
  console.log('• Real-time Updates\n');

  try {
    await demonstrateDashboardFeatures();
    await demonstratePersistenceFeatures();
    await demonstrateExportImportFeatures();
    await demonstrateRealTimeUpdates();
    await demonstrateChallengeSystem();

    console.log('\n✅ Phase 2 Simple Demo completed successfully!');
    console.log('\n🎉 Key Features Demonstrated:');
    console.log('• Real-time dashboard updates with game status');
    console.log('• Game persistence with save/load functionality');
    console.log('• Challenge notification system');
    console.log('• Multi-format export/import (JSON, PGN)');
    console.log('• Game statistics and history tracking');
    console.log('• Error handling and user feedback');

  } catch (error) {
    console.error('❌ Demo failed:', error);
  }
}

// Run the demo
runPhase2SimpleDemo();
