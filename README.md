# MentraChess

A real-time chess server for AR smart glasses using the MentraOS SDK. Features voice-controlled chess, AR board display, and Stockfish AI—all deployable on Node.js or Bun with no system binary dependencies.

## Features
- Voice-controlled chess moves (e.g., "rook to d4", "pawn e5")
- AI opponent (Stockfish, configurable difficulty)
- Real-time AR board and feedback display
- Session and game state management

## Quick Start

### Prerequisites
- Node.js 18+ or Bun
- AugmentOS SDK access
- Smart glasses with AugmentOS

### Install & Run
```bash
git clone <repo-url>
cd augmentOSChess
npm install # or bun install
npm start   # or bun start
```

### Configuration
Set these environment variables (or in a `.env` file):
- `PACKAGE_NAME` (default: `com.mentra.chess`)
- `MENTRAOS_API_KEY` (required)
- `PORT` (default: `3000`)

## Stockfish AI Setup
- Uses the npm `stockfish` package (runs as a Node.js child process)
- **No system binary or WASM setup required**
- Works on Railway, Vercel, and all Node.js hosts

## Health Check
- `GET /health` — Server status

## Project Structure
```
src/
  index.ts              # Entry point
  chess_logic.ts        # Chess rules & board rendering
  server/
    ChessServer.ts      # Main server logic
  services/
    StockfishService.ts # Stockfish AI integration
  utils/
    types.ts            # TypeScript types
    chessMoveParser.ts  # Move parsing
```

## How to Play
- Launch the app on your smart glasses
- Set color and difficulty in the MentraOS app
- Use voice to make moves (e.g., "knight f3")
- See the board and feedback in AR

## License
MIT
