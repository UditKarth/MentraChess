import { ChessServer } from './ChessServer';
import { SessionState, PlayerColor, Difficulty, SessionMode } from '../utils/types';
import { initializeBoard, boardToFEN } from '../chess_logic';

interface GameStatistics {
    totalGames: number;
    activeGames: number;
    gamesCompleted: number;
    averageGameDuration: number;
}

interface GameInfo {
    sessionId: string;
    userId: string;
    state: SessionState;
    createdAt: Date;
    lastActivity: Date;
}

export class ChessAPIServer extends ChessServer {
    private gameHistory: Map<string, GameInfo> = new Map();
    private gameStartTimes: Map<string, Date> = new Map();

    constructor() {
        super();
        this.setupAPIRoutes();
    }

    private setupAPIRoutes(): void {
        const expressApp = this.getExpressApp();
        
        if (!expressApp) {
            console.error('Express app not available');
            return;
        }

        // Health check endpoint
        expressApp.get('/health', (req: any, res: any) => {
            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                activeSessions: this.getActiveSessionsCount(),
                uptime: process.uptime()
            });
        });

        // Get all active games
        expressApp.get('/api/games', (req: any, res: any) => {
            const activeGames = Array.from(this.gameHistory.values())
                .filter(game => game.state.mode !== SessionMode.GAME_OVER)
                .map(game => ({
                    sessionId: game.sessionId,
                    userId: game.userId,
                    mode: game.state.mode,
                    userColor: game.state.userColor,
                    currentPlayer: game.state.currentPlayer,
                    createdAt: game.createdAt,
                    lastActivity: game.lastActivity
                }));

            res.json({
                activeGames,
                total: activeGames.length
            });
        });

        // Get specific game state
        expressApp.get('/api/games/:sessionId', (req: any, res: any) => {
            const { sessionId } = req.params;
            const gameState = this.getSessionState(sessionId);

            if (!gameState) {
                return res.status(404).json({ error: 'Game not found' });
            }

            const gameInfo = this.gameHistory.get(sessionId);
            res.json({
                sessionId,
                state: gameState,
                createdAt: gameInfo?.createdAt,
                lastActivity: gameInfo?.lastActivity
            });
        });

        // Get game statistics
        expressApp.get('/api/statistics', (req: any, res: any) => {
            const stats = this.calculateStatistics();
            res.json(stats);
        });

        // Create a new game (for testing or external integration)
        expressApp.post('/api/games', (req: any, res: any) => {
            const { userId, userColor, difficulty } = req.body;

            if (!userId) {
                return res.status(400).json({ error: 'userId is required' });
            }

            // Create a mock session for testing
            const sessionId = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            const initialState: SessionState = {
                mode: SessionMode.USER_TURN,
                userColor: userColor || PlayerColor.WHITE,
                aiDifficulty: difficulty || Difficulty.MEDIUM,
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

            const gameInfo: GameInfo = {
                sessionId,
                userId,
                state: initialState,
                createdAt: new Date(),
                lastActivity: new Date()
            };

            this.gameHistory.set(sessionId, gameInfo);
            this.gameStartTimes.set(sessionId, new Date());

            res.status(201).json({
                sessionId,
                message: 'Game created successfully',
                state: initialState
            });
        });

        // Get FEN representation of a game
        expressApp.get('/api/games/:sessionId/fen', (req: any, res: any) => {
            const { sessionId } = req.params;
            const gameState = this.getSessionState(sessionId);

            if (!gameState) {
                return res.status(404).json({ error: 'Game not found' });
            }

            res.json({
                sessionId,
                fen: boardToFEN(gameState),
                currentPlayer: gameState.currentPlayer
            });
        });

        // Get game board as JSON
        expressApp.get('/api/games/:sessionId/board', (req: any, res: any) => {
            const { sessionId } = req.params;
            const gameState = this.getSessionState(sessionId);

            if (!gameState) {
                return res.status(404).json({ error: 'Game not found' });
            }

            res.json({
                sessionId,
                board: gameState.board,
                capturedByWhite: gameState.capturedByWhite,
                capturedByBlack: gameState.capturedByBlack
            });
        });

        // Error handling middleware
        expressApp.use((err: any, req: any, res: any, next: any) => {
            console.error('API Error:', err);
            res.status(500).json({
                error: 'Internal server error',
                message: err.message
            });
        });

        // 404 handler
        expressApp.use('*', (req: any, res: any) => {
            res.status(404).json({
                error: 'Endpoint not found',
                availableEndpoints: [
                    'GET /health',
                    'GET /api/games',
                    'GET /api/games/:sessionId',
                    'POST /api/games',
                    'GET /api/games/:sessionId/fen',
                    'GET /api/games/:sessionId/board',
                    'GET /api/statistics'
                ]
            });
        });
    }

    private calculateStatistics(): GameStatistics {
        const totalGames = this.gameHistory.size;
        const activeGames = Array.from(this.gameHistory.values())
            .filter(game => game.state.mode !== SessionMode.GAME_OVER).length;
        const gamesCompleted = totalGames - activeGames;

        // Calculate average game duration
        let totalDuration = 0;
        let completedGamesCount = 0;

        this.gameStartTimes.forEach((startTime, sessionId) => {
            const gameInfo = this.gameHistory.get(sessionId);
            if (gameInfo && gameInfo.state.mode === SessionMode.GAME_OVER) {
                const duration = gameInfo.lastActivity.getTime() - startTime.getTime();
                totalDuration += duration;
                completedGamesCount++;
            }
        });

        const averageGameDuration = completedGamesCount > 0 
            ? totalDuration / completedGamesCount 
            : 0;

        return {
            totalGames,
            activeGames,
            gamesCompleted,
            averageGameDuration
        };
    }

    // Override onSession to track game history
    protected async onSession(session: any, sessionId: string, userId: string): Promise<void> {
        // Call parent implementation
        await super.onSession(session, sessionId, userId);

        // Track game in history
        const gameState = this.getSessionState(sessionId);
        if (gameState) {
            const gameInfo: GameInfo = {
                sessionId,
                userId,
                state: gameState,
                createdAt: new Date(),
                lastActivity: new Date()
            };

            this.gameHistory.set(sessionId, gameInfo);
            this.gameStartTimes.set(sessionId, new Date());
        }
    }

    // Override onStop to update game history
    protected async onStop(sessionId: string, userId: string, reason: string): Promise<void> {
        // Update last activity
        const gameInfo = this.gameHistory.get(sessionId);
        if (gameInfo) {
            gameInfo.lastActivity = new Date();
            gameInfo.state = this.getSessionState(sessionId) || gameInfo.state;
        }

        // Call parent implementation
        await super.onStop(sessionId, userId, reason);
    }

    // Public method to get game history
    public getGameHistory(): GameInfo[] {
        return Array.from(this.gameHistory.values());
    }

    // Public method to get specific game info
    public getExpressApp(): any {
        // This would need to be implemented based on the actual SDK
        // For now, return a mock Express app or null
        return null;
    }
    public getGameInfo(sessionId: string): GameInfo | undefined {
        return this.gameHistory.get(sessionId);
    }
} 