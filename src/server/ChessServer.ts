import { TpaServer, TpaSession, ViewType, StreamType, DashboardMode } from '@mentra/sdk';
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

interface GameSession {
    sessionId: string;
    userId: string;
    appSession: TpaSession;
    state: SessionState;
    cleanupFunctions: Array<() => void>;
    dashboardCleanup?: () => void;
}

export class ChessServer extends TpaServer {
    private gameSessions: Map<string, GameSession> = new Map();
    private readonly CLARIFICATION_TIMEOUT = 30000; // 30 seconds
    private readonly AI_MOVE_DELAY = 2000; // 2 seconds for AI "thinking"

    constructor() {
        super({
            packageName: process.env.PACKAGE_NAME ?? 'com.mentra.chess',
            apiKey: process.env.MENTRAOS_API_KEY ?? '',
            port: parseInt(process.env.PORT || '3000'),
            healthCheck: true,
            publicDir: false
        });
    }

    protected async onSession(session: TpaSession, sessionId: string, userId: string): Promise<void> {
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
        const gameSession: GameSession = {
            sessionId,
            userId,
            appSession: session,
            state: initialState,
            cleanupFunctions: []
        };

        this.gameSessions.set(sessionId, gameSession);

        // Set up event handlers
        this.setupEventHandlers(gameSession);

        // Set up dashboard integration
        this.setupDashboardIntegration(gameSession);

        // Start the game flow
        await this.startGameFlow(gameSession);
    }

    protected async onStop(sessionId: string, userId: string, reason: string): Promise<void> {
        this.logger.info('Chess session stopped', { sessionId, userId, reason });

        const gameSession = this.gameSessions.get(sessionId);
        if (gameSession) {
            // Clean up event handlers
            gameSession.cleanupFunctions.forEach(cleanup => cleanup());
            
            // Clean up dashboard
            if (gameSession.dashboardCleanup) {
                gameSession.dashboardCleanup();
            }
            
            // Clear any pending timeouts
            if (gameSession.state.timeoutId) {
                clearTimeout(gameSession.state.timeoutId);
            }

            this.gameSessions.delete(sessionId);
        }
    }

    private setupEventHandlers(gameSession: GameSession): void {
        const { appSession, state } = gameSession;

        // Subscribe to transcription events
        appSession.subscribe(StreamType.TRANSCRIPTION);

        // Handle transcription events
        const transcriptionHandler = (data: any) => {
            if (data.isFinal) {
                this.handleUserInput(gameSession, data.text);
            }
        };

        // Handle button presses for navigation
        const buttonHandler = (data: any) => {
            this.handleButtonPress(gameSession, data);
        };

        // Handle head position for UI context
        const headPositionHandler = (data: any) => {
            this.handleHeadPosition(gameSession, data);
        };

        // Handle voice activity detection
        const voiceActivityHandler = (data: any) => {
            this.handleVoiceActivity(gameSession, data);
        };

        // Handle glasses battery updates
        const batteryHandler = (data: any) => {
            this.handleBatteryUpdate(gameSession, data);
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

    private setupDashboardIntegration(gameSession: GameSession): void {
        const { appSession } = gameSession;

        // Set up dashboard mode change handler
        const dashboardModeHandler = (mode: DashboardMode | 'none') => {
            this.handleDashboardModeChange(gameSession, mode);
        };

        // Store dashboard cleanup function
        gameSession.dashboardCleanup = appSession.dashboard.content.onModeChange(dashboardModeHandler);

        // Initial dashboard update
        this.updateDashboardContent(gameSession);
    }

    private async handleDashboardModeChange(gameSession: GameSession, mode: DashboardMode | 'none'): Promise<void> {
        const { appSession, state } = gameSession;

        appSession.logger.debug('Dashboard mode changed', { mode });

        if (mode === 'none') {
            // Dashboard closed - no action needed
            return;
        }

        // Update dashboard content based on new mode
        this.updateDashboardContent(gameSession);
    }

    private updateDashboardContent(gameSession: GameSession): void {
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

    private async startGameFlow(gameSession: GameSession): Promise<void> {
        const { appSession } = gameSession;

        // Show welcome message
        await appSession.layouts.showTextWall(
            "Welcome to AR Chess!\n\nSay 'white' or 'black' to choose your color.",
            { durationMs: 0 }
        );

        // Update dashboard
        this.updateDashboardContent(gameSession);

        // Transition to color selection mode
        gameSession.state.mode = SessionMode.CHOOSING_COLOR;
    }

    private async handleUserInput(gameSession: GameSession, transcript: string): Promise<void> {
        const { appSession, state } = gameSession;

        appSession.logger.debug('Processing user input', { transcript, mode: state.mode });

        switch (state.mode) {
            case SessionMode.CHOOSING_COLOR:
                await this.handleColorSelection(gameSession, transcript);
                break;

            case SessionMode.CHOOSING_DIFFICULTY:
                await this.handleDifficultySelection(gameSession, transcript);
                break;

            case SessionMode.USER_TURN:
                await this.handleUserMove(gameSession, transcript);
                break;

            case SessionMode.AWAITING_CLARIFICATION:
                await this.handleClarification(gameSession, transcript);
                break;

            default:
                appSession.logger.warn('Unexpected input in current mode', { mode: state.mode });
        }
    }

    private async handleColorSelection(gameSession: GameSession, transcript: string): Promise<void> {
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
            this.updateDashboardContent(gameSession);
        } else {
            await appSession.layouts.showTextWall(
                "Please say 'white' or 'black' to choose your color.",
                { durationMs: 3000 }
            );
        }
    }

    private async handleDifficultySelection(gameSession: GameSession, transcript: string): Promise<void> {
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
            this.updateDashboardContent(gameSession);

            // Start the game
            await this.startGame(gameSession);
        } else {
            await appSession.layouts.showTextWall(
                "Please say 'easy', 'medium', or 'hard' for AI difficulty.",
                { durationMs: 3000 }
            );
        }
    }

    private async startGame(gameSession: GameSession): Promise<void> {
        const { appSession, state } = gameSession;

        // Display initial board
        await displayBoard(appSession, gameSession.userId, state);

        // Determine first player
        if (state.userColor === PlayerColor.BLACK) {
            // AI goes first if user is black
            state.currentPlayer = PlayerColor.WHITE;
            await this.makeAIMove(gameSession);
        } else {
            // User goes first if user is white
            state.currentPlayer = PlayerColor.WHITE;
            await this.promptUserMove(gameSession);
        }
    }

    private async promptUserMove(gameSession: GameSession): Promise<void> {
        const { appSession, state } = gameSession;

        const turnText = state.currentPlayer === PlayerColor.WHITE ? "White" : "Black";
        const pieceText = state.userColor === state.currentPlayer ? "Your turn" : "AI thinking...";

        await appSession.layouts.showDoubleTextWall(
            `${turnText}'s Turn`,
            pieceText,
            { durationMs: 0 }
        );

        // Update dashboard
        this.updateDashboardContent(gameSession);
    }

    private async handleUserMove(gameSession: GameSession, transcript: string): Promise<void> {
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
            await this.handleCastlingMove(gameSession, castlingSide);
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
                await this.executeUserMove(gameSession, move, targetCoords);
            }
        } else {
            // Ambiguous move - need clarification
            await this.handleAmbiguousMove(gameSession, piece as Piece, targetCoords, possibleMoves);
        }
    }

    private async handleAmbiguousMove(
        gameSession: GameSession, 
        piece: Piece, 
        targetCoords: Coordinates, 
        possibleMoves: PotentialMove[]
    ): Promise<void> {
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
        this.updateDashboardContent(gameSession);

        // Set timeout for clarification
        state.timeoutId = setTimeout(() => {
            this.handleClarificationTimeout(gameSession);
        }, this.CLARIFICATION_TIMEOUT);
    }

    private async handleClarification(gameSession: GameSession, transcript: string): Promise<void> {
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
        
        await this.executeUserMove(gameSession, selectedMove, state.clarificationData!.targetSquare);
    }

    private async handleClarificationTimeout(gameSession: GameSession): Promise<void> {
        const { appSession, state } = gameSession;

        state.mode = SessionMode.USER_TURN;
        state.clarificationData = undefined;
        state.timeoutId = null;

        await appSession.layouts.showTextWall(
            "Move clarification timed out. Please make your move again.",
            { durationMs: 3000 }
        );

        // Update dashboard
        this.updateDashboardContent(gameSession);
    }

    private async handleCastlingMove(gameSession: GameSession, side: 'kingside' | 'queenside'): Promise<void> {
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
        await displayBoard(appSession, gameSession.userId, state);

        // Update dashboard
        this.updateDashboardContent(gameSession);

        // Check for game over
        const gameEnd = checkGameEnd(state.board, state.currentPlayer);
        if (gameEnd.isOver) {
            const message = gameEnd.reason === 'checkmate' ? 'Checkmate!' : 
                           gameEnd.reason === 'stalemate' ? 'Stalemate!' : 'Game Over!';
            await this.handleGameOver(gameSession, message, gameEnd.result);
            return;
        }

        // Switch to AI turn
        state.mode = SessionMode.AI_TURN;
        await this.makeAIMove(gameSession);
    }

    private async executeUserMove(gameSession: GameSession, move: PotentialMove, targetCoords: Coordinates): Promise<void> {
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
        await displayBoard(appSession, gameSession.userId, state);

        // Update dashboard
        this.updateDashboardContent(gameSession);

        // Check for game over
        const gameEnd = checkGameEnd(state.board, state.currentPlayer);
        if (gameEnd.isOver) {
            const message = gameEnd.reason === 'checkmate' ? 'Checkmate!' : 
                           gameEnd.reason === 'stalemate' ? 'Stalemate!' : 'Game Over!';
            await this.handleGameOver(gameSession, message, gameEnd.result);
            return;
        }

        // Switch to AI turn
        state.mode = SessionMode.AI_TURN;
        await this.makeAIMove(gameSession);
    }

    private async makeAIMove(gameSession: GameSession): Promise<void> {
        const { appSession, state } = gameSession;

        await appSession.layouts.showTextWall("AI is thinking...", { durationMs: this.AI_MOVE_DELAY });

        // Simple AI: random legal move (placeholder for Stockfish integration)
        const aiMove = this.generateSimpleAIMove(state);
        
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
            await displayBoard(appSession, gameSession.userId, state);

            // Update dashboard
            this.updateDashboardContent(gameSession);

                    // Check for game over
        const gameEnd = checkGameEnd(state.board, state.currentPlayer);
        if (gameEnd.isOver) {
            const message = gameEnd.reason === 'checkmate' ? 'Checkmate!' : 
                           gameEnd.reason === 'stalemate' ? 'Stalemate!' : 'Game Over!';
            await this.handleGameOver(gameSession, message, gameEnd.result);
            return;
        }

            // Switch to user turn
            state.mode = SessionMode.USER_TURN;
            await this.promptUserMove(gameSession);
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

    private async handleGameOver(gameSession: GameSession, message: string, result?: 'white_win' | 'black_win' | 'draw'): Promise<void> {
        const { appSession, state } = gameSession;

        state.mode = SessionMode.GAME_OVER;
        state.gameResult = result;

        await appSession.layouts.showDoubleTextWall(
            "Game Over!",
            message,
            { durationMs: 0 }
        );

        // Update dashboard
        this.updateDashboardContent(gameSession);
    }

    private async handleButtonPress(gameSession: GameSession, data: any): Promise<void> {
        const { appSession } = gameSession;
        
        // Handle hardware button presses for navigation
        if (data.buttonId === 'primary' && data.pressType === 'press') {
            // Primary button could be used for board refresh or help
            await displayBoard(appSession, gameSession.userId, gameSession.state);
        } else if (data.buttonId === 'secondary' && data.pressType === 'long') {
            // Long press on secondary button could show help
            await appSession.layouts.showReferenceCard(
                'Chess Help',
                'Voice Commands:\n• "rook to d4" - Move piece\n• "white/black" - Choose color\n• "easy/medium/hard" - Set difficulty\n• "one/two/three" - Choose move'
            );
        }
    }

    private async handleHeadPosition(gameSession: GameSession, data: any): Promise<void> {
        // Handle head position changes for UI context
        // Could be used to show different information based on where user is looking
        if (data.position === 'up') {
            // User looking up - dashboard is already handled by dashboard mode change
            const { appSession } = gameSession;
            appSession.logger.debug('User looked up - dashboard should be visible');
        }
    }

    private async handleVoiceActivity(gameSession: GameSession, data: any): Promise<void> {
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

    private async handleBatteryUpdate(gameSession: GameSession, data: any): Promise<void> {
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
        return this.gameSessions.size;
    }

    public getSessionState(sessionId: string): SessionState | null {
        const gameSession = this.gameSessions.get(sessionId);
        return gameSession ? gameSession.state : null;
    }

    public async start(): Promise<void> {
        await super.start();
        console.log('Chess server started successfully');
    }

    public async stop(): Promise<void> {
        // Clean up all active sessions
        for (const [sessionId, gameSession] of this.gameSessions) {
            await this.onStop(sessionId, gameSession.userId, 'server shutdown');
        }
        
        await super.stop();
        console.log('Chess server stopped successfully');
    }
} 