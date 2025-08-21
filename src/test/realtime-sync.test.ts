import { WebSocketNetworkService } from '../services/WebSocketNetworkService';
import { MultiplayerGameManager } from '../services/MultiplayerGameManager';
import { GameMove, PlayerColor, SessionMode } from '../utils/types';

describe('Real-Time Move Synchronization', () => {
  let networkService: WebSocketNetworkService;
  let gameManager: MultiplayerGameManager;
  let gameId: string;
  let player1Id: string;
  let player2Id: string;

  beforeEach(async () => {
    networkService = new WebSocketNetworkService(8082); // Use different port for tests
    gameManager = new MultiplayerGameManager(networkService);
    
    gameId = 'test_game_001';
    player1Id = 'test_player_1';
    player2Id = 'test_player_2';
  });

  afterEach(async () => {
    await gameManager.cleanup();
    await networkService.stop();
  });

  describe('Game Creation and Setup', () => {
    test('should create a new multiplayer game', async () => {
      await gameManager.createGame(gameId, player1Id, player2Id);
      
      const gameState = gameManager.getGameState(gameId);
      expect(gameState).toBeDefined();
      expect(gameState?.gameMode).toBe('multiplayer');
      expect(gameState?.currentPlayer).toBe(PlayerColor.WHITE);
      expect(gameState?.moveHistory).toHaveLength(0);
    });

    test('should assign correct player colors', async () => {
      await gameManager.createGame(gameId, player1Id, player2Id);
      expect(gameManager.getPlayerColor(gameId, player1Id)).toBe(PlayerColor.WHITE);
      expect(gameManager.getPlayerColor(gameId, player2Id)).toBe(PlayerColor.BLACK);
    });

    test('should identify players in game', async () => {
      await gameManager.createGame(gameId, player1Id, player2Id);
      expect(gameManager.isUserInGame(player1Id, gameId)).toBe(true);
      expect(gameManager.isUserInGame(player2Id, gameId)).toBe(true);
      expect(gameManager.isUserInGame('unknown_player', gameId)).toBe(false);
    });
  });

  describe('Move Validation and Execution', () => {
    beforeEach(async () => {
      await gameManager.createGame(gameId, player1Id, player2Id);
    });

    test('should validate legal moves', async () => {
      const legalMove: GameMove = {
        piece: 'P',
        from: [6, 4], // e2
        to: [4, 4],   // e4
        algebraic: 'e4',
        fromUserId: player1Id,
        timestamp: new Date()
      };

      const result = await gameManager.makeMove(gameId, player1Id, legalMove);
      expect(result.success).toBe(true);
    });

    test('should reject invalid moves', async () => {
      const invalidMove: GameMove = {
        piece: 'P',
        from: [0, 0], // a8 (no pawn here)
        to: [1, 0],   // a7
        algebraic: 'a8a7',
        fromUserId: player1Id,
        timestamp: new Date()
      };

      const result = await gameManager.makeMove(gameId, player1Id, invalidMove);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should enforce turn order', async () => {
      const move: GameMove = {
        piece: 'P',
        from: [6, 4], // e2
        to: [4, 4],   // e4
        algebraic: 'e4',
        fromUserId: player2Id, // Wrong player
        timestamp: new Date()
      };

      const result = await gameManager.makeMove(gameId, player2Id, move);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Not your turn');
    });

    test('should reject moves in non-existent games', async () => {
      const move: GameMove = {
        piece: 'P',
        from: [6, 4],
        to: [4, 4],
        algebraic: 'e4',
        fromUserId: player1Id,
        timestamp: new Date()
      };

      const result = await gameManager.makeMove('non_existent_game', player1Id, move);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Game not found');
    });
  });

  describe('Game State Management', () => {
    beforeEach(async () => {
      await gameManager.createGame(gameId, player1Id, player2Id);
    });

    test('should track move history', async () => {
      const move: GameMove = {
        piece: 'P',
        from: [6, 4], // e2
        to: [4, 4],   // e4
        algebraic: 'e4',
        fromUserId: player1Id,
        timestamp: new Date()
      };

      await gameManager.makeMove(gameId, player1Id, move);
      
      const gameState = gameManager.getGameState(gameId);
      expect(gameState?.moveHistory).toHaveLength(1);
      expect(gameState?.moveHistory[0].algebraic).toBe('e4');
    });

    test('should update current player after move', async () => {
      const move: GameMove = {
        piece: 'P',
        from: [6, 4], // e2
        to: [4, 4],   // e4
        algebraic: 'e4',
        fromUserId: player1Id,
        timestamp: new Date()
      };

      await gameManager.makeMove(gameId, player1Id, move);
      
      const gameState = gameManager.getGameState(gameId);
      expect(gameState?.currentPlayer).toBe(PlayerColor.BLACK);
    });

    test('should track captured pieces', async () => {
      // This would require a more complex test with actual captures
      // For now, just verify the arrays exist
      const gameState = gameManager.getGameState(gameId);
      expect(gameState?.capturedByWhite).toBeDefined();
      expect(gameState?.capturedByBlack).toBeDefined();
    });
  });

  describe('Event Handling', () => {
    beforeEach(async () => {
      await gameManager.createGame(gameId, player1Id, player2Id);
    });

    test('should trigger game state change events', (done) => {
      gameManager.onGameStateChange(gameId, (state) => {
        expect(state).toBeDefined();
        expect(state.currentPlayer).toBe(PlayerColor.BLACK);
        done();
      });

      const move: GameMove = {
        piece: 'P',
        from: [6, 4], // e2
        to: [4, 4],   // e4
        algebraic: 'e4',
        fromUserId: player1Id,
        timestamp: new Date()
      };

      gameManager.makeMove(gameId, player1Id, move).catch(done);
    }, 15000); // Increase timeout

    test('should trigger move events', (done) => {
      gameManager.onMove(gameId, (move, fen) => {
        expect(move.algebraic).toBe('e4');
        expect(fen).toBeDefined();
        done();
      });

      const move: GameMove = {
        piece: 'P',
        from: [6, 4], // e2
        to: [4, 4],   // e4
        algebraic: 'e4',
        fromUserId: player1Id,
        timestamp: new Date()
      };

      gameManager.makeMove(gameId, player1Id, move);
    });
  });

  describe('Game Statistics', () => {
    beforeEach(async () => {
      await gameManager.createGame(gameId, player1Id, player2Id);
    });

    test('should provide game statistics', async () => {
      await gameManager.createGame(gameId, player1Id, player2Id);
      
      // Add a small delay to ensure game duration is > 0
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const stats = gameManager.getGameStats(gameId);
      expect(stats).toBeDefined();
      expect(stats?.gameId).toBe(gameId);
      expect(stats?.player1Id).toBe(player1Id);
      expect(stats?.player2Id).toBe(player2Id);
      expect(stats?.isActive).toBe(true);
      expect(stats?.moveCount).toBe(0);
      expect(stats?.gameDuration).toBeGreaterThan(0);
    });

    test('should track active games', () => {
      const activeGames = gameManager.getActiveGames();
      expect(activeGames).toContain(gameId);
    });
  });

  describe('Cleanup and Resource Management', () => {
    test('should clean up games properly', async () => {
      await gameManager.createGame(gameId, player1Id, player2Id);
      
      // Verify game exists
      expect(gameManager.getGameState(gameId)).toBeDefined();
      
      // Clean up
      await gameManager.cleanupGame(gameId);
      
      // Verify game is removed
      expect(gameManager.getGameState(gameId)).toBeNull();
      expect(gameManager.getActiveGames()).not.toContain(gameId);
    });

    test('should clean up all games', async () => {
      await gameManager.createGame(gameId, player1Id, player2Id);
      await gameManager.createGame('game_2', 'player3', 'player4');
      
      // Verify games exist
      expect(gameManager.getActiveGames()).toHaveLength(2);
      
      // Clean up all
      await gameManager.cleanup();
      
      // Verify all games are removed
      expect(gameManager.getActiveGames()).toHaveLength(0);
    });
  });

  describe('Network Service Integration', () => {
    test('should provide network statistics', () => {
      const stats = networkService.getNetworkStats();
      expect(stats).toBeDefined();
      expect(stats.connectedUsers).toBeGreaterThanOrEqual(0);
      expect(stats.activeGames).toBeGreaterThanOrEqual(0);
      expect(stats.messagesQueued).toBeGreaterThanOrEqual(0);
    });

    test('should track connection status', () => {
      const status = networkService.getConnectionStatus(player1Id);
      expect(['connected', 'disconnected', 'unknown']).toContain(status);
    });

    test('should manage game participants', () => {
      networkService.addGameParticipant(gameId, player1Id);
      networkService.addGameParticipant(gameId, player2Id);
      
      const participants = networkService.getGameParticipants(gameId);
      expect(participants).toContain(player1Id);
      expect(participants).toContain(player2Id);
      
      networkService.removeGameParticipant(gameId, player1Id);
      const updatedParticipants = networkService.getGameParticipants(gameId);
      expect(updatedParticipants).not.toContain(player1Id);
      expect(updatedParticipants).toContain(player2Id);
    });
  });

  describe('Error Handling', () => {
    test('should handle moves in non-existent games gracefully', async () => {
      const move: GameMove = {
        piece: 'P',
        from: [6, 4],
        to: [4, 4],
        algebraic: 'e4',
        fromUserId: player1Id,
        timestamp: new Date()
      };

      const result = await gameManager.makeMove('non_existent', player1Id, move);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Game not found');
    });

    test('should handle moves by non-participants gracefully', async () => {
      await gameManager.createGame(gameId, player1Id, player2Id);
      
      const move: GameMove = {
        piece: 'P',
        from: [6, 4],
        to: [4, 4],
        algebraic: 'e4',
        fromUserId: 'non_participant',
        timestamp: new Date()
      };

      const result = await gameManager.makeMove(gameId, 'non_participant', move);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Not your turn');
    });
  });
});
