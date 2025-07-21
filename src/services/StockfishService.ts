import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { SessionState, Difficulty } from '../utils/types';
import { boardToFEN } from '../chess_logic';
import path from 'path';

export interface StockfishMove {
    source: string;
    target: string;
    promotion?: string;
    score?: number;
    depth?: number;
}

export class StockfishService {
    private stockfish: ChildProcessWithoutNullStreams | null = null;
    private isReady: boolean = false;
    private isInitialized: boolean = false;
    private currentRequest: any = null;
    private buffer: string = '';

    constructor() {
        this.initializeStockfish();
    }

    private initializeStockfish(): void {
        try {
            // Find the path to stockfish.js in node_modules
            const stockfishPath = require.resolve('stockfish/src/stockfish.js');
            this.stockfish = spawn('node', [stockfishPath], { stdio: ['pipe', 'pipe', 'pipe'] });
            this.stockfish.stdout.on('data', (data: Buffer) => {
                this.handleStockfishMessage(data.toString());
            });
            this.stockfish.stderr.on('data', (data: Buffer) => {
                // Optionally log errors
                // console.error('Stockfish stderr:', data.toString());
            });
            this.stockfish.on('error', (err) => {
                console.error('Stockfish process error:', err);
                this.stockfish = null;
                this.isReady = false;
                this.isInitialized = true;
            });
            this.initializeEngine();
        } catch (error) {
            console.error('Failed to spawn stockfish.js:', error);
            this.stockfish = null;
            this.isReady = false;
            this.isInitialized = true;
        }
    }

    private initializeEngine(): void {
        if (!this.stockfish) return;
        this.sendCommand('uci');
        this.sendCommand('isready');
        this.sendCommand('setoption name MultiPV value 1');
        this.sendCommand('setoption name Threads value 2');
        this.sendCommand('setoption name Hash value 64');
    }

    private handleStockfishMessage(message: string): void {
        this.buffer += message;
        let lines = this.buffer.split('\n');
        this.buffer = lines.pop() || '';
        for (const line of lines) {
            if (line === 'readyok') {
                this.isReady = true;
                this.isInitialized = true;
                console.log('Stockfish engine ready');
            } else if (line.startsWith('bestmove')) {
                this.handleBestMove(line);
            } else if (line.startsWith('info')) {
                this.handleInfo(line);
            }
        }
    }

    private handleBestMove(line: string): void {
        const parts = line.split(' ');
        if (parts.length >= 2) {
            const bestMove = parts[1];
            if (this.currentRequest && bestMove) {
                const move = this.parseMove(bestMove);
                this.currentRequest.resolve(move);
                this.currentRequest = null;
            }
        }
    }

    private handleInfo(line: string): void {
        // Optionally parse info for analysis
    }

    private parseMove(moveString: string): StockfishMove {
        if (moveString === '(none)' || moveString === '0000') {
            return { source: '', target: '' };
        }
        const source = moveString.substring(0, 2);
        const target = moveString.substring(2, 4);
        const promotion = moveString.length > 4 ? moveString.substring(4, 5) : undefined;
        return { source, target, ...(promotion && { promotion }) };
    }

    private sendCommand(command: string): void {
        if (!this.stockfish) return;
        this.stockfish.stdin.write(command + '\n');
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
            return null;
        }
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Stockfish move calculation timeout'));
            }, timeLimit + 1000);
            this.currentRequest = { resolve, reject, timeout };
            const depth = this.getDepthForDifficulty(difficulty);
            const movetime = this.getMoveTimeForDifficulty(difficulty, timeLimit);
            const fen = boardToFEN(state);
            this.sendCommand(`position fen ${fen}`);
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
                return 8;
            case Difficulty.MEDIUM:
                return 12;
            case Difficulty.HARD:
                return 20;
            default:
                return 12;
        }
    }

    private getMoveTimeForDifficulty(difficulty: Difficulty, timeLimit: number): number {
        switch (difficulty) {
            case Difficulty.EASY:
                return Math.min(timeLimit, 1000);
            case Difficulty.MEDIUM:
                return Math.min(timeLimit, 2000);
            case Difficulty.HARD:
                return Math.min(timeLimit, 5000);
            default:
                return Math.min(timeLimit, 2000);
        }
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
            this.stockfish.kill();
        }
    }
} 