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
    parseColorTranscript,
    parseDifficultyTranscript,
    parseClarificationTranscript,
    parseCastlingTranscript,
    findPossibleMoves,
    executeMove,
    executeCastling,
    updateCastlingRights,
    displayBoard,
    boardToFEN,
    validateMove,
    checkGameEnd,
    getLegalMoves
} from '../chess_logic';
import { StockfishService } from '../services/StockfishService';
import { stockfishMoveToInternal } from '../utils/stockfishUtils';
import { SessionManager, ChessSessionInfo } from '../session/SessionManager';

export class ChessServer extends AppServer {
    protected sessionManager: SessionManager;
    private readonly CLARIFICATION_TIMEOUT = 30000; // 30 seconds
    private readonly AI_MOVE_DELAY = 2000; // 2 seconds for AI "thinking"
    private stockfishService: StockfishService;

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
    }

    protected async onSession(session: AppSession, sessionId: string, userId: string): Promise<void> {
        this.logger.info('New chess session started', { sessionId, userId });

        // Initialize game state
        const initialState: SessionState = {
            mode: SessionMode.INITIALIZING,
            userColor: PlayerColor.NONE,
            aiDifficulty: null,
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

        // Create game session
        this.sessionManager.initializeSession(sessionId, initialState, userId, session);

        // Set up event handlers
        this.setupEventHandlers(sessionId);

        // Set up dashboard integration
        this.setupDashboardIntegration(sessionId);

        // Start the game flow
        await this.startGameFlow(sessionId);
    }

    protected async onStop(sessionId: string, userId: string, reason: string): Promise<void> {
        this.logger.info('Chess session stopped', { sessionId, userId, reason });

        this.sessionManager.removeSession(sessionId);
    }

    private setupEventHandlers(sessionId: string): void {
        const gameSession = this.sessionManager.getSession(sessionId);
        if (!gameSession) return;

        const { appSession, state } = gameSession;

        // Handle transcription events
        const transcriptionHandler = (data: any) => {
            if (data.isFinal) {
                this.handleUserInput(sessionId, data.text);
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
            case SessionMode.INITIALIZING:
                mainContent = '♟️ Chess Setup';
                expandedContent = 'Welcome to AR Chess!\n\nSay "white" or "black" to choose your color.';
                break;

            case SessionMode.CHOOSING_COLOR:
                mainContent = '🎨 Choose Color';
                expandedContent = 'Choose your color:\n\nSay "white" or "black"';
                break;

            case SessionMode.CHOOSING_DIFFICULTY:
                mainContent = '⚙️ Set Difficulty';
                expandedContent = `You chose ${state.userColor}!\n\nSay "easy", "medium", or "hard" for AI difficulty.`;
                break;

            case SessionMode.USER_TURN:
            case SessionMode.AI_TURN:
                const turnText = state.currentPlayer === PlayerColor.WHITE ? 'White' : 'Black';
                const isUserTurn = state.currentPlayer === state.userColor;
                
                mainContent = `${turnText}'s Turn`;
                expandedContent = `${turnText}'s Turn\n\n`;

                if (isUserTurn) {
                    expandedContent += 'Your move!\nSay your move (e.g., "rook to d4")';
                } else {
                    expandedContent += 'AI is thinking...';
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

    private async startGameFlow(sessionId: string): Promise<void> {
        const gameSession = this.sessionManager.getSession(sessionId);
        if (!gameSession) return;

        const { appSession } = gameSession;

        // Show welcome message
        await appSession.layouts.showTextWall(
            "Welcome to AR Chess!\n\nSay 'white' or 'black' to choose your color.",
            { durationMs: 0 }
        );

        // Update dashboard
        this.updateDashboardContent(sessionId);

        // Transition to color selection mode
        gameSession.state.mode = SessionMode.CHOOSING_COLOR;
    }

    private async handleUserInput(sessionId: string, transcript: string): Promise<void> {
        const gameSession = this.sessionManager.getSession(sessionId);
        if (!gameSession) return;

        const { appSession, state } = gameSession;

        appSession.logger.debug('Processing user input', { transcript, mode: state.mode });

        switch (state.mode) {
            case SessionMode.CHOOSING_COLOR:
                await this.handleColorSelection(sessionId, transcript);
                break;

            case SessionMode.CHOOSING_DIFFICULTY:
                await this.handleDifficultySelection(sessionId, transcript);
                break;

            case SessionMode.USER_TURN:
                await this.handleUserMove(sessionId, transcript);
                break;

            case SessionMode.AWAITING_CLARIFICATION:
                await this.handleClarification(sessionId, transcript);
                break;

            default:
                appSession.logger.warn('Unexpected input in current mode', { mode: state.mode });
        }
    }

    private async handleColorSelection(sessionId: string, transcript: string): Promise<void> {
        const gameSession = this.sessionManager.getSession(sessionId);
        if (!gameSession) return;

        const { appSession } = gameSession;
        const color = parseColorTranscript(transcript);

        if (color) {
            gameSession.state.userColor = color;
            gameSession.state.mode = SessionMode.CHOOSING_DIFFICULTY;

            await appSession.layouts.showTextWall(
                `You chose ${color}!\n\nSay 'easy', 'medium', or 'hard' for AI difficulty.`,
                { durationMs: 0 }
            );

            // Update dashboard
            this.updateDashboardContent(sessionId);
        } else {
            await appSession.layouts.showTextWall(
                "Please say 'white' or 'black' to choose your color.",
                { durationMs: 3000 }
            );
        }
    }

    private async handleDifficultySelection(sessionId: string, transcript: string): Promise<void> {
        const gameSession = this.sessionManager.getSession(sessionId);
        if (!gameSession) return;

        const { appSession } = gameSession;
        const difficulty = await parseDifficultyTranscript(transcript);

        if (difficulty) {
            gameSession.state.aiDifficulty = difficulty;
            gameSession.state.mode = SessionMode.USER_TURN;

            await appSession.layouts.showTextWall(
                `Difficulty set to ${difficulty}!\n\nGame starting...`,
                { durationMs: 2000 }
            );

            // Update dashboard
            this.updateDashboardContent(sessionId);

            // Start the game
            await this.startGame(sessionId);
        } else {
            await appSession.layouts.showTextWall(
                "Please say 'easy', 'medium', or 'hard' for AI difficulty.",
                { durationMs: 3000 }
            );
        }
    }

    private async startGame(sessionId: string): Promise<void> {
        const gameSession = this.sessionManager.getSession(sessionId);
        if (!gameSession) return;

        const { appSession, state } = gameSession;

        // Display initial board
        await displayBoard(appSession, gameSession.info.userId, state);

        // Determine first player
        if (state.userColor === PlayerColor.BLACK) {
            // AI goes first if user is black
            state.currentPlayer = PlayerColor.WHITE;
            await this.makeAIMove(sessionId);
        } else {
            // User goes first if user is white
            state.currentPlayer = PlayerColor.WHITE;
            await this.promptUserMove(sessionId);
        }
    }

    private async promptUserMove(sessionId: string): Promise<void> {
        const gameSession = this.sessionManager.getSession(sessionId);
        if (!gameSession) return;

        const { appSession, state } = gameSession;

        const turnText = state.currentPlayer === PlayerColor.WHITE ? "White" : "Black";
        const pieceText = state.userColor === state.currentPlayer ? "Your turn" : "AI thinking...";

        await appSession.layouts.showDoubleTextWall(
            `${turnText}'s Turn`,
            pieceText,
            { durationMs: 0 }
        );

        // Update dashboard
        this.updateDashboardContent(sessionId);
    }

    private async handleUserMove(sessionId: string, transcript: string): Promise<void> {
        const gameSession = this.sessionManager.getSession(sessionId);
        if (!gameSession) return;

        const { appSession, state } = gameSession;

        // Check if it's the user's turn
        if (state.currentPlayer !== state.userColor) {
            await appSession.layouts.showTextWall(
                "Please wait for the AI to make its move.",
                { durationMs: 2000 }
            );
            return;
        }

        // Check for castling command first
        const castlingSide = parseCastlingTranscript(transcript);
        if (castlingSide) {
            await this.handleCastlingMove(sessionId, castlingSide);
            return;
        }

        const moveData = parseMoveTranscript(transcript);
        if (!moveData) {
            await appSession.layouts.showTextWall(
                "Please specify a piece and square (e.g., 'rook to d4' or 'pawn e5') or say 'kingside' or 'queenside' to castle.",
                { durationMs: 3000 }
            );
            return;
        }

        const { piece, target } = moveData;
        const targetCoords = algebraicToCoords(target);

        if (!targetCoords) {
            await appSession.layouts.showTextWall(
                "Invalid square. Please use standard chess notation (e.g., 'e4', 'd5').",
                { durationMs: 3000 }
            );
            return;
        }

        // Find possible moves for this piece
        const possibleMoves = findPossibleMoves(state.board, state.userColor, piece as Piece, targetCoords);

        if (possibleMoves.length === 0) {
            await appSession.layouts.showTextWall(
                `No ${piece} can move to ${target}. Please try a different move.`,
                { durationMs: 3000 }
            );
            return;
        }

        if (possibleMoves.length === 1) {
            // Unambiguous move
            const move = possibleMoves[0];
            if (move) {
                await this.executeUserMove(sessionId, move, targetCoords);
            }
        } else {
            // Ambiguous move - need clarification
            await this.handleAmbiguousMove(sessionId, piece as Piece, targetCoords, possibleMoves);
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

        const { appSession, state } = gameSession;

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

        await appSession.layouts.showTextWall(optionsText, { durationMs: 0 });

        // Update dashboard
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
            await appSession.layouts.showTextWall(
                "Please say a valid number to choose your move.",
                { durationMs: 3000 }
            );
            return;
        }

        const selectedMove = state.clarificationData?.possibleMoves[choice - 1];
        if (!selectedMove) {
            await appSession.layouts.showTextWall(
                "Invalid move selection. Please try again.",
                { durationMs: 3000 }
            );
            return;
        }
        
        await this.executeUserMove(sessionId, selectedMove, state.clarificationData!.targetSquare);
    }

    private async handleClarificationTimeout(sessionId: string): Promise<void> {
        const gameSession = this.sessionManager.getSession(sessionId);
        if (!gameSession) return;

        const { appSession, state } = gameSession;

        state.mode = SessionMode.USER_TURN;
        state.clarificationData = undefined;
        state.timeoutId = null;

        await appSession.layouts.showTextWall(
            "Move clarification timed out. Please make your move again.",
            { durationMs: 3000 }
        );

        // Update dashboard
        this.updateDashboardContent(sessionId);
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
            await appSession.layouts.showTextWall(
                `Cannot castle ${side}: ${validation.error}`,
                { durationMs: 3000 }
            );
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
        await displayBoard(appSession, gameSession.info.userId, state);

        // Update dashboard
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

        const { appSession, state } = gameSession;

        // Validate the move before executing
        const validation = validateMove(state.board, move.source, targetCoords, state.userColor, state.castlingRights);
        if (!validation.isValid) {
            await appSession.layouts.showTextWall(
                `Invalid move: ${validation.error}`,
                { durationMs: 3000 }
            );
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

        // Display updated board
        await displayBoard(appSession, gameSession.info.userId, state);

        // Update dashboard
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

        const { appSession, state } = gameSession;

        // Show thinking indicator
        await appSession.layouts.showTextWall("AI is thinking...", { durationMs: 0 });

        try {
            let aiMove: { source: Coordinates; target: Coordinates; piece: Piece } | null = null;

            // Try to use Stockfish if available
            if (this.stockfishService && this.stockfishService.isEngineReady()) {
                try {
                    const stockfishMove = await this.stockfishService.getBestMove(
                        state, 
                        state.aiDifficulty || Difficulty.MEDIUM,
                        3000 // 3 second time limit
                    );
                    
                    if (stockfishMove) {
                        const internalMove = stockfishMoveToInternal(stockfishMove, state.board);
                        if (internalMove) {
                            aiMove = {
                                source: internalMove.source,
                                target: internalMove.target,
                                piece: internalMove.piece
                            };
                        }
                    }
                } catch (stockfishError) {
                    console.warn('Stockfish move failed, falling back to simple AI:', stockfishError);
                }
            }

            // Fallback to simple AI if Stockfish is not available or fails
            if (!aiMove) {
                aiMove = this.generateSimpleAIMove(state);
            }
            
            if (aiMove) {
                const { updatedBoard, capturedPiece } = executeMove(state.board, aiMove.source, aiMove.target);
                state.board = updatedBoard;

                // Update captured pieces
                if (capturedPiece !== ' ') {
                    if (state.userColor === PlayerColor.BLACK) {
                        state.capturedByWhite.push(capturedPiece);
                    } else {
                        state.capturedByBlack.push(capturedPiece);
                    }
                }

                // Update game state
                state.currentPlayer = state.currentPlayer === PlayerColor.WHITE ? PlayerColor.BLACK : PlayerColor.WHITE;
                state.currentFEN = boardToFEN(state);

                // Display AI move
                const sourceSquare = coordsToAlgebraic(aiMove.source);
                const targetSquare = coordsToAlgebraic(aiMove.target);
                await appSession.layouts.showTextWall(
                    `AI moved ${aiMove.piece} from ${sourceSquare} to ${targetSquare}`,
                    { durationMs: 2000 }
                );

                // Display updated board
                await displayBoard(appSession, gameSession.info.userId, state);

                // Update dashboard
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
            } else {
                // No valid move found
                await appSession.layouts.showTextWall("AI couldn't find a valid move", { durationMs: 2000 });
                state.mode = SessionMode.USER_TURN;
                await this.promptUserMove(sessionId);
            }
        } catch (error) {
            console.error('Error in AI move:', error);
            await appSession.layouts.showTextWall("AI move failed, your turn", { durationMs: 2000 });
            state.mode = SessionMode.USER_TURN;
            await this.promptUserMove(sessionId);
        }
    }

    private generateSimpleAIMove(state: SessionState): { source: Coordinates; target: Coordinates; piece: Piece } | null {
        // Placeholder for simple AI move generation
        // In a real implementation, this would integrate with Stockfish or similar engine
        const aiColor = state.userColor === PlayerColor.WHITE ? PlayerColor.BLACK : PlayerColor.WHITE;
        
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

        // Simple random move generation (very basic)
        if (aiPieces.length > 0) {
            const randomPiece = aiPieces[Math.floor(Math.random() * aiPieces.length)];
            if (!randomPiece) return null;
            
            const [r, c] = randomPiece.coords;
            
            // Try to move to a random adjacent square
            const directions = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
            for (const direction of directions) {
                const [dr, dc] = direction;
                if (dr !== undefined && dc !== undefined) {
                    const newR = r + dr;
                    const newC = c + dc;
                    if (newR >= 0 && newR < 8 && newC >= 0 && newC < 8) {
                        return {
                            source: [r, c],
                            target: [newR, newC],
                            piece: randomPiece.piece
                        };
                    }
                }
            }
        }

        return null;
    }

    private async handleGameOver(sessionId: string, message: string, result?: 'white_win' | 'black_win' | 'draw'): Promise<void> {
        const gameSession = this.sessionManager.getSession(sessionId);
        if (!gameSession) return;

        const { appSession, state } = gameSession;

        state.mode = SessionMode.GAME_OVER;
        state.gameResult = result;

        await appSession.layouts.showDoubleTextWall(
            "Game Over!",
            message,
            { durationMs: 0 }
        );

        // Update dashboard
        this.updateDashboardContent(sessionId);
    }

    private async handleButtonPress(sessionId: string, data: any): Promise<void> {
        const gameSession = this.sessionManager.getSession(sessionId);
        if (!gameSession) return;

        const { appSession } = gameSession;
        
        // Handle hardware button presses for navigation
        if (data.buttonId === 'primary' && data.pressType === 'press') {
            // Primary button could be used for board refresh or help
            await displayBoard(appSession, gameSession.info.userId, gameSession.state);
        } else if (data.buttonId === 'secondary' && data.pressType === 'long') {
            // Long press on secondary button could show help
            await appSession.layouts.showReferenceCard(
                'Chess Help',
                'Voice Commands:\n• "rook to d4" - Move piece\n• "white/black" - Choose color\n• "easy/medium/hard" - Set difficulty\n• "one/two/three" - Choose move'
            );
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

    public async start(): Promise<void> {
        await super.start();
        console.log('Chess server started successfully');
    }

    public async stop(): Promise<void> {
        // Clean up all active sessions
        this.sessionManager.stopAllSessions();
        
        // Stop Stockfish service
        if (this.stockfishService) {
            try {
                await this.stockfishService.stop();
                console.log('Stockfish service stopped successfully');
            } catch (error) {
                console.warn('Error stopping Stockfish service:', error);
            }
        }
        
        await super.stop();
        console.log('Chess server stopped successfully');
    }
} 