import { ChessServer } from '../server/ChessServer';
import { GameModeCommandProcessor } from '../utils/gameModeCommands';
import { SessionMode } from '../utils/types';

describe('Transcription Debug Tests', () => {
  let chessServer: ChessServer;

  beforeEach(() => {
    // Create a mock config for ChessServer
    const mockConfig = {
      packageName: 'com.test.chess',
      apiKey: 'test-api-key'
    };
    chessServer = new ChessServer(mockConfig);
  });

  afterEach(() => {
    // Clean up
    if (chessServer) {
      chessServer.cleanupForTests();
    }
  });

  describe('Command Processing Flow', () => {
    test('should process "help" command correctly through full flow', async () => {
      const sessionId = 'test-session-help';
      const userId = 'test-user';
      
      // Mock the session and app session
      const mockAppSession = {
        settings: {
          get: jest.fn().mockReturnValue('white')
        },
        logger: {
          debug: jest.fn(),
          warn: jest.fn()
        },
        events: {
          onTranscription: jest.fn().mockReturnValue(() => {}),
          onButtonPress: jest.fn().mockReturnValue(() => {}),
          onHeadPosition: jest.fn().mockReturnValue(() => {}),
          onVoiceActivity: jest.fn().mockReturnValue(() => {}),
          onGlassesBattery: jest.fn().mockReturnValue(() => {})
        },
        dashboard: {
          content: {
            onModeChange: jest.fn().mockReturnValue(() => {})
          }
        }
      };

      // Mock the session
      const mockSession = {
        settings: mockAppSession.settings,
        logger: mockAppSession.logger,
        events: mockAppSession.events,
        dashboard: mockAppSession.dashboard
      };

      // Mock the onStart method to avoid complex initialization
      jest.spyOn(chessServer, 'onStart').mockImplementation(async () => {
        // Set up a session in CHOOSING_GAME_MODE state
        const initialState = {
          mode: SessionMode.CHOOSING_GAME_MODE,
          userColor: 'white' as any,
          aiDifficulty: 'medium' as any,
          gameMode: null,
          board: Array(8).fill(null).map(() => Array(8).fill(' ')),
          capturedByWhite: [],
          capturedByBlack: [],
          currentPlayer: 'white' as any,
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

        // Mock the session manager
        (chessServer as any).sessionManager.initializeSession(sessionId, initialState, userId, mockSession);
      });

      // Start the session
      await chessServer.onStart(sessionId, userId, mockSession);

      // Test the command parsing directly
      const helpCommand = GameModeCommandProcessor.parseCommand('help');
      console.log('Direct command parsing result:', helpCommand);
      expect(helpCommand.type).toBe('help');

      // Test the command processing through the server
      const handleGameModeCommandSpy = jest.spyOn(chessServer as any, 'handleGameModeCommand');
      
      // Simulate the transcription data
      const transcriptionData = {
        text: 'help',
        isFinal: true
      };

      // Simulate the transcription handler
      const transcriptionHandler = mockAppSession.events.onTranscription.mock.calls[0][0];
      transcriptionHandler(transcriptionData);

      // Wait for the debounce delay
      await new Promise(resolve => setTimeout(resolve, 600));

      // Check if handleGameModeCommand was called
      expect(handleGameModeCommandSpy).toHaveBeenCalledWith(sessionId, 'help');
    });

    test('should process "menu" command correctly through full flow', async () => {
      const sessionId = 'test-session-menu';
      const userId = 'test-user';
      
      // Mock the session and app session
      const mockAppSession = {
        settings: {
          get: jest.fn().mockReturnValue('white')
        },
        logger: {
          debug: jest.fn(),
          warn: jest.fn()
        },
        events: {
          onTranscription: jest.fn().mockReturnValue(() => {}),
          onButtonPress: jest.fn().mockReturnValue(() => {}),
          onHeadPosition: jest.fn().mockReturnValue(() => {}),
          onVoiceActivity: jest.fn().mockReturnValue(() => {}),
          onGlassesBattery: jest.fn().mockReturnValue(() => {})
        },
        dashboard: {
          content: {
            onModeChange: jest.fn().mockReturnValue(() => {})
          }
        }
      };

      // Mock the session
      const mockSession = {
        settings: mockAppSession.settings,
        logger: mockAppSession.logger,
        events: mockAppSession.events,
        dashboard: mockAppSession.dashboard
      };

      // Mock the onStart method
      jest.spyOn(chessServer, 'onStart').mockImplementation(async () => {
        const initialState = {
          mode: SessionMode.CHOOSING_GAME_MODE,
          userColor: 'white' as any,
          aiDifficulty: 'medium' as any,
          gameMode: null,
          board: Array(8).fill(null).map(() => Array(8).fill(' ')),
          capturedByWhite: [],
          capturedByBlack: [],
          currentPlayer: 'white' as any,
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

        (chessServer as any).sessionManager.initializeSession(sessionId, initialState, userId, mockSession);
      });

      // Start the session
      await chessServer.onStart(sessionId, userId, mockSession);

      // Test the command parsing directly
      const menuCommand = GameModeCommandProcessor.parseCommand('menu');
      console.log('Direct command parsing result:', menuCommand);
      expect(menuCommand.type).toBe('show_menu');

      // Test the command processing through the server
      const handleGameModeCommandSpy = jest.spyOn(chessServer as any, 'handleGameModeCommand');
      
      // Simulate the transcription data
      const transcriptionData = {
        text: 'menu',
        isFinal: true
      };

      // Simulate the transcription handler
      const transcriptionHandler = mockAppSession.events.onTranscription.mock.calls[0][0];
      transcriptionHandler(transcriptionData);

      // Wait for the debounce delay
      await new Promise(resolve => setTimeout(resolve, 600));

      // Check if handleGameModeCommand was called
      expect(handleGameModeCommandSpy).toHaveBeenCalledWith(sessionId, 'menu');
    });

    test('should handle incomplete word detection correctly', () => {
      // Test that incomplete words are properly detected
      const incompleteEndings = ['hel', 'he', 'h', 'pl', 'p', 'roo', 'ro', 'r', 'kni', 'kni', 'kn', 'k'];
      
      // These should be detected as incomplete
      expect(incompleteEndings.some(ending => 'hel'.endsWith(ending))).toBe(true);
      expect(incompleteEndings.some(ending => 'he'.endsWith(ending))).toBe(true);
      expect(incompleteEndings.some(ending => 'h'.endsWith(ending))).toBe(true);
      
      // These should NOT be detected as incomplete (they are complete words)
      expect(incompleteEndings.some(ending => 'help'.endsWith(ending))).toBe(false);
      expect(incompleteEndings.some(ending => 'menu'.endsWith(ending))).toBe(false);
      expect(incompleteEndings.some(ending => 'play'.endsWith(ending))).toBe(false);
    });

    test('should process commands with periods correctly', () => {
      // Test that commands with periods are handled correctly
      const helpWithPeriod = GameModeCommandProcessor.parseCommand('help.');
      console.log('Help with period result:', helpWithPeriod);
      expect(helpWithPeriod.type).toBe('help');

      const menuWithPeriod = GameModeCommandProcessor.parseCommand('menu.');
      console.log('Menu with period result:', menuWithPeriod);
      expect(menuWithPeriod.type).toBe('show_menu');
    });

    test('should handle empty or whitespace-only transcripts', () => {
      // Test empty transcript
      const emptyCommand = GameModeCommandProcessor.parseCommand('');
      expect(emptyCommand.type).toBe('unknown');

      // Test whitespace-only transcript
      const whitespaceCommand = GameModeCommandProcessor.parseCommand('   ');
      expect(whitespaceCommand.type).toBe('unknown');

      // Test single character (too short)
      const singleCharCommand = GameModeCommandProcessor.parseCommand('h');
      expect(singleCharCommand.type).toBe('unknown');
    });

    test('should handle case variations correctly', () => {
      // Test various case combinations
      const testCases = [
        { input: 'Help', expected: 'help' },
        { input: 'HELP', expected: 'help' },
        { input: 'Menu', expected: 'show_menu' },
        { input: 'MENU', expected: 'show_menu' },
        { input: 'help.', expected: 'help' },
        { input: 'menu.', expected: 'show_menu' },
        { input: 'Help.', expected: 'help' },
        { input: 'Menu.', expected: 'show_menu' }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = GameModeCommandProcessor.parseCommand(input);
        console.log(`Input: "${input}" -> Result: ${result.type}, Expected: ${expected}`);
        expect(result.type).toBe(expected);
      });
    });
  });
});
