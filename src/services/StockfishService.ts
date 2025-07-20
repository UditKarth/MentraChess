import { spawn } from 'child_process';
import { SessionState, PlayerColor, Difficulty } from '../utils/types';
import { boardToFEN } from '../chess_logic';

export interface StockfishMove {
    source: string;
    target: string;
    promotion?: string;
    score?: number;
    depth?: number;
}

export interface StockfishAnalysis {
    bestMove: string;
    score: number;
    depth: number;
    time: number;
    pv?: string[];
}

export class StockfishService {
    private stockfish: any;
    private isReady: boolean = false;
    private isInitialized: boolean = false;
    private moveQueue: Array<{
        resolve: (move: StockfishMove | null) => void;
        reject: (error: Error) => void;
        timeout: NodeJS.Timeout;
    }> = [];
    private currentRequest: any = null;

    constructor() {
        // Initialize with a timeout to prevent hanging
        setTimeout(() => {
            if (!this.isInitialized) {
                console.warn('Stockfish initialization timeout, falling back to simple AI');
                this.isInitialized = true;
                this.isReady = false;
            }
        }, 5000); // 5 second timeout
        
        this.initializeStockfish();
    }

    private initializeStockfish(): void {
        console.log('Initializing Stockfish service...');
        
        try {
            // Try to use the stockfish npm package
            console.log('Attempting to load Stockfish npm package...');
            const Stockfish = require('stockfish');
            this.stockfish = Stockfish();
            console.log('Successfully loaded Stockfish npm package');
        } catch (error) {
            console.warn('Stockfish npm package not available:', (error as Error).message);
            console.warn('Trying system stockfish...');
            
            try {
                // Fallback to system stockfish if available
                console.log('Attempting to spawn system Stockfish...');
                this.stockfish = spawn('stockfish');
                
                // Add error handler for the spawned process
                this.stockfish.on('error', (err: any) => {
                    console.warn('System Stockfish process error:', err.message);
                    this.stockfish = null;
                    this.isReady = false;
                    this.isInitialized = true;
                });
                
                console.log('Successfully spawned system Stockfish');
            } catch (systemError) {
                console.warn('System Stockfish spawn failed:', systemError);
                console.warn('Stockfish not available. AI will use simple move generation.');
                console.warn('To enable Stockfish: npm install stockfish or install system stockfish');
                this.stockfish = null;
                this.isReady = false;
                this.isInitialized = true; // Mark as initialized but not ready
                return;
            }
        }

        console.log('Setting up Stockfish event handlers...');
        this.setupEventHandlers();
        console.log('Initializing Stockfish engine...');
        this.initializeEngine();
    }

    private setupEventHandlers(): void {
        if (!this.stockfish) {
            return; // No stockfish available
        }

        if (this.stockfish.on) {
            // npm package version
            this.stockfish.on('message', (data: string) => {
                this.handleStockfishMessage(data);
            });
        } else if (this.stockfish.stdout) {
            // system process version
            this.stockfish.stdout.on('data', (data: Buffer) => {
                this.handleStockfishMessage(data.toString());
            });
        }
    }

    private initializeEngine(): void {
        if (!this.stockfish) {
            return; // No stockfish available
        }

        this.sendCommand('uci');
        this.sendCommand('isready');
        this.sendCommand('setoption name MultiPV value 1');
        this.sendCommand('setoption name Threads value 4');
        this.sendCommand('setoption name Hash value 128');
    }

    private handleStockfishMessage(message: string): void {
        const lines = message.trim().split('\n');
        
        for (const line of lines) {
            if (line === 'readyok') {
                this.isReady = true;
                this.isInitialized = true;
                console.log('Stockfish engine ready');
            } else if (line.startsWith('bestmove')) {
                this.handleBestMove(line);
            } else if (line.startsWith('info')) {
                // Could parse additional info like score, depth, etc.
                this.handleInfo(line);
            }
        }
    }

    private handleBestMove(line: string): void {
        const parts = line.split(' ');
        if (parts.length >= 2) {
            const bestMove = parts[1];
            const ponder = parts.length > 2 ? parts[3] : undefined;
            
            if (this.currentRequest && bestMove) {
                const move = this.parseMove(bestMove);
                this.currentRequest.resolve(move);
                this.currentRequest = null;
            }
        }
    }

    private handleInfo(line: string): void {
        // Parse additional info like score, depth, etc.
        // This could be used for more detailed analysis
        const scoreMatch = line.match(/score (cp|mate) (-?\d+)/);
        const depthMatch = line.match(/depth (\d+)/);
        
        if (scoreMatch && depthMatch && this.currentRequest && scoreMatch[2] && depthMatch[1]) {
            const score = parseInt(scoreMatch[2]);
            const depth = parseInt(depthMatch[1]);
            // Could store this info for the current request
        }
    }

    private parseMove(moveString: string): StockfishMove {
        if (moveString === '(none)' || moveString === '0000') {
            return { source: '', target: '' };
        }

        const source = moveString.substring(0, 2);
        const target = moveString.substring(2, 4);
        const promotion = moveString.length > 4 ? moveString.substring(4, 5) : undefined;

        return {
            source,
            target,
            ...(promotion && { promotion })
        };
    }

    private sendCommand(command: string): void {
        if (!this.stockfish) {
            return; // No stockfish available
        }

        if (this.stockfish.postMessage) {
            // npm package version
            this.stockfish.postMessage(command);
        } else if (this.stockfish.stdin) {
            // system process version
            this.stockfish.stdin.write(command + '\n');
        }
    }

    public async getBestMove(
        state: SessionState, 
        difficulty: Difficulty = Difficulty.MEDIUM,
        timeLimit: number = 2000
    ): Promise<StockfishMove | null> {
        if (!this.isInitialized) {
            throw new Error('Stockfish engine not initialized');
        }

        if (!this.isReady || !this.stockfish) {
            return null; // Stockfish not available, fall back to simple AI
        }

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Stockfish move calculation timeout'));
            }, timeLimit + 1000);

            this.currentRequest = { resolve, reject, timeout };

            // Set difficulty-based parameters
            const depth = this.getDepthForDifficulty(difficulty);
            const movetime = this.getMoveTimeForDifficulty(difficulty, timeLimit);

            // Set up position
            const fen = boardToFEN(state);
            this.sendCommand(`position fen ${fen}`);

            // Start analysis
            if (depth > 0) {
                this.sendCommand(`go depth ${depth}`);
            } else {
                this.sendCommand(`go movetime ${movetime}`);
            }
        });
    }

    private getDepthForDifficulty(difficulty: Difficulty): number {
        switch (difficulty) {
            case Difficulty.EASY:
                return 8; // Shallow search for easy
            case Difficulty.MEDIUM:
                return 12; // Medium depth
            case Difficulty.HARD:
                return 20; // Deep search for hard
            default:
                return 12;
        }
    }

    private getMoveTimeForDifficulty(difficulty: Difficulty, timeLimit: number): number {
        switch (difficulty) {
            case Difficulty.EASY:
                return Math.min(timeLimit, 1000); // Quick moves for easy
            case Difficulty.MEDIUM:
                return Math.min(timeLimit, 2000); // Medium time
            case Difficulty.HARD:
                return Math.min(timeLimit, 5000); // More time for hard
            default:
                return Math.min(timeLimit, 2000);
        }
    }

    public async analyzePosition(
        state: SessionState, 
        depth: number = 15
    ): Promise<StockfishAnalysis | null> {
        if (!this.isInitialized) {
            throw new Error('Stockfish engine not initialized');
        }

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Stockfish analysis timeout'));
            }, 10000);

            this.currentRequest = { resolve, reject, timeout };

            const fen = boardToFEN(state);
            this.sendCommand(`position fen ${fen}`);
            this.sendCommand(`go depth ${depth}`);
        });
    }

    public isEngineReady(): boolean {
        return this.isReady;
    }

    public async stop(): Promise<void> {
        if (this.currentRequest) {
            clearTimeout(this.currentRequest.timeout);
            this.currentRequest.reject(new Error('Engine stopped'));
            this.currentRequest = null;
        }

        if (this.stockfish) {
            this.sendCommand('quit');
            
            if (this.stockfish.kill) {
                this.stockfish.kill();
            }
        }
    }
} 