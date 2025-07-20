import { Coordinates, Piece } from './types';
import { algebraicToCoords, coordsToAlgebraic } from '../chess_logic';

export interface StockfishMove {
    source: string;
    target: string;
    promotion?: string;
    score?: number;
    depth?: number;
}

export interface InternalMove {
    source: Coordinates;
    target: Coordinates;
    piece: Piece;
    promotion?: Piece;
}

/**
 * Converts a Stockfish move (e.g., "e2e4") to internal coordinates
 */
export function stockfishMoveToInternal(
    stockfishMove: StockfishMove, 
    board: Piece[][]
): InternalMove | null {
    if (!stockfishMove.source || !stockfishMove.target) {
        return null;
    }

    const sourceCoords = algebraicToCoords(stockfishMove.source);
    const targetCoords = algebraicToCoords(stockfishMove.target);

    if (!sourceCoords || !targetCoords) {
        return null;
    }

    const [sourceRow, sourceCol] = sourceCoords;
    const piece = board[sourceRow]?.[sourceCol];

    if (!piece || piece === ' ') {
        return null;
    }

    // Handle promotion
    let promotion: Piece | undefined;
    if (stockfishMove.promotion) {
        const promotionChar = stockfishMove.promotion.toLowerCase();
        const isWhite = piece === piece.toUpperCase();
        
        switch (promotionChar) {
            case 'q':
                promotion = isWhite ? 'Q' : 'q';
                break;
            case 'r':
                promotion = isWhite ? 'R' : 'r';
                break;
            case 'b':
                promotion = isWhite ? 'B' : 'b';
                break;
            case 'n':
                promotion = isWhite ? 'N' : 'n';
                break;
        }
    }

    return {
        source: sourceCoords,
        target: targetCoords,
        piece,
        ...(promotion && { promotion })
    };
}

/**
 * Converts internal move format to Stockfish format
 */
export function internalMoveToStockfish(move: InternalMove): string {
    const source = coordsToAlgebraic(move.source);
    const target = coordsToAlgebraic(move.target);
    
    if (move.promotion) {
        const promotionChar = move.promotion.toLowerCase();
        return `${source}${target}${promotionChar}`;
    }
    
    return `${source}${target}`;
}

/**
 * Validates if a Stockfish move is legal on the current board
 */
export function validateStockfishMove(
    stockfishMove: StockfishMove, 
    board: Piece[][]
): boolean {
    const internalMove = stockfishMoveToInternal(stockfishMove, board);
    if (!internalMove) {
        return false;
    }

    const [sourceRow, sourceCol] = internalMove.source;
    const [targetRow, targetCol] = internalMove.target;

    // Check if source square has a piece
    const piece = board[sourceRow]?.[sourceCol];
    if (!piece || piece === ' ') {
        return false;
    }

    // Check if target square is not occupied by own piece
    const targetPiece = board[targetRow]?.[targetCol];
    if (targetPiece && targetPiece !== ' ') {
        const isSourceWhite = piece === piece.toUpperCase();
        const isTargetWhite = targetPiece === targetPiece.toUpperCase();
        if (isSourceWhite === isTargetWhite) {
            return false; // Can't capture own piece
        }
    }

    return true;
} 