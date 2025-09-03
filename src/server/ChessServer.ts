import { AppServer, AppSession, AppServerConfig, ViewType, StreamType, DashboardMode } from '@mentra/sdk';
import { 
    SessionState, 
    SessionMode, 
    PlayerColor, 
    Difficulty, 
    Piece, 
    Coordinates,
    PotentialMove,
    ClarificationData,
    MultiplayerSessionState,
    GameChallenge,
    GameMove
} from '../utils/types';
import { 
    initializeBoard, 
    algebraicToCoords, 
    coordsToAlgebraic,
    parseMoveTranscript,
    parseClarificationTranscript,
    parseCastlingTranscript,
    findPossibleMoves,
    executeMove,
    executeCastling,
    updateCastlingRights,
    boardToFEN,
    validateMove,
    checkGameEnd,
    getLegalMoves,
    renderBoardString,
    isInCheck
} from '../chess_logic';
import { StockfishService } from '../services/StockfishService';
import { stockfishMoveToInternal } from '../utils/stockfishUtils';
import { SessionManager, ChessSessionInfo } from '../session/SessionManager';
import { parseChessMove } from '../utils/chessMoveParser';
import { GameModeCommandProcessor, GameModeCommand } from '../utils/gameModeCommands';
import { NetworkService } from '../services/NetworkService';
import { WebSocketNetworkService } from '../services/WebSocketNetworkService';
import { MatchmakingService } from '../services/MatchmakingService';
import { MatchmakingServiceImpl } from '../services/MatchmakingServiceImpl';
import { MultiplayerGameManager } from '../services/MultiplayerGameManager';
import { memoryMonitor } from '../utils/memoryMonitor';

export class ChessServer extends AppServer {
    protected sessionManager: SessionManager;
    private readonly CLARIFICATION_TIMEOUT = 30000; // 30 seconds
    private stockfishService: StockfishService;
    
    // Multiplayer services
    private networkService: NetworkService | null = null;
    private matchmakingService?: MatchmakingService;
    private multiplayerGameManager?: MultiplayerGameManager;

    // Cache for board rendering to reduce latency
    private boardCache: Map<string, { boardText: string; timestamp: number; useUnicode: boolean }> = new Map();
    private cleanupInterval: NodeJS.Timeout | null = null;
    private readonly BOARD_CACHE_DURATION = 1000; // 1 second cache duration
    
    // Command processing debounce
    private commandDebounceTimers: Map<string, NodeJS.Timeout> = new Map();
    private readonly COMMAND_DEBOUNCE_DELAY = 500; // 500ms delay before processing commands

    constructor(config: AppServerConfig) {
        super(config);
        
        // Initialize session manager
        this.sessionManager = new SessionManager();
        
        // Initialize Stockfish service
        console.log('Initializing Stockfish service in ChessServer...');
        try {
            this.stockfishService = new StockfishService();
            console.log('Stockfish service created - will check readiness when making moves');
        } catch (error) {
            console.warn('Failed to initialize Stockfish service:', error);
            console.log('Continuing with simple AI fallback...');
            this.stockfishService = null as any;
        }
        
        // Initialize multiplayer services
        console.log('Initializing multiplayer services...');
        try {
            // Environment-based WebSocket configuration
            const isProduction = process.env.NODE_ENV === 'production';
            
            if (isProduction) {
                // Production: Attach WebSocket to main HTTP server
                console.log('[ChessServer] Production mode: Attaching WebSocket to main HTTP server');
                // We'll initialize WebSocket after the server starts
                this.networkService = null;
            } else {
                // Development/Testing: Use random port to avoid conflicts
                console.log('[ChessServer] Development mode: Using random port for WebSocket server');
                const wsPort = 8080 + Math.floor(Math.random() * 1000);
                this.networkService = new WebSocketNetworkService(wsPort);
                this.matchmakingService = new MatchmakingServiceImpl(this.networkService);
                this.multiplayerGameManager = new MultiplayerGameManager(this.networkService);
                this.setupMultiplayerEventHandlers();
            }
            
            console.log('Multiplayer services initialized successfully');
        } catch (error) {
            console.warn('Failed to initialize multiplayer services:', error);
            console.log('Continuing with single-player mode only...');
        }
        
        // Set up periodic board cache cleanup
        this.setupPeriodicCleanup();
        
        // Start memory monitoring
        memoryMonitor.startMonitoring();
    }

    protected async onSession(session: AppSession, sessionId: string, userId: string): Promise<void> {
        this.logger.info('New chess session started', { sessionId, userId });
        console.log(`[DEBUG] onSession called with sessionId: ${sessionId}, userId: ${userId}`);

        // Get settings from MentraOS
        const userColor = session.settings.get<string>('user_color', 'white');
        const aiDifficulty = session.settings.get<string>('ai_difficulty', 'medium');
        const gameMode = session.settings.get<string>('game_mode', ''); // Check if user has a game mode preference
        console.log(`[DEBUG] User settings - color: ${userColor}, difficulty: ${aiDifficulty}, gameMode: ${gameMode}`);

        // Initialize game state - start with game mode selection if no preference set
        const initialState: SessionState = {
            mode: gameMode ? SessionMode.USER_TURN : SessionMode.CHOOSING_GAME_MODE, // Start with game mode selection
            userColor: userColor === 'white' ? PlayerColor.WHITE : PlayerColor.BLACK,
            aiDifficulty: aiDifficulty === 'easy' ? Difficulty.EASY : aiDifficulty === 'hard' ? Difficulty.HARD : Difficulty.MEDIUM,
            gameMode: gameMode === 'ai' ? 'ai' : gameMode === 'multiplayer' ? 'multiplayer' : null,
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

        console.log(`[DEBUG] Initial game state created for session: ${sessionId}`);

        // Create game session
        this.sessionManager.initializeSession(sessionId, initialState, userId, session);
        console.log(`[DEBUG] Session initialized in SessionManager`);

        // Set up event handlers
        this.setupEventHandlers(sessionId);
        console.log(`[DEBUG] Event handlers set up`);

        // Set up dashboard integration
        this.setupDashboardIntegration(sessionId);
        console.log(`[DEBUG] Dashboard integration set up`);

        // Connect user to multiplayer services if available
        if (this.networkService && this.matchmakingService) {
            try {
                await this.networkService.connect(userId);
                console.log(`[DEBUG] User ${userId} connected to multiplayer services`);
            } catch (error) {
                console.warn(`Failed to connect user ${userId} to multiplayer services:`, error);
            }
        } else if (process.env.NODE_ENV === 'production') {
            console.log(`[DEBUG] Multiplayer services not available for user ${userId} in production`);
        }

        // Start appropriate flow based on game mode
        if (gameMode) {
            console.log(`[DEBUG] Starting game with preset mode: ${gameMode}`);
            await this.startGame(sessionId);
        } else {
            console.log(`[DEBUG] Showing game mode selection for session: ${sessionId}`);
            await this.showGameModeSelection(sessionId);
        }
        console.log(`[DEBUG] Session initialization completed for session: ${sessionId}`);
    }

    protected async onStop(sessionId: string, userId: string, reason: string): Promise<void> {
        this.logger.info('Chess session stopped', { sessionId, userId, reason });

        // Get session before removal to access cleanup functions
        const gameSession = this.sessionManager.getSession(sessionId);
        
        if (gameSession) {
            // Clear any active timeouts
            if (gameSession.state.timeoutId) {
                clearTimeout(gameSession.state.timeoutId);
                gameSession.state.timeoutId = null;
            }

            // Clean up all event handlers
            if (gameSession.cleanupFunctions && gameSession.cleanupFunctions.length > 0) {
                this.logger.info(`Cleaning up ${gameSession.cleanupFunctions.length} event handlers for session ${sessionId}`);
                gameSession.cleanupFunctions.forEach(cleanup => {
                    try {
                        cleanup();
                    } catch (error) {
                        this.logger.warn('Error during event handler cleanup:', error);
                    }
                });
            }

            // Clean up dashboard integration
            if (gameSession.dashboardCleanup) {
                try {
                    gameSession.dashboardCleanup();
                } catch (error) {
                    this.logger.warn('Error during dashboard cleanup:', error);
                }
            }

            // Clean up multiplayer services if available
            if (this.networkService && this.matchmakingService) {
                try {
                    await this.networkService.disconnect(userId);
                    await this.matchmakingService.leaveMatchmaking(userId);
                    
                    // Clean up any active games for this user
                    if (this.multiplayerGameManager) {
                        const activeGames = this.multiplayerGameManager.getActiveGames();
                        for (const gameId of activeGames) {
                            if (this.multiplayerGameManager.isUserInGame(userId, gameId)) {
                                await this.multiplayerGameManager.cleanupGame(gameId);
                            }
                        }
                    }
                    
                    console.log(`[DEBUG] User ${userId} disconnected from multiplayer services`);
                } catch (error) {
                    console.warn(`Failed to disconnect user ${userId} from multiplayer services:`, error);
                }
            }
        }

        // Clean up board cache for this session
        this.invalidateBoardCache(sessionId);

        // Clean up command debounce timer for this session
        const debounceTimer = this.commandDebounceTimers.get(sessionId);
        if (debounceTimer) {
            clearTimeout(debounceTimer);
            this.commandDebounceTimers.delete(sessionId);
        }

        // Remove session from manager
        this.sessionManager.removeSession(sessionId);
        
        this.logger.info('Session cleanup completed', { sessionId });
    }

    private setupEventHandlers(sessionId: string): void {
        const gameSession = this.sessionManager.getSession(sessionId);
        if (!gameSession) return;

        const { appSession, state } = gameSession;

        // Handle transcription events
        const transcriptionHandler = (data: any) => {
            try {
                if (data.text) {
                    // Only show live transcription for non-final text to avoid excessive updates
                    if (!data.isFinal) {
                        // Use a more subtle approach for live transcription
                        this.showLiveTranscription(sessionId, data.text);
                    } else {
                        // Use debounce to prevent premature command processing
                        this.debounceCommandProcessing(sessionId, data.text);
                    }
                }
            } catch (error) {
                console.error('Error in transcription handler:', error);
                // Try to recover by updating the board
                this.updateBoardAndFeedback(sessionId, 'Error processing input. Please try again.');
            }
        };

        // Handle button presses for navigation
        const buttonHandler = (data: any) => {
            this.handleButtonPress(sessionId, data);
        };

        // Handle head position for UI context
        const headPositionHandler = (data: any) => {
            this.handleHeadPosition(sessionId, data);
        };

        // Handle voice activity detection
        const voiceActivityHandler = (data: any) => {
            this.handleVoiceActivity(sessionId, data);
        };

        // Handle glasses battery updates
        const batteryHandler = (data: any) => {
            this.handleBatteryUpdate(sessionId, data);
        };

        // Store cleanup functions
        gameSession.cleanupFunctions.push(
            appSession.events.onTranscription(transcriptionHandler),
            appSession.events.onButtonPress(buttonHandler),
            appSession.events.onHeadPosition(headPositionHandler),
            appSession.events.onVoiceActivity(voiceActivityHandler),
            appSession.events.onGlassesBattery(batteryHandler)
        );
    }

    private setupDashboardIntegration(sessionId: string): void {
        const gameSession = this.sessionManager.getSession(sessionId);
        if (!gameSession) return;

        const { appSession } = gameSession;

        // Set up dashboard mode change handler
        const dashboardModeHandler = (mode: DashboardMode | 'none') => {
            this.handleDashboardModeChange(sessionId, mode);
        };

        // Store dashboard cleanup function
        gameSession.dashboardCleanup = appSession.dashboard.content.onModeChange(dashboardModeHandler);

        // Initial dashboard update
        this.updateDashboardContent(sessionId);
    }

    private async handleDashboardModeChange(sessionId: string, mode: DashboardMode | 'none'): Promise<void> {
        const gameSession = this.sessionManager.getSession(sessionId);
        if (!gameSession) return;

        const { appSession, state } = gameSession;

        appSession.logger.debug('Dashboard mode changed', { mode });

        if (mode === 'none') {
            // Dashboard closed - no action needed
            return;
        }

        // Update dashboard content based on new mode
        this.updateDashboardContent(sessionId);
    }

    private updateDashboardContent(sessionId: string): void {
        const gameSession = this.sessionManager.getSession(sessionId);
        if (!gameSession) return;

        const { appSession, state } = gameSession;

        // Get user preferences from settings
        const showCapturedPieces = appSession.settings.get<boolean>('show_captured_pieces', true);
        const showMoveHistory = appSession.settings.get<boolean>('show_move_history', false);
        const compactMode = appSession.settings.get<boolean>('compact_dashboard', false);

        // Create main dashboard content
        let mainContent = '';
        let expandedContent = '';

        switch (state.mode) {
            case SessionMode.USER_TURN:
            case SessionMode.AI_TURN:
                const turnText = state.currentPlayer === PlayerColor.WHITE ? 'White' : 'Black';
                const isUserTurn = state.currentPlayer === state.userColor;
                
                mainContent = `${turnText}'s Turn`;
                expandedContent = `${turnText}'s Turn\n\n`;

                if (isUserTurn) {
                    expandedContent += 'Your move!\nSay your move (e.g., "rook to d4")';
                    // Add check warning for user's turn
                    if (state.isCheck) {
                        expandedContent += '\nYou are in CHECK!';
                    }
                } else {
                    expandedContent += 'AI is thinking...';
                    // Add check indication for AI's turn
                    if (state.isCheck) {
                        expandedContent += '\nAI is in check!';
                    }
                }

                // Note: Captured pieces are now shown in the main board view with the combined content

                // Add move count
                expandedContent += `\n\nMove: ${state.fullmoveNumber}`;
                break;

            case SessionMode.AWAITING_CLARIFICATION:
                mainContent = '❓ Clarify Move';
                expandedContent = 'Multiple pieces can make this move.\n\nSay the number to choose.';
                break;

            case SessionMode.GAME_OVER:
                mainContent = '🏁 Game Over';
                expandedContent = 'Game completed!\n\nStart a new game to play again.';
                break;

            default:
                // Fallback for any unexpected modes
                mainContent = '♟️ Chess';
                expandedContent = 'Chess game in progress...';
                break;
        }

        // Send content to appropriate dashboard modes
        if (compactMode) {
            // Compact mode - only show essential info
            appSession.dashboard.content.writeToMain(mainContent);
        } else {
            // Full mode - show detailed info
            appSession.dashboard.content.writeToMain(mainContent);
            appSession.dashboard.content.writeToExpanded(expandedContent);
        }
    }

    // Helper to update board and feedback using TextWall with combined content (replaced DoubleTextWall)
    private async updateBoardAndFeedback(sessionId: string, feedback: string) {
        const gameSession = this.sessionManager.getSession(sessionId);
        if (!gameSession) {
            if (process.env.NODE_ENV !== 'production') {
                console.log(`[DEBUG] updateBoardAndFeedback: No game session found for sessionId: ${sessionId}`);
            }
            return;
        }
        
        if (process.env.NODE_ENV !== 'production') {
            console.log(`[DEBUG] updateBoardAndFeedback: Found game session for sessionId: ${sessionId}`);
        }
        const { appSession, state } = gameSession;
        
        try {
            if (process.env.NODE_ENV !== 'production') {
                console.log(`[DEBUG] updateBoardAndFeedback: Getting cached board text`);
            }
            // Use cached board text for better performance
            const boardText = this.getCachedBoardText(sessionId, state, appSession);
            if (process.env.NODE_ENV !== 'production') {
                console.log(`[DEBUG] updateBoardAndFeedback: Board text length: ${boardText.length}`);
            }
            
            // Combine board text with feedback and additional guidance
            const combinedContent = this.createCombinedBoardContent(boardText, feedback, state);
            
            if (process.env.NODE_ENV !== 'production') {
                console.log(`[DEBUG] updateBoardAndFeedback: Calling showTextWall with combined content`);
            }
            await appSession.layouts.showTextWall(combinedContent);
            if (process.env.NODE_ENV !== 'production') {
                console.log(`[DEBUG] updateBoardAndFeedback: showTextWall completed successfully`);
            }
        } catch (error) {
            console.error(`[DEBUG] updateBoardAndFeedback: Error updating board and feedback:`, error);
            // Fallback: try to show just the feedback
            try {
                if (process.env.NODE_ENV !== 'production') {
                    console.log(`[DEBUG] updateBoardAndFeedback: Trying fallback with showTextWall`);
                }
                await appSession.layouts.showTextWall(feedback, { durationMs: 3000 });
                if (process.env.NODE_ENV !== 'production') {
                    console.log(`[DEBUG] updateBoardAndFeedback: Fallback showTextWall completed`);
                }
            } catch (fallbackError) {
                console.error(`[DEBUG] updateBoardAndFeedback: Fallback layout also failed:`, fallbackError);
            }
        }
    }

    // Helper to show live transcription as caption
    private async showLiveTranscription(sessionId: string, transcript: string) {
        const gameSession = this.sessionManager.getSession(sessionId);
        if (!gameSession) return;
        const { appSession } = gameSession;
        
        try {
            // Use a very subtle approach for live transcription
            // Only show if the transcript is substantial enough (more than 2 characters)
            if (transcript.trim().length > 2) {
                // Use a very short duration to avoid interference with main UI
                await appSession.layouts.showTextWall(transcript, { 
                    durationMs: 1000 // Very short duration
                });
            }
        } catch (error) {
            // Silently ignore live transcription errors to avoid spam
            if (process.env.NODE_ENV !== 'production') {
                console.error('Error showing live transcription:', error);
            }
        }
    }

    /**
     * Create combined board content with board, feedback, and additional guidance
     */
    private createCombinedBoardContent(boardText: string, feedback: string, state: SessionState): string {
        let combinedContent = boardText;
        
        // Add feedback if provided
        if (feedback && feedback.trim()) {
            combinedContent += '\n\n' + feedback;
        }
        
        // Add captured pieces information
        const { capturedByWhite, capturedByBlack, userColor } = state;
        if (capturedByWhite.length > 0 || capturedByBlack.length > 0) {
            combinedContent += '\n\n-----------------------------------';
            
            // Show pieces you've captured from opponent
            const piecesYouCaptured = userColor === PlayerColor.WHITE ? capturedByWhite : capturedByBlack;
            if (piecesYouCaptured.length > 0) {
                combinedContent += `\nPieces you captured: ${piecesYouCaptured.join(' ')}`;
            }
            
            // Show pieces opponent has captured from you
            const piecesOpponentCaptured = userColor === PlayerColor.WHITE ? capturedByBlack : capturedByWhite;
            if (piecesOpponentCaptured.length > 0) {
                combinedContent += `\nPieces opponent captured: ${piecesOpponentCaptured.join(' ')}`;
            }
        }
        
        if (state.mode === SessionMode.USER_TURN || 
            state.mode === SessionMode.AI_TURN || 
            state.mode === SessionMode.AWAITING_CLARIFICATION ||
            (state.gameMode === 'multiplayer' && state.mode !== SessionMode.CHOOSING_GAME_MODE)) {
            const turnText = state.currentPlayer === state.userColor ? "Your turn!" : "Opponent's turn";
            combinedContent += `\n\n${turnText}`;
        }
        
        // Add game status indicators
        if (state.isCheck) {
            combinedContent += '\n⚠️ CHECK!';
        }
        if (state.isCheckmate) {
            combinedContent += '\n🏁 CHECKMATE!';
        }
        if (state.isStalemate) {
            combinedContent += '\n🤝 STALEMATE!';
        }
        
        // Add move count only when in an active game
        if (state.mode === SessionMode.USER_TURN || 
            state.mode === SessionMode.AI_TURN || 
            state.mode === SessionMode.AWAITING_CLARIFICATION ||
            (state.gameMode === 'multiplayer' && state.mode !== SessionMode.CHOOSING_GAME_MODE)) {
            combinedContent += `\nMove: ${state.fullmoveNumber}`;
        }
        
        // Add command help when not in an active game
        if (state.mode === SessionMode.INITIALIZING || 
            state.mode === SessionMode.CHOOSING_GAME_MODE ||
            state.mode === SessionMode.CHOOSING_COLOR ||
            state.mode === SessionMode.CHOOSING_DIFFICULTY ||
            state.mode === SessionMode.CHOOSING_OPPONENT ||
            state.mode === SessionMode.GAME_OVER) {
            combinedContent += '\n\n🎮 Game Commands:';
            combinedContent += '\n• "AI" - Start an AI-based game';
            combinedContent += '\n• "Multiplayer" - Start a multiplayer game';
            combinedContent += '\n\n⚙️  Settings & Preferences:';
            combinedContent += '\n• Color and AI difficulty can be changed in app settings';
            combinedContent += '\n• Use "Help" anytime to see available commands';
            combinedContent += '\n• Say "New Game" to start over from any point';
        }
        
        // Add voice command hints
        combinedContent += '\n\nVoice Commands: "rook to d4", "pawn e5", "castle kingside"';
        
        return combinedContent;
    }

    private getCachedBoardText(sessionId: string, state: SessionState, appSession: AppSession): string {
        if (process.env.NODE_ENV !== 'production') {
            console.log(`[DEBUG] getCachedBoardText: Starting for sessionId: ${sessionId}`);
        }
        const now = Date.now();
        const cacheKey = `${sessionId}_${state.currentFEN}`;
        const cached = this.boardCache.get(cacheKey);
        
        // Get user preferences from settings (cache this too if needed)
        const useUnicodeSetting = appSession.settings.get<string>('use_unicode', 'true');
        const useUnicode = useUnicodeSetting === 'true' || useUnicodeSetting === 'TRUE' || useUnicodeSetting === '1';
        if (process.env.NODE_ENV !== 'production') {
            console.log(`[DEBUG] getCachedBoardText: useUnicode setting: ${useUnicodeSetting}, resolved: ${useUnicode}`);
        }
        
        // Check if we have a valid cached version
        if (cached && 
            cached.useUnicode === useUnicode && 
            (now - cached.timestamp) < this.BOARD_CACHE_DURATION) {
            if (process.env.NODE_ENV !== 'production') {
                console.log(`[DEBUG] getCachedBoardText: Using cached board text, length: ${cached.boardText.length}`);
            }
            return cached.boardText;
        }
        
        if (process.env.NODE_ENV !== 'production') {
            console.log(`[DEBUG] getCachedBoardText: Generating new board text`);
        }
        // Generate new board text (without captured pieces - they're now in combined content)
        const boardText = renderBoardString(state, { useUnicode });
        if (process.env.NODE_ENV !== 'production') {
            console.log(`[DEBUG] getCachedBoardText: Generated board text length: ${boardText.length}`);
        }
        
        // Cache the result
        this.boardCache.set(cacheKey, {
            boardText,
            timestamp: now,
            useUnicode
        });
        
        // Clean up old cache entries
        this.cleanupBoardCache();
        
        return boardText;
    }

    private cleanupBoardCache(): void {
        const now = Date.now();
        const maxAge = this.BOARD_CACHE_DURATION * 2; // Keep entries for 2x cache duration
        const maxCacheSize = 1000; // Maximum number of cached boards
        
        // If cache is too large, remove oldest entries
        if (this.boardCache.size > maxCacheSize) {
            const entries = Array.from(this.boardCache.entries());
            entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
            
            // Remove oldest entries to get back to 80% of max size
            const targetSize = Math.floor(maxCacheSize * 0.8);
            const toRemove = entries.slice(0, entries.length - targetSize);
            
            for (const [key] of toRemove) {
                this.boardCache.delete(key);
            }
            
            if (process.env.NODE_ENV !== 'production') {
                console.log(`[ChessServer] Board cache size limit reached, removed ${toRemove.length} oldest entries`);
            }
        }
        
        // Remove expired entries
        for (const [key, value] of this.boardCache.entries()) {
            if ((now - value.timestamp) > maxAge) {
                this.boardCache.delete(key);
            }
        }
    }

    private invalidateBoardCache(sessionId: string): void {
        // Remove all cache entries for this session
        for (const [key] of this.boardCache.entries()) {
            if (key.startsWith(sessionId + '_')) {
                this.boardCache.delete(key);
            }
        }
    }

    private setupPeriodicCleanup(): void {
        // Clean up board cache every 5 minutes
        this.cleanupInterval = setInterval(() => {
            try {
                this.cleanupBoardCache();
                const stats = this.getMemoryStats();
                console.log(`[ChessServer] Board cache cleanup completed. Cache size: ${stats.boardCacheSize}, Active sessions: ${stats.activeSessions}, Memory: ${stats.totalMemoryUsage}MB`);
            } catch (error) {
                console.error('[ChessServer] Error during board cache cleanup:', error);
            }
        }, 5 * 60 * 1000); // 5 minutes
    }

    /**
     * Set up multiplayer event handlers
     */
    private setupMultiplayerEventHandlers(): void {
        if (!this.networkService) return;

        // Handle incoming game requests (challenges)
        this.networkService.on('game_request', async (data) => {
            const { fromUserId, toUserId, gameId } = data;
            console.log(`[Multiplayer] Game request from ${fromUserId} to ${toUserId}, gameId: ${gameId}`);
            
            // Find the target user's session
            const targetSession = this.findUserSession(toUserId);
            if (targetSession) {
                await this.handleIncomingChallenge(targetSession.sessionId, fromUserId, gameId);
            }
        });

        // Handle game responses (challenge accepted/rejected)
        this.networkService.on('game_response', async (data) => {
            const { gameId, fromUserId, accepted } = data;
            console.log(`[Multiplayer] Game response for ${gameId}: ${accepted ? 'accepted' : 'rejected'}`);
            
            if (accepted) {
                await this.startMultiplayerGame(gameId, fromUserId);
            }
        });

        // Handle incoming moves
        this.networkService.on('move', async (data) => {
            const { gameId, fen, move } = data;
            console.log(`[Multiplayer] Received move for game ${gameId}: ${move.algebraic}`);
            
            await this.handleOpponentMove(gameId, fen, move);
        });

        // Handle game end
        this.networkService.on('game_end', async (data) => {
            const { gameId, reason, winner } = data;
            console.log(`[Multiplayer] Game ${gameId} ended: ${reason}, winner: ${winner}`);
            
            // Find the session for this game and handle the game end
            const sessions = this.sessionManager.getAllSessionIds();
            for (const sessionId of sessions) {
                const session = this.sessionManager.getSession(sessionId);
                if (session && session.info?.userId) {
                    // Check if this user is in the game
                    if (this.multiplayerGameManager?.isUserInGame(session.info.userId, gameId)) {
                        await this.handleMultiplayerGameEnd(sessionId, reason, winner);
                        break;
                    }
                }
            }
        });
    }

    /**
     * Show game mode selection menu to user
     */
    private async showGameModeSelection(sessionId: string): Promise<void> {
        const gameSession = this.sessionManager.getSession(sessionId);
        if (!gameSession) return;

        const { appSession, state } = gameSession;
        
        // Update session mode
        state.mode = SessionMode.CHOOSING_GAME_MODE;
        this.sessionManager.setState(sessionId, state);

        // Show game mode selection menu
        const menuText = GameModeCommandProcessor.getMenuText();
        
        await this.updateBoardAndFeedback(sessionId, 'Welcome to Chess! Select game mode.');

        this.updateDashboardContent(sessionId);
    }

    /**
     * Handle game mode command processing
     */
    private async handleGameModeCommand(sessionId: string, transcript: string): Promise<void> {
        const gameSession = this.sessionManager.getSession(sessionId);
        if (!gameSession) return;

        const { appSession, state } = gameSession;
        const userId = gameSession.info?.userId || '';
        
        const command = GameModeCommandProcessor.parseCommand(transcript);

        console.log(`[GameMode] Processing command: ${command.type}`, command.params);

        switch (command.type) {
            case 'ai_game':
                await this.startAIGame(sessionId, command.params?.difficulty);
                break;

            case 'friend_game':
                if (command.params?.friendName) {
                    await this.startFriendChallenge(sessionId, command.params.friendName);
                } else {
                    await this.showFriendSelection(sessionId);
                }
                break;

            case 'random_match':
                await this.joinRandomMatchmaking(sessionId);
                break;

            case 'show_menu':
                await this.showGameModeSelection(sessionId);
                break;

            case 'help':
                const helpText = GameModeCommandProcessor.getHelpText();
                await this.updateBoardAndFeedback(sessionId, 'Help: Say "play against AI" or "AI" to play against the computer, "play against [friend]" to challenge a friend, "find opponent" to play against a random opponent, or "menu" to return to the main menu.');
                this.updateDashboardContent(sessionId);
                break;

            case 'new_game':
                await this.startNewGame(sessionId);
                break;

            case 'accept':
            case 'reject':
            case 'cancel':
                // These should be handled in handleOpponentChoice, redirect there
                await this.handleOpponentChoice(sessionId, transcript);
                break;

            case 'unknown':
            default:
                await this.updateBoardAndFeedback(sessionId, 'Command not recognized. Say "help" for options or "menu" to return.');
                break;
        }
    }

    /**
     * Start AI game with specified difficulty
     */
    private async startAIGame(sessionId: string, difficulty?: string): Promise<void> {
        const gameSession = this.sessionManager.getSession(sessionId);
        if (!gameSession) return;

        const { appSession, state } = gameSession;

        // Set difficulty if provided
        if (difficulty && GameModeCommandProcessor.isValidDifficulty(difficulty)) {
            state.aiDifficulty = difficulty === 'easy' ? Difficulty.EASY : 
                                  difficulty === 'hard' ? Difficulty.HARD : Difficulty.MEDIUM;
        }

        // Set game mode
        state.gameMode = 'ai';
        state.mode = SessionMode.USER_TURN;
        this.sessionManager.setState(sessionId, state);

        // Save preference for future sessions
        // appSession.settings.set('game_mode', 'ai'); // TODO: Fix settings API

        await this.updateBoardAndFeedback(sessionId, `Starting AI game with ${state.aiDifficulty} difficulty. Good luck!`);

        await this.startGame(sessionId);
    }

    /**
     * Start friend challenge process
     */
    private async startFriendChallenge(sessionId: string, friendName: string): Promise<void> {
        const gameSession = this.sessionManager.getSession(sessionId);
        if (!gameSession || !this.matchmakingService) return;

        const { appSession } = gameSession;
        const userId = gameSession.info?.userId || '';

        try {
            // For demo purposes, we'll simulate finding the friend
            // In a real implementation, this would look up the friend by name/ID
            const friendUserId = `friend_${friendName.toLowerCase()}`;
            
            await this.updateBoardAndFeedback(sessionId, `Sending challenge to ${friendName}. Please wait for their response.`);

            const challenge = await this.matchmakingService.sendChallenge(userId, friendUserId);
            
            // Update session state to show waiting for response
            const state = gameSession.state;
            state.mode = SessionMode.CHOOSING_OPPONENT;
            this.sessionManager.setState(sessionId, state);

            this.updateDashboardContent(sessionId);

        } catch (error) {
            console.error(`Failed to send challenge to ${friendName}:`, error);
            await this.updateBoardAndFeedback(sessionId, `Sorry, I couldn't send a challenge to ${friendName}. They might not be online.`);
            await this.showGameModeSelection(sessionId);
        }
    }

    /**
     * Join random matchmaking queue
     */
    private async joinRandomMatchmaking(sessionId: string): Promise<void> {
        const gameSession = this.sessionManager.getSession(sessionId);
        if (!gameSession || !this.matchmakingService) return;

        const { appSession } = gameSession;
        const userId = gameSession.info?.userId || '';

        try {
            await this.matchmakingService.joinMatchmaking(userId, {
                timeControl: 'rapid',
                allowUnrated: true
            });

            await this.updateBoardAndFeedback(sessionId, 'Joining matchmaking queue. Looking for an opponent...');

            // Update session state
            const state = gameSession.state;
            state.mode = SessionMode.CHOOSING_OPPONENT;
            this.sessionManager.setState(sessionId, state);

            this.updateDashboardContent(sessionId);

        } catch (error) {
            console.error('Failed to join matchmaking:', error);
            await this.updateBoardAndFeedback(sessionId, 'Sorry, matchmaking is not available right now. Please try again later.');
            await this.showGameModeSelection(sessionId);
        }
    }

    /**
     * Show friend selection interface
     */
    private async showFriendSelection(sessionId: string): Promise<void> {
        const gameSession = this.sessionManager.getSession(sessionId);
        if (!gameSession) return;

        const { appSession } = gameSession;

        await this.updateBoardAndFeedback(sessionId, 'Say "play against" followed by your friend\'s name. For example, "play against Alice".');

        this.updateDashboardContent(sessionId);
    }

    /**
     * Find user session by userId
     */
    private findUserSession(userId: string): { sessionId: string; session: ChessSessionInfo } | null {
        const sessionIds = this.sessionManager.getAllSessionIds();
        for (const sessionId of sessionIds) {
            const session = this.sessionManager.getSession(sessionId);
            if (session?.info?.userId === userId) {
                return { sessionId, session: session.info };
            }
        }
        return null;
    }

    /**
     * Handle incoming challenge from another player
     */
    private async handleIncomingChallenge(sessionId: string, fromUserId: string, challengeId: string): Promise<void> {
        const gameSession = this.sessionManager.getSession(sessionId);
        if (!gameSession || !this.matchmakingService) return;

        const { appSession, state } = gameSession;

        try {
            // Get challenger's nickname
            const challengerNickname = await this.matchmakingService.getUserNickname(fromUserId);

            await this.updateBoardAndFeedback(sessionId, `${challengerNickname} has challenged you to a chess game! Say "accept" to play or "reject" to decline.`);

            // Update session to show pending challenge
            state.mode = SessionMode.CHOOSING_OPPONENT;
            // Store challenge info for later processing
            (state as any).pendingChallengeId = challengeId;
            (state as any).challengerName = challengerNickname;
            
            this.sessionManager.setState(sessionId, state);
            this.updateDashboardContent(sessionId);

        } catch (error) {
            console.error('Failed to handle incoming challenge:', error);
        }
    }

    /**
     * Start multiplayer game
     */
    private async startMultiplayerGame(gameId: string, opponentUserId: string): Promise<void> {
        if (!this.multiplayerGameManager) {
            console.error('MultiplayerGameManager not available');
            return;
        }

        // Get the current user's session to find their userId
        const currentSession = this.findUserSession(opponentUserId);
        if (!currentSession) {
            console.error('Could not find current user session');
            return;
        }

        const currentUserId = currentSession.session.userId;

        try {
            // Create the multiplayer game
            await this.multiplayerGameManager.createGame(gameId, currentUserId, opponentUserId);
            
            // Set up game event handlers for the current user
            this.setupMultiplayerGameHandlers(gameId, currentSession.sessionId);
            
            console.log(`[Multiplayer] Started game ${gameId} between ${currentUserId} and ${opponentUserId}`);
        } catch (error) {
            console.error(`Failed to start multiplayer game ${gameId}:`, error);
        }
    }

    /**
     * Set up event handlers for a specific multiplayer game
     */
    private setupMultiplayerGameHandlers(gameId: string, sessionId: string): void {
        if (!this.multiplayerGameManager) return;

        // Handle game state changes
        this.multiplayerGameManager.onGameStateChange(gameId, (state) => {
            this.handleMultiplayerGameStateChange(sessionId, state);
        });

        // Handle opponent moves
        this.multiplayerGameManager.onMove(gameId, (move, fen) => {
            this.handleOpponentMove(sessionId, move, fen);
        });

        // Handle game end
        this.multiplayerGameManager.onGameEnd(gameId, (reason, winner) => {
            this.handleMultiplayerGameEnd(sessionId, reason, winner);
        });
    }

    /**
     * Handle multiplayer game state changes
     */
    private async handleMultiplayerGameStateChange(sessionId: string, state: SessionState): Promise<void> {
        const gameSession = this.sessionManager.getSession(sessionId);
        if (!gameSession) return;

        // Update the session state
        gameSession.state = { ...gameSession.state, ...state };
        this.sessionManager.setState(sessionId, gameSession.state);

        // Update the board display
        await this.updateBoardAndFeedback(sessionId, 'Opponent made a move!');
        this.updateDashboardContent(sessionId);
    }

    /**
     * Handle opponent move in multiplayer game
     */
    private async handleOpponentMove(sessionId: string, move: GameMove, fen: string): Promise<void> {
        const gameSession = this.sessionManager.getSession(sessionId);
        if (!gameSession) return;

        const { appSession } = gameSession;

        // Announce the move
        const moveText = move.algebraic || `${move.from} to ${move.to}`;
        await this.updateBoardAndFeedback(sessionId, `Opponent played: ${moveText}`);
        
        // Update dashboard
        this.updateDashboardContent(sessionId);
    }

    /**
     * Handle multiplayer game end
     */
    private async handleMultiplayerGameEnd(sessionId: string, reason: string, winner?: string): Promise<void> {
        const gameSession = this.sessionManager.getSession(sessionId);
        if (!gameSession) return;

        const { appSession } = gameSession;
        const userId = gameSession.info?.userId || '';

        // Update session state
        gameSession.state.mode = SessionMode.GAME_OVER;
        gameSession.state.gameResult = winner === userId ? 'white_win' : 
                                       winner ? 'black_win' : 'draw';
        this.sessionManager.setState(sessionId, gameSession.state);

        // Announce game end
        let endMessage = '';
        if (winner === userId) {
            endMessage = 'Congratulations! You won!';
        } else if (winner) {
            endMessage = 'Game over. You lost.';
        } else {
            endMessage = 'Game ended in a draw.';
        }

        await this.updateBoardAndFeedback(sessionId, endMessage);
        this.updateDashboardContent(sessionId);

        // Clean up the game after a delay
        setTimeout(async () => {
            if (this.multiplayerGameManager) {
                await this.multiplayerGameManager.cleanupGame(sessionId);
            }
        }, 5000);
    }



    /**
     * Start a new game, resetting the board and game state
     */
    private async startNewGame(sessionId: string): Promise<void> {
        const gameSession = this.sessionManager.getSession(sessionId);
        if (!gameSession) {
            console.log(`[DEBUG] startNewGame: No game session found for sessionId: ${sessionId}`);
            return;
        }

        console.log(`[DEBUG] startNewGame: Starting new game for session: ${sessionId}`);
        const { state } = gameSession;
        
        try {
            // Reset game state to initial values
            state.board = initializeBoard();
            state.capturedByWhite = [];
            state.capturedByBlack = [];
            state.currentPlayer = PlayerColor.WHITE;
            state.currentFEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
            state.castlingRights = "KQkq";
            state.enPassantTarget = "-";
            state.halfmoveClock = 0;
            state.fullmoveNumber = 1;
            state.moveHistory = [];
            state.isCheck = false;
            state.isCheckmate = false;
            state.isStalemate = false;
            state.gameResult = undefined;
            state.clarificationData = undefined;
            state.gameStartTime = new Date();
            state.lastActivityTime = new Date();

            // Clear any pending timeouts
            if (state.timeoutId) {
                clearTimeout(state.timeoutId);
                state.timeoutId = null;
            }

            // Invalidate board cache since we have a new board
            this.invalidateBoardCache(sessionId);

            // Show the new game board
            await this.updateBoardAndFeedback(sessionId, 'New game started! Board reset to starting position.');
            this.updateDashboardContent(sessionId);

            console.log(`[DEBUG] startNewGame: New game started successfully`);
        } catch (error) {
            console.error(`[DEBUG] startNewGame: Error starting new game:`, error);
            await this.updateBoardAndFeedback(sessionId, 'Error starting new game. Please try again.');
        }
    }

    private async startGame(sessionId: string): Promise<void> {
        const gameSession = this.sessionManager.getSession(sessionId);
        if (!gameSession) {
            console.log(`[DEBUG] startGame: No game session found for sessionId: ${sessionId}`);
            return;
        }

        console.log(`[DEBUG] startGame: Found game session for sessionId: ${sessionId}`);
        const { state } = gameSession;
        
        try {
            console.log(`[DEBUG] startGame: Calling updateBoardAndFeedback`);
            await this.updateBoardAndFeedback(sessionId, 'Game started!');
            console.log(`[DEBUG] startGame: updateBoardAndFeedback completed`);

            // Determine first player
            if (state.userColor === PlayerColor.BLACK) {
                console.log(`[DEBUG] startGame: User is black, AI goes first`);
                state.currentPlayer = PlayerColor.WHITE;
                await this.makeAIMove(sessionId);
            } else {
                console.log(`[DEBUG] startGame: User is white, user goes first`);
                state.currentPlayer = PlayerColor.WHITE;
                await this.promptUserMove(sessionId);
            }
            console.log(`[DEBUG] startGame: Game initialization completed`);
        } catch (error) {
            console.error(`[DEBUG] startGame: Error during game start:`, error);
            throw error;
        }
    }

    private async promptUserMove(sessionId: string): Promise<void> {
        const gameSession = this.sessionManager.getSession(sessionId);
        if (!gameSession) return;
        const { state } = gameSession;
        
        // Update check status for current player
        state.isCheck = isInCheck(state.board, state.currentPlayer);
        
        // Debug logging for check detection
        if (state.isCheck) {
            console.log(`Check detected for ${state.currentPlayer} player`);
        }
        
        const turnText = state.currentPlayer === PlayerColor.WHITE ? "White's Turn" : "Black's Turn";
        let feedback = state.userColor === state.currentPlayer ? "Your turn!" : "AI thinking...";
        
        // Add check indication if the current player is in check
        if (state.isCheck && state.currentPlayer === state.userColor) {
            feedback += "\nYou are in CHECK!";
        } else if (state.isCheck && state.currentPlayer !== state.userColor) {
            feedback += "\nAI is in check!";
        }
        
        await this.updateBoardAndFeedback(sessionId, `${turnText}\n${feedback}`);
        this.updateDashboardContent(sessionId);
    }

    private async handleUserInput(sessionId: string, transcript: string): Promise<void> {
        const gameSession = this.sessionManager.getSession(sessionId);
        if (!gameSession) return;

        const { appSession, state } = gameSession;

        try {
            // Add safeguards to prevent processing incomplete commands
            const trimmedTranscript = transcript.trim();
            
            // Skip very short inputs that are likely incomplete
            if (trimmedTranscript.length < 2) {
                console.log(`[Transcription] Skipping very short input: "${trimmedTranscript}"`);
                return;
            }
            
            // Skip inputs that end with common incomplete words
            const incompleteEndings = ['hel', 'he', 'h', 'pl', 'p', 'roo', 'ro', 'r', 'kni', 'kni', 'kn', 'k'];
            
            // Only check for incomplete endings if the input is actually incomplete
            // Complete words like "help", "menu", "play", etc. should not be flagged as incomplete
            const completeWords = ['help', 'menu', 'play', 'game', 'ai', 'computer', 'bot', 'friend', 'buddy', 'mate', 'opponent', 'match', 'find', 'get', 'search', 'quick', 'single', 'multi', 'player', 'mode', 'easy', 'medium', 'hard', 'accept', 'reject', 'cancel', 'back', 'stop', 'yes', 'no', 'okay', 'ok', 'what', 'how', 'commands', 'options', 'settings', 'new', 'start', 'over', 'restart', 'again'];
            
            const lowerInput = trimmedTranscript.toLowerCase();
            const isCompleteWord = completeWords.includes(lowerInput);
            const matchingEnding = incompleteEndings.find(ending => lowerInput.endsWith(ending));
            
            if (matchingEnding && !isCompleteWord) {
                console.log(`[Transcription] Skipping likely incomplete input: "${trimmedTranscript}" (ends with "${matchingEnding}")`);
                return;
            }

            appSession.logger.debug('Processing user input', { transcript: trimmedTranscript, mode: state.mode });

            // Check for global commands that work in any game state
            if (lowerInput.includes('new game') || lowerInput.includes('start over') || lowerInput.includes('restart') || lowerInput.includes('play again')) {
                await this.startNewGame(sessionId);
                return;
            }

            switch (state.mode) {
                case SessionMode.CHOOSING_GAME_MODE:
                    await this.handleGameModeCommand(sessionId, trimmedTranscript);
                    break;

                case SessionMode.CHOOSING_OPPONENT:
                    await this.handleOpponentChoice(sessionId, trimmedTranscript);
                    break;

                case SessionMode.USER_TURN:
                    await this.handleUserMove(sessionId, trimmedTranscript);
                    break;

                case SessionMode.AWAITING_CLARIFICATION:
                    await this.handleClarification(sessionId, trimmedTranscript);
                    break;

                default:
                    appSession.logger.warn('Unexpected input in current mode', { mode: state.mode });
            }
        } catch (error) {
            console.error('Error processing user input:', error);
            await this.updateBoardAndFeedback(sessionId, 'Error processing input. Please try again.');
        }
    }

    /**
     * Debounce command processing to prevent premature execution
     */
    private debounceCommandProcessing(sessionId: string, transcript: string): void {
        // Clear any existing timer for this session
        const existingTimer = this.commandDebounceTimers.get(sessionId);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        // Set a new timer
        const timer = setTimeout(() => {
            console.log(`[Transcription] Processing debounced command: "${transcript}"`);
            this.handleUserInput(sessionId, transcript);
            this.commandDebounceTimers.delete(sessionId);
        }, this.COMMAND_DEBOUNCE_DELAY);

        this.commandDebounceTimers.set(sessionId, timer);
    }

    /**
     * Handle opponent choice commands (accept/reject challenges)
     */
    private async handleOpponentChoice(sessionId: string, transcript: string): Promise<void> {
        const gameSession = this.sessionManager.getSession(sessionId);
        if (!gameSession || !this.matchmakingService) return;

        const { appSession, state } = gameSession;
        const userId = gameSession.info?.userId || '';
        const input = transcript.toLowerCase().trim();

        // Check for challenge response commands
        if (input.includes('accept')) {
            const challengeId = (state as any).pendingChallengeId;
            if (challengeId) {
                try {
                    const accepted = await this.matchmakingService.acceptChallenge(challengeId, userId);
                    if (accepted) {
                        await this.updateBoardAndFeedback(sessionId, 'Challenge accepted! Starting game...');
                        // The game will be started by the multiplayer event handler
                    } else {
                        await this.updateBoardAndFeedback(sessionId, 'Sorry, the challenge is no longer valid.');
                        await this.showGameModeSelection(sessionId);
                    }
                } catch (error) {
                    console.error('Failed to accept challenge:', error);
                    await this.updateBoardAndFeedback(sessionId, 'Sorry, I couldn\'t accept the challenge. Please try again.');
                }
            }
        } else if (input.includes('reject') || input.includes('decline')) {
            const challengeId = (state as any).pendingChallengeId;
            if (challengeId) {
                try {
                    await this.matchmakingService.rejectChallenge(challengeId, userId);
                    await this.updateBoardAndFeedback(sessionId, 'Challenge declined.');
                    await this.showGameModeSelection(sessionId);
                } catch (error) {
                    console.error('Failed to reject challenge:', error);
                }
            }
        } else if (input.includes('cancel') || input.includes('back') || input.includes('menu')) {
            // Cancel current matchmaking/challenge
            try {
                await this.matchmakingService.leaveMatchmaking(userId);
                await this.updateBoardAndFeedback(sessionId, 'Cancelled.');
                await this.showGameModeSelection(sessionId);
            } catch (error) {
                console.error('Failed to cancel matchmaking:', error);
            }
        } else {
            // Try processing as a game mode command in case they want to switch
            await this.handleGameModeCommand(sessionId, transcript);
        }
    }

    private async handleUserMove(sessionId: string, transcript: string): Promise<void> {
        const gameSession = this.sessionManager.getSession(sessionId);
        if (!gameSession) return;

        const { state } = gameSession;

        try {
            // Check if it's the user's turn
            if (state.currentPlayer !== state.userColor) {
                await this.updateBoardAndFeedback(sessionId, "Please wait for the AI to make its move.");
                return;
            }

            // Check for castling command first
            const castlingSide = parseCastlingTranscript(transcript);
            if (castlingSide) {
                await this.handleCastlingMove(sessionId, castlingSide);
                return;
            }

            // Use parseChessMove for robust parsing (captures, promotions, etc.)
            let moveData = parseChessMove(transcript);
            if (!moveData) {
                // Fallback to parseMoveTranscript for simple cases
                const fallback = parseMoveTranscript(transcript);
                if (fallback) {
                    moveData = { piece: fallback.piece, to: fallback.target };
                }
            }
            if (!moveData) {
                let errorMessage = "Please specify a piece and square (e.g., 'rook to d4' or 'pawn e5') or say 'kingside' or 'queenside' to castle.";
                if (state.isCheck) {
                    errorMessage += "\nYou are in CHECK! You must move to get out of check.";
                }
                await this.updateBoardAndFeedback(sessionId, errorMessage);
                return;
            }

            const { piece, to, isCapture } = moveData;
            const targetCoords = algebraicToCoords(to.toLowerCase());

            if (!targetCoords) {
                let errorMessage = "Invalid square. Please use standard chess notation (e.g., 'e4', 'd5').";
                if (state.isCheck) {
                    errorMessage += "\nYou are in CHECK! You must move to get out of check.";
                }
                await this.updateBoardAndFeedback(sessionId, errorMessage);
                return;
            }

            // Normalize piece character case to match board representation
            const pieceChar = (state.userColor === PlayerColor.WHITE) ? piece.toUpperCase() : piece.toLowerCase();
            const possibleMoves = findPossibleMoves(state.board, state.userColor, pieceChar as Piece, targetCoords);
            // Filter to only legal moves
            const legalMoves = possibleMoves.filter(move =>
                validateMove(state.board, move.source, targetCoords, state.userColor, state.castlingRights).isValid
            );

            // --- Enhanced capture handling ---
            if (isCapture) {
                const [targetRow, targetCol] = targetCoords;
                const targetPiece = state.board[targetRow]?.[targetCol];
                if (!targetPiece || targetPiece === ' ') {
                    let errorMessage = `There is no piece to capture on ${to}.`;
                    if (state.isCheck) {
                        errorMessage += "\nYou are in CHECK! You must move to get out of check.";
                    }
                    await this.updateBoardAndFeedback(sessionId, errorMessage);
                    return;
                }
                // Find moves that would capture at this square
                if (legalMoves.length === 0) {
                    let errorMessage = `No ${piece} can capture on ${to}.`;
                    if (state.isCheck) {
                        errorMessage += "\nYou are in CHECK! You must move to get out of check.";
                    }
                    await this.updateBoardAndFeedback(sessionId, errorMessage);
                    return;
                }
                // Try to validate each possible move
                let validMove: PotentialMove | null = null;
                let validationError: string | null = null;
                for (const move of legalMoves) {
                    const validation = validateMove(state.board, move.source, targetCoords, state.userColor, state.castlingRights);
                    if (validation.isValid) {
                        validMove = move;
                        break;
                    } else {
                        validationError = validation.error ?? '';
                    }
                }
                if (!validMove) {
                    let errorMessage = validationError ? `Cannot capture on ${to}: ${validationError}` : `Cannot capture on ${to}.`;
                    if (state.isCheck) {
                        errorMessage += "\nYou are in CHECK! You must move to get out of check.";
                    }
                    await this.updateBoardAndFeedback(sessionId, errorMessage);
                    return;
                }
                await this.executeUserMove(sessionId, validMove, targetCoords);
                return;
            }

            // --- Existing logic for non-capture moves ---
            if (legalMoves.length === 0) {
                let errorMessage = `No ${piece} can move to ${to}.`;
                if (state.isCheck) {
                    errorMessage += "\nYou are in CHECK! You must move to get out of check.";
                } else {
                    errorMessage += " Please try a different move.";
                }
                await this.updateBoardAndFeedback(sessionId, errorMessage);
                return;
            }

            if (legalMoves.length === 1) {
                // Unambiguous move
                const move = legalMoves[0];
                if (move) {
                    await this.executeUserMove(sessionId, move, targetCoords);
                }
            } else {
                // Ambiguous move - need clarification
                await this.handleAmbiguousMove(sessionId, piece as Piece, targetCoords, legalMoves);
            }
        } catch (error) {
            console.error('Error in handleUserMove:', error);
            await this.updateBoardAndFeedback(sessionId, 'Error processing move. Please try again.');
        }
    }

    private async handleAmbiguousMove(
        sessionId: string, 
        piece: Piece, 
        targetCoords: Coordinates, 
        possibleMoves: PotentialMove[]
    ): Promise<void> {
        const gameSession = this.sessionManager.getSession(sessionId);
        if (!gameSession) return;

        const { state } = gameSession;

        // Store clarification data
        state.clarificationData = {
            pieceType: piece,
            targetSquare: targetCoords,
            possibleMoves
        } as ClarificationData;

        state.mode = SessionMode.AWAITING_CLARIFICATION;

        // Display options to user
        let optionsText = `Multiple ${piece}s can move to ${coordsToAlgebraic(targetCoords)}:\n`;
        possibleMoves.forEach((move, index) => {
            const sourceSquare = coordsToAlgebraic(move.source);
            optionsText += `${index + 1}. ${piece} from ${sourceSquare}\n`;
        });
        optionsText += "\nSay the number to choose.";
        await this.updateBoardAndFeedback(sessionId, optionsText);
        this.updateDashboardContent(sessionId);

        // Set timeout for clarification
        state.timeoutId = setTimeout(() => {
            this.handleClarificationTimeout(sessionId);
        }, this.CLARIFICATION_TIMEOUT);
    }

    private async handleClarification(sessionId: string, transcript: string): Promise<void> {
        const gameSession = this.sessionManager.getSession(sessionId);
        if (!gameSession) return;

        const { appSession, state } = gameSession;

        // Clear timeout
        if (state.timeoutId) {
            clearTimeout(state.timeoutId);
            state.timeoutId = null;
        }

        const choice = parseClarificationTranscript(transcript);
        if (!choice || choice < 1 || choice > (state.clarificationData?.possibleMoves.length || 0)) {
            await this.updateBoardAndFeedback(sessionId, "Please say a valid number to choose your move.");
            return;
        }

        const selectedMove = state.clarificationData?.possibleMoves[choice - 1];
        if (!selectedMove) {
            await this.updateBoardAndFeedback(sessionId, "Invalid move selection. Please try again.");
            return;
        }
        
        await this.executeUserMove(sessionId, selectedMove, state.clarificationData!.targetSquare);
    }

    private async handleClarificationTimeout(sessionId: string): Promise<void> {
        const gameSession = this.sessionManager.getSession(sessionId);
        if (!gameSession) {
            // Session was already cleaned up, ignore timeout
            console.log(`[ChessServer] Clarification timeout for non-existent session: ${sessionId}`);
            return;
        }

        const { appSession, state } = gameSession;

        // Double-check that we're still in clarification mode
        if (state.mode !== SessionMode.AWAITING_CLARIFICATION) {
            console.log(`[ChessServer] Clarification timeout but not in clarification mode: ${sessionId}, mode: ${state.mode}`);
            return;
        }

        state.mode = SessionMode.USER_TURN;
        state.clarificationData = undefined;
        state.timeoutId = null;

        try {
            await this.updateBoardAndFeedback(sessionId, "Move clarification timed out. Please make your move again.");
            // Update dashboard
            this.updateDashboardContent(sessionId);
        } catch (error) {
            console.error(`[ChessServer] Error handling clarification timeout for session ${sessionId}:`, error);
        }
    }

    private async handleCastlingMove(sessionId: string, side: 'kingside' | 'queenside'): Promise<void> {
        const gameSession = this.sessionManager.getSession(sessionId);
        if (!gameSession) return;

        const { appSession, state } = gameSession;

        // Validate castling
        const validation = validateMove(
            state.board, 
            [state.userColor === PlayerColor.WHITE ? 7 : 0, 4], // King position
            [state.userColor === PlayerColor.WHITE ? 7 : 0, side === 'kingside' ? 6 : 2], // Target position
            state.userColor,
            state.castlingRights
        );

        if (!validation.isValid) {
            await this.updateBoardAndFeedback(sessionId, `Cannot castle ${side}: ${validation.error}`);
            return;
        }

        // Execute castling
        const { updatedBoard, kingMove, rookMove } = executeCastling(state.board, state.userColor, side);
        state.board = updatedBoard;

        // Update castling rights
        state.castlingRights = updateCastlingRights(
            state.board, 
            kingMove.from, 
            kingMove.to, 
            state.userColor, 
            state.castlingRights
        );

        // Update game state
        state.currentPlayer = state.currentPlayer === PlayerColor.WHITE ? PlayerColor.BLACK : PlayerColor.WHITE;
        
        // Increment move counter after Black's move (complete turn cycle)
        if (state.currentPlayer === PlayerColor.WHITE) {
            state.fullmoveNumber++;
        }
        
        state.currentFEN = boardToFEN(state);
        state.clarificationData = undefined;
        state.isCheck = validation.isCheck || false;

        // Add castling move to history
        const castlingNotation = side === 'kingside' ? 'O-O' : 'O-O-O';
        state.moveHistory.push({
            from: kingMove.from,
            to: kingMove.to,
            piece: state.userColor === PlayerColor.WHITE ? 'K' : 'k',
            algebraic: castlingNotation,
            timestamp: new Date(),
            isCastling: true,
            castlingSide: side
        });

        // Display updated board
        await this.updateBoardAndFeedback(sessionId, 'Move made!');
        this.updateDashboardContent(sessionId);

        // Check for game over
        const gameEnd = checkGameEnd(state.board, state.currentPlayer);
        if (gameEnd.isOver) {
            const message = gameEnd.reason === 'checkmate' ? 'Checkmate!' : 
                           gameEnd.reason === 'stalemate' ? 'Stalemate!' : 'Game Over!';
            await this.handleGameOver(sessionId, message, gameEnd.result);
            return;
        }

        // Switch to AI turn
        state.mode = SessionMode.AI_TURN;
        await this.makeAIMove(sessionId);
    }

    private async executeUserMove(sessionId: string, move: PotentialMove, targetCoords: Coordinates): Promise<void> {
        const gameSession = this.sessionManager.getSession(sessionId);
        if (!gameSession) return;

        const { state } = gameSession;

        // Validate the move before executing
        const validation = validateMove(state.board, move.source, targetCoords, state.userColor, state.castlingRights);
        if (!validation.isValid) {
            await this.updateBoardAndFeedback(sessionId, `Invalid move: ${validation.error}`);
            return;
        }

        // Execute the move
        const { updatedBoard, capturedPiece } = executeMove(state.board, move.source, targetCoords);
        state.board = updatedBoard;

        // Update captured pieces
        if (capturedPiece !== ' ') {
            // Add captured piece to the array of the color that captured it
            // Since pieces can only be captured by the opposite color, use the piece's color
            if (capturedPiece === capturedPiece.toUpperCase()) {
                // White piece was captured, add to Black's captures
                state.capturedByBlack.push(capturedPiece);
            } else {
                // Black piece was captured, add to White's captures
                state.capturedByWhite.push(capturedPiece);
            }
        }

        // Update castling rights
        state.castlingRights = updateCastlingRights(
            state.board, 
            move.source, 
            targetCoords, 
            state.userColor, 
            state.castlingRights
        );

        // Update game state
        state.currentPlayer = state.currentPlayer === PlayerColor.WHITE ? PlayerColor.BLACK : PlayerColor.WHITE;
        
        // Increment move counter after Black's move (complete turn cycle)
        if (state.currentPlayer === PlayerColor.WHITE) {
            state.fullmoveNumber++;
        }
        
        state.currentFEN = boardToFEN(state);
        state.clarificationData = undefined;
        state.isCheck = validation.isCheck || false;

        // Invalidate board cache since the board has changed
        this.invalidateBoardCache(sessionId);

        // Display updated board
        await this.updateBoardAndFeedback(sessionId, 'Move made!');
        this.updateDashboardContent(sessionId);

        // Check for game over
        const gameEnd = checkGameEnd(state.board, state.currentPlayer);
        if (gameEnd.isOver) {
            const message = gameEnd.reason === 'checkmate' ? 'Checkmate!' : 
                           gameEnd.reason === 'stalemate' ? 'Stalemate!' : 'Game Over!';
            await this.handleGameOver(sessionId, message, gameEnd.result);
            return;
        }

        // Switch to AI turn
        state.mode = SessionMode.AI_TURN;
        await this.makeAIMove(sessionId);
    }

    private async makeAIMove(sessionId: string): Promise<void> {
        const gameSession = this.sessionManager.getSession(sessionId);
        if (!gameSession) return;

        const { state } = gameSession;
        await this.updateBoardAndFeedback(sessionId, "AI is thinking...");

        // Determine AI color (opposite of user)
        const aiColor = state.userColor === PlayerColor.WHITE ? PlayerColor.BLACK : PlayerColor.WHITE;
        const maxRetries = 3;
        let aiMove: { source: Coordinates; target: Coordinates; piece: Piece } | null = null;
        let validMoveFound = false;
        let attempt = 0;
        let usedStockfish = false;
        let originalCurrentPlayer = state.currentPlayer;

        console.log(`[DEBUG] makeAIMove: Starting AI move generation for session: ${sessionId}`);
        console.log(`[DEBUG] makeAIMove: AI color: ${aiColor}, User color: ${state.userColor}`);
        console.log(`[DEBUG] makeAIMove: Stockfish service available: ${!!this.stockfishService}`);
        console.log(`[DEBUG] makeAIMove: Stockfish engine ready: ${this.stockfishService?.isEngineReady()}`);

        // --- Try Stockfish up to maxRetries ---
        if (this.stockfishService && this.stockfishService.isEngineReady()) {
            usedStockfish = true;
            console.log(`[DEBUG] makeAIMove: Attempting Stockfish move generation`);
            while (attempt < maxRetries && !validMoveFound) {
                attempt++;
                console.log(`[DEBUG] makeAIMove: Stockfish attempt ${attempt}/${maxRetries}`);
                try {
                    // Temporarily set currentPlayer to AI for FEN
                    state.currentPlayer = aiColor;
                    console.log(`[DEBUG] makeAIMove: Current FEN: ${state.currentFEN}`);
                    const stockfishMove = await this.stockfishService.getBestMove(
                        state,
                        state.aiDifficulty || Difficulty.MEDIUM,
                        3000
                    );
                    state.currentPlayer = originalCurrentPlayer; // Restore

                    console.log(`[DEBUG] makeAIMove: Stockfish returned move: ${JSON.stringify(stockfishMove)}`);
                    if (stockfishMove) {
                        const internalMove = stockfishMoveToInternal(stockfishMove, state.board);
                        console.log(`[DEBUG] makeAIMove: Converted to internal move: ${JSON.stringify(internalMove)}`);
                        if (internalMove) {
                            // Validate move
                            const validation = validateMove(state.board, internalMove.source, internalMove.target, aiColor, state.castlingRights);
                            console.log(`[DEBUG] makeAIMove: Move validation result: ${validation.isValid}, error: ${validation.error}`);
                            if (validation.isValid) {
                                aiMove = {
                                    source: internalMove.source,
                                    target: internalMove.target,
                                    piece: internalMove.piece
                                };
                                validMoveFound = true;
                                console.log(`[DEBUG] makeAIMove: Stockfish move validated successfully`);
                                break;
                            } else {
                                console.warn(`Stockfish suggested invalid move (attempt ${attempt}): ${internalMove.piece} from ${coordsToAlgebraic(internalMove.source)} to ${coordsToAlgebraic(internalMove.target)}: ${validation.error}`);
                            }
                        } else {
                            console.warn(`[DEBUG] makeAIMove: Failed to convert Stockfish move to internal format`);
                        }
                    } else {
                        console.warn(`[DEBUG] makeAIMove: Stockfish returned null move`);
                    }
                } catch (err) {
                    console.warn(`[DEBUG] makeAIMove: Stockfish move failed:`, err);
                }
            }
        } else {
            console.log(`[DEBUG] makeAIMove: Stockfish not available or not ready, skipping`);
        }

        // --- Fallback to simple AI if needed ---
        if (!validMoveFound) {
            console.log(`[DEBUG] makeAIMove: Stockfish failed, falling back to simple AI`);
            attempt = 0;
            while (attempt < maxRetries && !validMoveFound) {
                attempt++;
                console.log(`[DEBUG] makeAIMove: Simple AI attempt ${attempt}/${maxRetries}`);
                const simpleMove = this.generateSimpleAIMove(state, aiColor);
                if (simpleMove) {
                    console.log(`[DEBUG] makeAIMove: Simple AI suggested move: ${JSON.stringify(simpleMove)}`);
                    const validation = validateMove(state.board, simpleMove.source, simpleMove.target, aiColor, state.castlingRights);
                    console.log(`[DEBUG] makeAIMove: Simple AI move validation: ${validation.isValid}, error: ${validation.error}`);
                    if (validation.isValid) {
                        aiMove = simpleMove;
                        validMoveFound = true;
                        console.log(`[DEBUG] makeAIMove: Simple AI move validated successfully`);
                        break;
                    } else {
                        console.warn(`Simple AI suggested invalid move (attempt ${attempt}): ${simpleMove.piece} from ${coordsToAlgebraic(simpleMove.source)} to ${coordsToAlgebraic(simpleMove.target)}: ${validation.error}`);
                    }
                } else {
                    console.warn(`[DEBUG] makeAIMove: Simple AI returned null move`);
                }
            }
        }

        // --- If no valid move found, inform user and switch turn ---
        if (!validMoveFound || !aiMove) {
            console.log(`[DEBUG] makeAIMove: No valid move found after all attempts`);
            await this.updateBoardAndFeedback(sessionId, usedStockfish ? "AI couldn't find a valid move (Stockfish and fallback failed)" : "AI couldn't find a valid move");
            state.mode = SessionMode.USER_TURN;
            await this.promptUserMove(sessionId);
            return;
        }

        console.log(`[DEBUG] makeAIMove: Executing AI move: ${aiMove.piece} from ${coordsToAlgebraic(aiMove.source)} to ${coordsToAlgebraic(aiMove.target)}`);

        // --- Execute the valid AI move ---
        const { updatedBoard, capturedPiece } = executeMove(state.board, aiMove.source, aiMove.target);
        state.board = updatedBoard;

        // Update captured pieces
        if (capturedPiece !== ' ') {
            // Add captured piece to the array of the color that captured it
            // Since pieces can only be captured by the opposite color, use the piece's color
            if (capturedPiece === capturedPiece.toUpperCase()) {
                // White piece was captured, add to Black's captures
                state.capturedByBlack.push(capturedPiece);
            } else {
                // Black piece was captured, add to White's captures
                state.capturedByWhite.push(capturedPiece);
            }
        }

        // Update game state
        state.currentPlayer = state.currentPlayer === PlayerColor.WHITE ? PlayerColor.BLACK : PlayerColor.WHITE;
        
        // Increment move counter after Black's move (complete turn cycle)
        if (state.currentPlayer === PlayerColor.WHITE) {
            state.fullmoveNumber++;
        }
        
        state.currentFEN = boardToFEN(state);
        
        // Update check status for the new current player
        state.isCheck = isInCheck(state.board, state.currentPlayer);
        
        // Debug logging for check detection
        if (state.isCheck) {
            console.log(`Check detected for ${state.currentPlayer} player after AI move`);
        }

        // Invalidate board cache since the board has changed
        this.invalidateBoardCache(sessionId);

        // Display AI move
        const sourceSquare = coordsToAlgebraic(aiMove.source);
        const targetSquare = coordsToAlgebraic(aiMove.target);
        await this.updateBoardAndFeedback(sessionId, `AI moved ${aiMove.piece} from ${sourceSquare} to ${targetSquare}`);
        this.updateDashboardContent(sessionId);

        // Check for game over
        const gameEnd = checkGameEnd(state.board, state.currentPlayer);
        if (gameEnd.isOver) {
            const message = gameEnd.reason === 'checkmate' ? 'Checkmate!' : 
                           gameEnd.reason === 'stalemate' ? 'Stalemate!' : 'Game Over!';
            await this.handleGameOver(sessionId, message, gameEnd.result);
            return;
        }

        // Switch to user turn
        state.mode = SessionMode.USER_TURN;
        await this.promptUserMove(sessionId);
    }

    // Update generateSimpleAIMove to accept aiColor
    private generateSimpleAIMove(state: SessionState, aiColor: PlayerColor): { source: Coordinates; target: Coordinates; piece: Piece } | null {
        // Find all AI pieces
        const aiPieces: Array<{ coords: Coordinates; piece: Piece }> = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = state.board[r]?.[c];
                if (piece && piece !== ' ' && 
                    ((aiColor === PlayerColor.WHITE && piece === piece.toUpperCase()) ||
                     (aiColor === PlayerColor.BLACK && piece === piece.toLowerCase()))) {
                    aiPieces.push({ coords: [r, c], piece });
                }
            }
        }

        // Try all possible moves for each piece, return the first valid one
        for (const { coords, piece } of aiPieces) {
            for (let tr = 0; tr < 8; tr++) {
                for (let tc = 0; tc < 8; tc++) {
                    const validation = validateMove(state.board, coords, [tr, tc], aiColor, state.castlingRights);
                    if (validation.isValid) {
                        return { source: coords, target: [tr, tc], piece };
                    }
                }
            }
        }
        return null;
    }

    private async handleGameOver(sessionId: string, message: string, result?: 'white_win' | 'black_win' | 'draw'): Promise<void> {
        const gameSession = this.sessionManager.getSession(sessionId);
        if (!gameSession) return;

        const { state } = gameSession;

        state.mode = SessionMode.GAME_OVER;
        state.gameResult = result;

        await this.updateBoardAndFeedback(sessionId, `Game Over!\n${message}`);
        this.updateDashboardContent(sessionId);
    }

    private async handleButtonPress(sessionId: string, data: any): Promise<void> {
        const gameSession = this.sessionManager.getSession(sessionId);
        if (!gameSession) return;

        const { appSession } = gameSession;
        
        // Handle hardware button presses for navigation
        if (data.buttonId === 'primary' && data.pressType === 'press') {
            // Primary button: refresh board and show current state
            await this.updateBoardAndFeedback(sessionId, 'Board refreshed!');
        } else if (data.buttonId === 'secondary' && data.pressType === 'long') {
            // Secondary button long press: show help
            await appSession.layouts.showReferenceCard(
                'Chess Help',
                'Voice Commands:\n• "rook to d4" - Move piece\n• "pond e4" - Move pawn (pond works too!)\n• "night to f3" - Move knight (night works too!)\n• "kingside/queenside" - Castle\n• "one/two/three" - Choose move\n\nPress primary button to refresh board if stuck.'
            );
        } else if (data.buttonId === 'secondary' && data.pressType === 'press') {
            // Secondary button short press: show current game status
            const { state } = gameSession;
            const turnText = state.currentPlayer === PlayerColor.WHITE ? "White's Turn" : "Black's Turn";
            const isUserTurn = state.currentPlayer === state.userColor;
            const status = isUserTurn ? "Your turn!" : "AI thinking...";
            await this.updateBoardAndFeedback(sessionId, `${turnText}\n${status}`);
        }
    }

    private async handleHeadPosition(sessionId: string, data: any): Promise<void> {
        // Handle head position changes for UI context
        // Could be used to show different information based on where user is looking
        if (data.position === 'up') {
            // User looking up - dashboard is already handled by dashboard mode change
            const session = this.sessionManager.getSession(sessionId);
            if (!session) return;
            const { appSession } = session;
            appSession.logger.debug('User looked up - dashboard should be visible');
        }
    }

    private async handleVoiceActivity(sessionId: string, data: any): Promise<void> {
        const gameSession = this.sessionManager.getSession(sessionId);
        if (!gameSession) return;

        const { appSession } = gameSession;
        const isSpeaking = data.status === true || data.status === "true";

        if (isSpeaking) {
            appSession.logger.debug('User started speaking');
            // Could add visual indicator or adjust UI
        } else {
            appSession.logger.debug('User stopped speaking');
            // Could remove visual indicator
        }
    }

    private async handleBatteryUpdate(sessionId: string, data: any): Promise<void> {
        const gameSession = this.sessionManager.getSession(sessionId);
        if (!gameSession) return;

        const { appSession } = gameSession;
        
        // Log battery status
        appSession.logger.debug('Battery update', { level: data.level, charging: data.charging });

        // Alert on low battery during active game
        if (data.level < 15 && !data.charging && gameSession.state.mode === SessionMode.USER_TURN) {
            await appSession.layouts.showTextWall(
                `⚠️ Low battery: ${data.level}%\nConsider charging soon.`,
                { durationMs: 3000 }
            );
        }
    }

    // Public methods for external access
    public getActiveSessionsCount(): number {
        return this.sessionManager.getActiveSessionsCount();
    }

    public getSessionState(sessionId: string): SessionState | null {
        return this.sessionManager.getState(sessionId) || null;
    }

    public getMemoryStats(): {
        activeSessions: number;
        boardCacheSize: number;
        totalMemoryUsage: number;
        memoryHealth: string;
        memoryDetails: any;
    } {
        const memUsage = process.memoryUsage();
        const memoryDetails = memoryMonitor.getMemoryStats();
        return {
            activeSessions: this.sessionManager.getActiveSessionsCount(),
            boardCacheSize: this.boardCache.size,
            totalMemoryUsage: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
            memoryHealth: memoryMonitor.getMemoryHealthStatus(),
            memoryDetails
        };
    }



    public async start(): Promise<void> {
        await super.start();
        
        // Initialize WebSocket server in production after HTTP server starts
        if (process.env.NODE_ENV === 'production' && !this.networkService) {
            try {
                console.log('[ChessServer] Initializing WebSocket server for production...');
                const expressApp = this.getExpressApp();
                const server = expressApp.get('server') as any;
                
                if (server) {
                    this.networkService = new WebSocketNetworkService(server);
                    this.matchmakingService = new MatchmakingServiceImpl(this.networkService);
                    this.multiplayerGameManager = new MultiplayerGameManager(this.networkService);
                    this.setupMultiplayerEventHandlers();
                    console.log('[ChessServer] WebSocket server attached to HTTP server successfully');
                } else {
                    console.warn('[ChessServer] Could not get HTTP server, WebSocket will not be available');
                }
            } catch (error) {
                console.error('[ChessServer] Failed to initialize WebSocket server:', error);
            }
        }
        
        console.log('Chess server started successfully');
    }

    public async stop(): Promise<void> {
        console.log('[ChessServer] Stopping chess server...');
        
        // Stop memory monitoring
        memoryMonitor.stopMonitoring();
        
        // Stop all active sessions properly
        const sessionIds = this.sessionManager.getAllSessionIds();
        for (const sessionId of sessionIds) {
            try {
                await this.onStop(sessionId, 'system', 'server_shutdown');
            } catch (error) {
                console.error(`[ChessServer] Error stopping session ${sessionId}:`, error);
            }
        }
        
        // Stop Stockfish service
        if (this.stockfishService) {
            try {
                await this.stockfishService.stop();
                console.log('[ChessServer] Stockfish service stopped');
            } catch (error) {
                console.error('[ChessServer] Error stopping Stockfish service:', error);
            }
        }
        
        // Clear board cache
        this.boardCache.clear();
        console.log('[ChessServer] Board cache cleared');
        
        // Clear periodic cleanup interval
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
            console.log('[ChessServer] Periodic cleanup interval cleared');
        }
        
        await super.stop();
        console.log('[ChessServer] Chess server stopped successfully');
    }

    // Public method for test cleanup (doesn't call super.stop())
    public async cleanupForTests(): Promise<void> {
        console.log('[ChessServer] Cleaning up for tests...');
        
        // Stop memory monitoring
        memoryMonitor.stopMonitoring();
        
        // Stop all active sessions properly
        const sessionIds = this.sessionManager.getAllSessionIds();
        for (const sessionId of sessionIds) {
            try {
                await this.onStop(sessionId, 'system', 'test_cleanup');
            } catch (error) {
                console.error(`[ChessServer] Error stopping session ${sessionId}:`, error);
            }
        }
        
        // Stop Stockfish service
        if (this.stockfishService) {
            try {
                await this.stockfishService.stop();
                console.log('[ChessServer] Stockfish service stopped for tests');
            } catch (error) {
                console.error('[ChessServer] Error stopping Stockfish service:', error);
            }
        }
        
        // Stop WebSocket server
        if (this.networkService) {
            try {
                await this.networkService.stop();
                console.log('[ChessServer] Network service stopped for tests');
            } catch (error) {
                console.error('[ChessServer] Error stopping network service:', error);
            }
        }
        
        // Stop matchmaking service
        if (this.matchmakingService) {
            try {
                (this.matchmakingService as any).stop();
                console.log('[ChessServer] Matchmaking service stopped for tests');
            } catch (error) {
                console.error('[ChessServer] Error stopping matchmaking service:', error);
            }
        }
        
        // Clear board cache
        this.boardCache.clear();
        console.log('[ChessServer] Board cache cleared for tests');
        
        // Clear periodic cleanup interval
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
            console.log('[ChessServer] Periodic cleanup interval cleared for tests');
        }
        
        // Clear all command debounce timers
        for (const [sessionId, timer] of this.commandDebounceTimers.entries()) {
            clearTimeout(timer);
        }
        this.commandDebounceTimers.clear();
        console.log('[ChessServer] Command debounce timers cleared for tests');
        
        // Note: We intentionally don't call super.stop() to avoid process.exit()
    }
} 