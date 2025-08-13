import { AppServer, AppSession, AppServerConfig, ViewType, StreamType, DashboardMode } from '@mentra/sdk';
import { 
    SessionState, 
    SessionMode, 
    PlayerColor, 
    Difficulty, 
    Piece, 
    Coordinates,
    PotentialMove,
    ClarificationData
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

export class ChessServer extends AppServer {
    protected sessionManager: SessionManager;
    private readonly CLARIFICATION_TIMEOUT = 30000; // 30 seconds
    private stockfishService: StockfishService;


    // Cache for board rendering to reduce latency
    private boardCache: Map<string, { boardText: string; timestamp: number; useUnicode: boolean }> = new Map();
    private readonly BOARD_CACHE_DURATION = 1000; // 1 second cache duration

    constructor(config: AppServerConfig) {
        super(config);
        

        
        // Initialize Stockfish service
        console.log('Initializing Stockfish service in ChessServer...');
        try {
            this.stockfishService = new StockfishService();
            if (this.stockfishService.isEngineReady()) {
                console.log('Stockfish service initialized successfully');
            } else {
                console.log('Stockfish service initialized (fallback mode - using simple AI)');
            }
        } catch (error) {
            console.warn('Failed to initialize Stockfish service:', error);
            console.log('Continuing with simple AI fallback...');
            this.stockfishService = null as any;
        }
        this.sessionManager = new SessionManager();
        
        // Set up periodic board cache cleanup
        this.setupPeriodicCleanup();
    }

    protected async onSession(session: AppSession, sessionId: string, userId: string): Promise<void> {
        this.logger.info('New chess session started', { sessionId, userId });
        console.log(`[DEBUG] onSession called with sessionId: ${sessionId}, userId: ${userId}`);

        // Get settings from MentraOS
        const userColor = session.settings.get<string>('user_color', 'white');
        const aiDifficulty = session.settings.get<string>('ai_difficulty', 'medium');
        console.log(`[DEBUG] User settings - color: ${userColor}, difficulty: ${aiDifficulty}`);

        // Initialize game state
        const initialState: SessionState = {
            mode: SessionMode.USER_TURN, // Start directly at user turn
            userColor: userColor === 'white' ? PlayerColor.WHITE : PlayerColor.BLACK,
            aiDifficulty: aiDifficulty === 'easy' ? Difficulty.EASY : aiDifficulty === 'hard' ? Difficulty.HARD : Difficulty.MEDIUM,
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

        // Start the game directly (skip color/difficulty selection)
        console.log(`[DEBUG] Starting game for session: ${sessionId}`);
        await this.startGame(sessionId);
        console.log(`[DEBUG] Game started successfully for session: ${sessionId}`);
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
        }

        // Clean up board cache for this session
        this.invalidateBoardCache(sessionId);

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
                        this.showLiveTranscription(sessionId, data.text);
                    }
                }
                if (data.isFinal && data.text) {
                    this.handleUserInput(sessionId, data.text);
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

                // Add game statistics
                if (showCapturedPieces) {
                    const userCaptured = state.userColor === PlayerColor.WHITE ? state.capturedByWhite : state.capturedByBlack;
                    const aiCaptured = state.userColor === PlayerColor.WHITE ? state.capturedByBlack : state.capturedByWhite;
                    
                    if (userCaptured.length > 0 || aiCaptured.length > 0) {
                        expandedContent += `\n\nCaptured Pieces:\nYou: ${userCaptured.join(' ')}\nAI: ${aiCaptured.join(' ')}`;
                    }
                }

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

    // Helper to update board and feedback using DoubleTextWall
    private async updateBoardAndFeedback(sessionId: string, feedback: string) {
        const gameSession = this.sessionManager.getSession(sessionId);
        if (!gameSession) {
            console.log(`[DEBUG] updateBoardAndFeedback: No game session found for sessionId: ${sessionId}`);
            return;
        }
        
        console.log(`[DEBUG] updateBoardAndFeedback: Found game session for sessionId: ${sessionId}`);
        const { appSession, state } = gameSession;
        
        try {
            console.log(`[DEBUG] updateBoardAndFeedback: Getting cached board text`);
            // Use cached board text for better performance
            const boardText = this.getCachedBoardText(sessionId, state, appSession);
            console.log(`[DEBUG] updateBoardAndFeedback: Board text length: ${boardText.length}`);
            console.log(`[DEBUG] updateBoardAndFeedback: Board text preview: ${boardText.substring(0, 100)}...`);
            
            console.log(`[DEBUG] updateBoardAndFeedback: Calling showDoubleTextWall`);
            await appSession.layouts.showDoubleTextWall(boardText, feedback);
            console.log(`[DEBUG] updateBoardAndFeedback: showDoubleTextWall completed successfully`);
        } catch (error) {
            console.error(`[DEBUG] updateBoardAndFeedback: Error updating board and feedback:`, error);
            // Fallback: try to show just the feedback
            try {
                console.log(`[DEBUG] updateBoardAndFeedback: Trying fallback with showTextWall`);
                await appSession.layouts.showTextWall(feedback, { durationMs: 3000 });
                console.log(`[DEBUG] updateBoardAndFeedback: Fallback showTextWall completed`);
            } catch (fallbackError) {
                console.error(`[DEBUG] updateBoardAndFeedback: Fallback layout also failed:`, fallbackError);
            }
        }
    }

    // Helper to show live transcription as caption
    private async showLiveTranscription(sessionId: string, transcript: string) {
        const gameSession = this.sessionManager.getSession(sessionId);
        if (!gameSession) return;
        const { appSession, state } = gameSession;
        
        try {
            // Use cached board text to reduce latency
            const boardText = this.getCachedBoardText(sessionId, state, appSession);
            
            // Use a faster display method for live transcriptions
            // Only show the transcript as a simple overlay to minimize latency
            await appSession.layouts.showTextWall(transcript, { 
                durationMs: 2000
            });
        } catch (error) {
            console.error('Error showing live transcription:', error);
            // Don't show fallback for live transcription to avoid spam
        }
    }

    private getCachedBoardText(sessionId: string, state: SessionState, appSession: AppSession): string {
        console.log(`[DEBUG] getCachedBoardText: Starting for sessionId: ${sessionId}`);
        const now = Date.now();
        const cacheKey = `${sessionId}_${state.currentFEN}`;
        const cached = this.boardCache.get(cacheKey);
        
        // Get user preferences from settings (cache this too if needed)
        const useUnicodeSetting = appSession.settings.get<string>('use_unicode', 'true');
        const useUnicode = useUnicodeSetting === 'true' || useUnicodeSetting === 'TRUE' || useUnicodeSetting === '1';
        console.log(`[DEBUG] getCachedBoardText: useUnicode setting: ${useUnicodeSetting}, resolved: ${useUnicode}`);
        
        // Check if we have a valid cached version
        if (cached && 
            cached.useUnicode === useUnicode && 
            (now - cached.timestamp) < this.BOARD_CACHE_DURATION) {
            console.log(`[DEBUG] getCachedBoardText: Using cached board text, length: ${cached.boardText.length}`);
            return cached.boardText;
        }
        
        console.log(`[DEBUG] getCachedBoardText: Generating new board text`);
        // Generate new board text
        const boardText = renderBoardString(state, { useUnicode });
        console.log(`[DEBUG] getCachedBoardText: Generated board text length: ${boardText.length}`);
        console.log(`[DEBUG] getCachedBoardText: Board text preview: ${boardText.substring(0, 100)}...`);
        
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
        setInterval(() => {
            try {
                this.cleanupBoardCache();
                const stats = this.getMemoryStats();
                console.log(`[ChessServer] Board cache cleanup completed. Cache size: ${stats.boardCacheSize}, Active sessions: ${stats.activeSessions}, Memory: ${stats.totalMemoryUsage}MB`);
            } catch (error) {
                console.error('[ChessServer] Error during board cache cleanup:', error);
            }
        }, 5 * 60 * 1000); // 5 minutes
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
            appSession.logger.debug('Processing user input', { transcript, mode: state.mode });

            switch (state.mode) {
                case SessionMode.USER_TURN:
                    await this.handleUserMove(sessionId, transcript);
                    break;

                case SessionMode.AWAITING_CLARIFICATION:
                    await this.handleClarification(sessionId, transcript);
                    break;

                default:
                    appSession.logger.warn('Unexpected input in current mode', { mode: state.mode });
            }
        } catch (error) {
            console.error('Error processing user input:', error);
            await this.updateBoardAndFeedback(sessionId, 'Error processing input. Please try again.');
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
            if (state.userColor === PlayerColor.WHITE) {
                state.capturedByWhite.push(capturedPiece);
            } else {
                state.capturedByBlack.push(capturedPiece);
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
            if (aiColor === PlayerColor.BLACK) {
                state.capturedByWhite.push(capturedPiece);
            } else {
                state.capturedByBlack.push(capturedPiece);
            }
        }

        // Update game state
        state.currentPlayer = state.currentPlayer === PlayerColor.WHITE ? PlayerColor.BLACK : PlayerColor.WHITE;
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
    } {
        const memUsage = process.memoryUsage();
        return {
            activeSessions: this.sessionManager.getActiveSessionsCount(),
            boardCacheSize: this.boardCache.size,
            totalMemoryUsage: Math.round(memUsage.heapUsed / 1024 / 1024) // MB
        };
    }



    public async start(): Promise<void> {
        await super.start();
        console.log('Chess server started successfully');
    }

    public async stop(): Promise<void> {
        console.log('[ChessServer] Stopping chess server...');
        
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
        
        await super.stop();
        console.log('[ChessServer] Chess server stopped successfully');
    }
} 