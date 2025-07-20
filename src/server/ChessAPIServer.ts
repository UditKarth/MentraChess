import { ChessServer } from './ChessServer';
import { SessionState, PlayerColor, Difficulty, SessionMode } from '../utils/types';
import { initializeBoard, boardToFEN } from '../chess_logic';
import { AppServerConfig } from '@mentra/sdk';

interface GameStatistics {
    totalGames: number;
    activeGames: number;
    gamesCompleted: number;
    averageGameDuration: number;
}

export class ChessAPIServer extends ChessServer {
    constructor(config: AppServerConfig) {
        super(config);
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
            const activeGames = this.sessionManager.getAllSessionIds()
                .map(sessionId => this.sessionManager.getSessionInfo(sessionId))
                .filter(info => info && info.state.mode !== SessionMode.GAME_OVER)
                .map(info => ({
                    sessionId: info!.sessionId,
                    userId: info!.userId,
                    mode: info!.state.mode,
                    userColor: info!.state.userColor,
                    currentPlayer: info!.state.currentPlayer,
                    createdAt: info!.createdAt,
                    lastActivity: info!.lastActivity
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
            const gameInfo = this.sessionManager.getSessionInfo(sessionId);

            if (!gameState || !gameInfo) {
                return res.status(404).json({ error: 'Game not found' });
            }

            res.json({
                sessionId,
                state: gameState,
                createdAt: gameInfo.createdAt,
                lastActivity: gameInfo.lastActivity
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

            // TODO: Provide a real AppSession if available. Using null as a placeholder for now.
            this.sessionManager.initializeSession(sessionId, initialState, userId, null as any);

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
        const allInfos = this.sessionManager.getAllSessionIds().map(id => this.sessionManager.getSessionInfo(id)).filter(Boolean);
        const totalGames = allInfos.length;
        const activeGames = allInfos.filter(info => info!.state.mode !== SessionMode.GAME_OVER).length;
        const gamesCompleted = totalGames - activeGames;

        // Calculate average game duration
        let totalDuration = 0;
        let completedGamesCount = 0;

        allInfos.forEach(info => {
            if (info!.state.mode === SessionMode.GAME_OVER && info!.createdAt && info!.lastActivity) {
                const duration = (info!.lastActivity.getTime() - info!.createdAt.getTime());
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

    // No need to override onSession/onStop for game history
    // Public method to get game history
    public getGameHistory() {
        return this.sessionManager.getAllSessionIds().map(id => this.sessionManager.getSessionInfo(id));
    }

    // Public method to get specific game info
    public getExpressApp(): any {
        // This would need to be implemented based on the actual SDK
        // For now, return a mock Express app or null
        return null;
    }
    public getGameInfo(sessionId: string) {
        return this.sessionManager.getSessionInfo(sessionId);
    }
} 