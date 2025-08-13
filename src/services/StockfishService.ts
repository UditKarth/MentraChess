import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { SessionState, Difficulty } from '../utils/types';
import { boardToFEN } from '../chess_logic';

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
            console.log('🔧 Initializing Stockfish engine...');
            // Use the actual Stockfish binary instead of WASM
            this.stockfish = spawn('stockfish', [], { stdio: ['pipe', 'pipe', 'pipe'] });
            
            this.stockfish.stdout.on('data', (data: Buffer) => {
                const message = data.toString();
                console.log(`📤 Stockfish stdout: ${message.trim()}`);
                this.handleStockfishMessage(message);
            });
            
            this.stockfish.stderr.on('data', (data: Buffer) => {
                const message = data.toString();
                console.log(`⚠️ Stockfish stderr: ${message.trim()}`);
                // Don't treat stderr as an error - Stockfish often writes to stderr
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
            console.error('❌ Failed to spawn stockfish binary:', error);
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
        console.log(`[DEBUG] StockfishService.initializeEngine: Sending uci command`);
        this.sendCommand('uci');
        console.log(`[DEBUG] StockfishService.initializeEngine: Sending isready command`);
        this.sendCommand('isready');
        console.log(`[DEBUG] StockfishService.initializeEngine: Sending MultiPV option`);
        this.sendCommand('setoption name MultiPV value 1');
        console.log(`[DEBUG] StockfishService.initializeEngine: Sending Threads option`);
        this.sendCommand('setoption name Threads value 2');
        console.log(`[DEBUG] StockfishService.initializeEngine: Sending Hash option`);
        this.sendCommand('setoption name Hash value 64');
        console.log('📤 Engine initialization commands sent');
    }

    private handleStockfishMessage(message: string): void {
        this.buffer += message;
        let lines = this.buffer.split('\n');
        this.buffer = lines.pop() || '';
        
        for (const line of lines) {
            console.log(`[DEBUG] StockfishService.handleStockfishMessage: Processing line: "${line}"`);
            
            if (line === 'readyok') {
                this.isReady = true;
                this.isInitialized = true;
                console.log('✅ Stockfish engine ready');
            } else if (line.startsWith('bestmove')) {
                console.log(`[DEBUG] StockfishService.handleStockfishMessage: Received bestmove: ${line}`);
                this.handleBestMove(line);
            } else if (line.startsWith('info')) {
                // console.log(`[DEBUG] StockfishService.handleStockfishMessage: Received info: ${line}`);
                this.handleInfo(line);
            }
        }
    }

    private handleBestMove(line: string): void {
        const parts = line.split(' ');
        if (parts.length >= 2) {
            const bestMove = parts[1];
            console.log(`[DEBUG] StockfishService.handleBestMove: Parsed bestmove: ${bestMove}`);
            if (this.currentRequest && bestMove) {
                const move = this.parseMove(bestMove);
                console.log(`[DEBUG] StockfishService.handleBestMove: Resolving with move: ${JSON.stringify(move)}`);
                this.currentRequest.resolve(move);
                this.currentRequest = null;
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
        console.log(`[DEBUG] StockfishService.sendCommand: ${command}`);
        this.stockfish.stdin.write(command + '\n');
    }

    public async getBestMove(
        state: SessionState,
        difficulty: Difficulty = Difficulty.MEDIUM,
        timeLimit: number = 2000
    ): Promise<StockfishMove | null> {
        console.log(`[DEBUG] StockfishService.getBestMove: Starting move calculation`);
        console.log(`[DEBUG] StockfishService.getBestMove: Initialized: ${this.isInitialized}, Ready: ${this.isReady}`);
        
        if (!this.isInitialized) {
            throw new Error('Stockfish engine not initialized');
        }
        if (!this.isReady || !this.stockfish) {
            console.log(`[DEBUG] StockfishService.getBestMove: Engine not ready, returning null`);
            return null;
        }
        
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