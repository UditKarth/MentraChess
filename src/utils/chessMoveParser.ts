import { StreamType, TranscriptionData } from '@mentra/sdk';

interface ChessMove {
  piece: string;
  from?: string | undefined;
  to: string;
  promotion?: string;
  isCapture?: boolean;
  isCastling?: boolean;
  castlingSide?: 'kingside' | 'queenside';
}

export function parseChessMove(text: string): ChessMove | null {
  // Convert to lowercase and remove extra spaces
  let cleanText = text.toLowerCase().trim();
  // Fix common voice misrecognition: 'pond' -> 'pawn'
  cleanText = cleanText.replace(/\bpond\b/g, 'pawn');
  
  // Castling patterns
  if (cleanText.match(/^(castle|castling)\s+(king|queen)side$/)) {
    const match = cleanText.match(/^(castle|castling)\s+(king|queen)side$/);
    return {
      piece: 'K',
      to: match![2] === 'kingside' ? 'G1' : 'C1', // G1 for kingside, C1 for queenside
      isCastling: true,
      castlingSide: match![2] as 'kingside' | 'queenside'
    };
  }

  // Basic move patterns with optional source square
  const movePatterns = [
    // Knight from B1 to C3
    /^(knight|k)\s+(?:from\s+)?([a-h][1-8])?\s+to\s+([a-h][1-8])$/,
    // Pawn B6
    /^(pawn|p)\s+([a-h][1-8])$/,
    // Bishop from C1 to E3
    /^(bishop|b)\s+(?:from\s+)?([a-h][1-8])?\s+to\s+([a-h][1-8])$/,
    // Rook from H1 to H4
    /^(rook|r)\s+(?:from\s+)?([a-h][1-8])?\s+to\s+([a-h][1-8])$/,
    // Queen from D1 to H5
    /^(queen|q)\s+(?:from\s+)?([a-h][1-8])?\s+to\s+([a-h][1-8])$/,
    // King from E1 to E2
    /^(king|k)\s+(?:from\s+)?([a-h][1-8])?\s+to\s+([a-h][1-8])$/
  ];

  // Enhanced capture patterns for all pieces
  const capturePatterns = [
    /^(pawn|p)\s+(?:takes|captures)\s+(?:on\s+)?([a-h][1-8])$/, // Pawn takes a5
    /^(knight|k)\s+(?:takes|captures)\s+(?:on\s+)?([a-h][1-8])$/,
    /^(bishop|b)\s+(?:takes|captures)\s+(?:on\s+)?([a-h][1-8])$/,
    /^(rook|r)\s+(?:takes|captures)\s+(?:on\s+)?([a-h][1-8])$/,
    /^(queen|q)\s+(?:takes|captures)\s+(?:on\s+)?([a-h][1-8])$/,
    /^(king|k)\s+(?:takes|captures)\s+(?:on\s+)?([a-h][1-8])$/
  ];

  // Promotion patterns
  const promotionPatterns = [
    // Pawn to queen on A8
    /^(pawn|p)\s+to\s+(queen|q|rook|r|bishop|b|knight|k)\s+(?:on\s+)?([a-h][1-8])$/,
    // Pawn promotes to queen on A8
    /^(pawn|p)\s+promotes\s+to\s+(queen|q|rook|r|bishop|b|knight|k)\s+(?:on\s+)?([a-h][1-8])$/
  ];

  // Try capture patterns first
  for (const pattern of capturePatterns) {
    const match = cleanText.match(pattern);
    if (match) {
      const piece = match[1];
      const to = match[2];
      return {
        piece: piece?.charAt(0) ?? '',
        to: to?.toUpperCase() ?? '',
        isCapture: true
      };
    }
  }

  // Try promotion patterns
  for (const pattern of promotionPatterns) {
    const match = cleanText.match(pattern);
    if (match) {
      const piece = match[1];
      const promotion = match[2];
      const to = match[3];
      return {
        piece: piece?.charAt(0) ?? '',
        to: to?.toUpperCase() ?? '',
        promotion: promotion?.charAt(0) ?? ''
      };
    }
  }

  // Try regular move patterns
  for (const pattern of movePatterns) {
    const match = cleanText.match(pattern);
    if (match) {
      const piece = match[1];
      const from = match[2];
      const to = match[3];
      
      return {
        piece: piece?.charAt(0) ?? '',
        from: from?.toUpperCase() ?? undefined,
        to: to?.toUpperCase() ?? ''
      };
    }
  }

  return null;
}

export function handleChessTranscription(data: TranscriptionData, onMoveParsed: (move: ChessMove) => void) {
  if (!data.isFinal) return; // Only process final transcriptions
  
  const move = parseChessMove(data.text);
  if (move) {
    onMoveParsed(move);
  }
} 