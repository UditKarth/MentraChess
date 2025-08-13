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
            console.log('🔧 Attempting to spawn Stockfish from npm package...');
            
            // Run the single-threaded JavaScript file directly
            const stockfishJsPath = path.join(process.cwd(), 'node_modules', 'stockfish', 'src', 'stockfish-nnue-16-single.js');
            this.stockfish = spawn('node', [stockfishJsPath], { stdio: ['pipe', 'pipe', 'pipe'] });
            
            console.log('✅ Stockfish process spawned successfully');
            
            this.stockfish.stdout.on('data', (data: Buffer) => {
                console.log(`📤 Stockfish stdout: ${data.toString().trim()}`);
                this.handleStockfishMessage(data.toString());
            });
            
            this.stockfish.stderr.on('data', (data: Buffer) => {
                console.log(`⚠️ Stockfish stderr: ${data.toString().trim()}`);
            });
            
            this.stockfish.on('error', (err) => {
                console.error('❌ Stockfish process error:', err);
                this.stockfish = null;
                this.isReady = false;
                this.isInitialized = true;
            });
            
            this.stockfish.on('exit', (code, signal) => {
                console.log(`🔄 Stockfish process exited with code ${code}, signal ${signal}`);
                this.stockfish = null;
                this.isReady = false;
            });
            
            this.initializeEngine();
        } catch (error) {
            console.error('❌ Failed to spawn stockfish from npm package:', error);
            this.stockfish = null;
            this.isReady = false;
            this.isInitialized = true;
        }
    }

    private initializeEngine(): void {
        if (!this.stockfish) {
            console.log('❌ Cannot initialize engine - Stockfish process not available');
            return;
        }
        
        console.log('🔧 Initializing Stockfish engine...');
        this.sendCommand('uci');
        this.sendCommand('isready');
        this.sendCommand('setoption name MultiPV value 1');
        this.sendCommand('setoption name Threads value 2');
        this.sendCommand('setoption name Hash value 64');
        console.log('📤 Engine initialization commands sent');
    }

    private handleStockfishMessage(message: string): void {
        this.buffer += message;
        let lines = this.buffer.split('\n');
        this.buffer = lines.pop() || '';
        for (const line of lines) {
            if (line === 'readyok') {
                this.isReady = true;
                this.isInitialized = true;
                console.log('✅ Stockfish engine ready');
            } else if (line.startsWith('bestmove')) {
                this.handleBestMove(line);
            } else if (line.startsWith('info')) {
                this.handleInfo(line);
            } else if (line.trim()) {
                console.log(`📥 Stockfish message: ${line.trim()}`);
            }
        }
    }

    private handleBestMove(line: string): void {
        console.log(`[DEBUG] StockfishService.handleBestMove: Received line: ${line}`);
        const parts = line.split(' ');
        if (parts.length >= 2) {
            const bestMove = parts[1];
            console.log(`[DEBUG] StockfishService.handleBestMove: Best move: ${bestMove}`);
            if (this.currentRequest && bestMove) {
                const move = this.parseMove(bestMove);
                console.log(`[DEBUG] StockfishService.handleBestMove: Parsed move: ${JSON.stringify(move)}`);
                this.currentRequest.resolve(move);
                this.currentRequest = null;
            } else {
                console.log(`[DEBUG] StockfishService.handleBestMove: No current request or no best move`);
            }
        }
    }

    private handleInfo(line: string): void {
        // TODO: Implement info handling
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
        console.log(`[DEBUG] StockfishService.getBestMove: Starting move calculation`);
        console.log(`[DEBUG] StockfishService.getBestMove: isInitialized: ${this.isInitialized}, isReady: ${this.isReady}, stockfish: ${!!this.stockfish}`);
        
        if (!this.isInitialized) {
            console.log(`[DEBUG] StockfishService.getBestMove: Engine not initialized`);
            throw new Error('Stockfish engine not initialized');
        }
        if (!this.isReady || !this.stockfish) {
            console.log(`[DEBUG] StockfishService.getBestMove: Engine not ready or not available`);
            return null;
        }
        
        console.log(`[DEBUG] StockfishService.getBestMove: Engine ready, calculating move`);
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                console.log(`[DEBUG] StockfishService.getBestMove: Timeout reached`);
                reject(new Error('Stockfish move calculation timeout'));
            }, timeLimit + 1000);
            this.currentRequest = { resolve, reject, timeout };
            const depth = this.getDepthForDifficulty(difficulty);
            const movetime = this.getMoveTimeForDifficulty(difficulty, timeLimit);
            const fen = boardToFEN(state);
            console.log(`[DEBUG] StockfishService.getBestMove: FEN: ${fen}`);
            console.log(`[DEBUG] StockfishService.getBestMove: Depth: ${depth}, MoveTime: ${movetime}`);
            this.sendCommand(`position fen ${fen}`);
            if (depth > 0) {
                console.log(`[DEBUG] StockfishService.getBestMove: Sending go depth ${depth}`);
                this.sendCommand(`go depth ${depth}`);
            } else {
                console.log(`[DEBUG] StockfishService.getBestMove: Sending go movetime ${movetime}`);
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