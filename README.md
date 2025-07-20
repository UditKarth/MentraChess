# AR Chess Server for AugmentOS

A robust, real-time chess server designed specifically for Augmented Reality (AR) smart glasses using the AugmentOS SDK. This server provides voice-controlled chess gameplay with AI opponents, real-time AR display updates, and comprehensive game state management.

## 🏗️ Server Architecture

### **Hybrid Architecture: WebSocket + REST**

**Primary Communication: WebSocket (Real-time)**
- **Real-time responsiveness**: Instant updates for AR displays
- **Voice interaction**: Handles real-time transcription events
- **Session management**: Automatic WebSocket connection handling via AugmentOS SDK
- **Scalability**: Efficiently manages multiple concurrent games

**Secondary Communication: REST API**
- **Game initialization**: Setup and configuration endpoints
- **Statistics and monitoring**: Game analytics and health checks
- **External integrations**: API for third-party applications

### **Why This Architecture for AugmentOS?**

1. **Voice-First Design**: WebSockets provide immediate response to voice commands
2. **AR Display Optimization**: Real-time updates ensure smooth AR experience
3. **Session Persistence**: Maintains game state across AR sessions
4. **Scalability**: Can handle multiple users simultaneously

## 🎮 Features

### **Core Gameplay**
- ✅ **Voice-controlled moves**: "Rook to d4", "Pawn e5"
- ✅ **AI opponent**: Configurable difficulty levels (Easy, Medium, Hard)
- ✅ **Real-time AR display**: Live board updates on smart glasses
- ✅ **Ambiguous move resolution**: Handles multiple possible moves
- ✅ **Game state persistence**: Maintains state across sessions

### **AR-Specific Features**
- ✅ **Board orientation**: Automatically flips based on player color
- ✅ **Captured pieces display**: Shows captured pieces in AR view
- ✅ **Turn indicators**: Clear visual feedback for current player
- ✅ **Move announcements**: Voice feedback for AI moves
- ✅ **Dashboard integration**: Game status in persistent dashboard

### **Advanced Features**
- ✅ **FEN notation support**: Standard chess notation for external tools
- ✅ **Game history tracking**: Complete move history and statistics
- ✅ **Session management**: Automatic cleanup and resource management
- ✅ **Error handling**: Graceful handling of invalid moves and timeouts

## 🚀 Quick Start

### **Prerequisites**
- Node.js 18+ or Bun
- AugmentOS SDK access
- Smart glasses with AugmentOS

### **Installation**

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd augmentOSChess
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   bun install
   ```

3. **Configure environment variables**
   ```bash
   # Create .env file
   PACKAGE_NAME=com.mentra.chess
   MENTRAOS_API_KEY=your_api_key_here
   PORT=3000
   ```

4. **Start the server**
   ```bash
   npm start
   # or
   bun start
   ```

### **Configuration**

The server can be configured via environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `PACKAGE_NAME` | Your app identifier | `com.mentra.chess` |
| `MENTRAOS_API_KEY` | AugmentOS API key | Required |
| `PORT` | Server port | `3000` |

## 🎯 Usage

### **Starting a Game**

1. **Launch the app on your smart glasses**
2. **Choose your color**: Say "white" or "black"
3. **Select difficulty**: Say "easy", "medium", or "hard"
4. **Start playing**: Make moves using voice commands

### **Voice Commands**

#### **Making Moves**
- `"Rook to d4"` - Move rook to d4
- `"Pawn e5"` - Move pawn to e5
- `"Knight f3"` - Move knight to f3
- `"Bishop to c4"` - Move bishop to c4

#### **Game Control**
- `"white"` / `"black"` - Choose color
- `"easy"` / `"medium"` / `"hard"` - Set difficulty
- `"one"`, `"two"`, etc. - Resolve ambiguous moves

### **AR Display**

The server provides rich AR displays:

- **Main View**: Current board state with piece positions
- **Dashboard**: Game status and turn information
- **Notifications**: Move confirmations and game events

## 🔧 API Endpoints

### **Health Check**
```http
GET /health
```
Returns server status and active session count.

### **Game Management**
```http
GET /api/games
GET /api/games/:sessionId
GET /api/games/:sessionId/fen
GET /api/games/:sessionId/board
POST /api/games
```

### **Statistics**
```http
GET /api/statistics
```

## 🏛️ Architecture Details

### **Core Components**

1. **ChessServer** (`src/server/ChessServer.ts`)
   - Main server class extending AugmentOS AppServer
   - Handles WebSocket connections and real-time events
   - Manages game sessions and state

2. **Game Logic** (`src/chess_logic.ts`)
   - Chess rules and move validation
   - Board state management
   - FEN notation handling

3. **Type Definitions** (`src/utils/types.ts`)
   - TypeScript interfaces and enums
   - Game state and session types

### **Session Management**

Each user session maintains:
- **Game State**: Board, pieces, turn, captured pieces
- **Session Mode**: Current game phase (setup, playing, etc.)
- **Event Handlers**: Voice, button, and head position events
- **Cleanup Functions**: Resource management

### **State Machine**

The game follows a clear state machine:

```
INITIALIZING → CHOOSING_COLOR → CHOOSING_DIFFICULTY → USER_TURN ↔ AI_TURN
     ↓
AWAITING_CLARIFICATION → USER_TURN
     ↓
GAME_OVER
```

## 🔍 Game State Management

### **Efficient State Storage**
- **In-memory sessions**: Fast access for active games
- **FEN notation**: Compact board representation
- **Captured pieces tracking**: Visual feedback for captures
- **Move history**: Complete game record

### **Concurrent Game Support**
- **Session isolation**: Each user has independent game state
- **Resource cleanup**: Automatic cleanup on session end
- **Memory management**: Efficient handling of multiple games

## 🎨 AR Display Features

### **Board Visualization**
- **8x8 grid**: Standard chess board layout
- **Piece representation**: Clear piece symbols (R, N, B, Q, K, P)
- **Color coding**: Uppercase (White) vs lowercase (Black)
- **Orientation**: Automatic flipping based on player color

### **Game Information**
- **Turn indicators**: Clear "White's Turn" / "Black's Turn"
- **Captured pieces**: Lists of captured pieces by each player
- **Move feedback**: Confirmation of successful moves
- **Error messages**: Clear feedback for invalid moves

## 🔧 Development

### **Project Structure**
```
src/
├── index.ts                 # Main entry point
├── chess_logic.ts          # Chess game logic
├── server/
│   ├── ChessServer.ts      # Main server implementation
│   └── ChessAPIServer.ts   # REST API extension
└── utils/
    ├── types.ts            # TypeScript definitions
    └── chessMoveParser.ts  # Move parsing utilities
```

### **Adding Features**

#### **New Voice Commands**
1. Add parsing logic in `chess_logic.ts`
2. Update `handleUserInput()` in `ChessServer.ts`
3. Test with voice commands

#### **New AR Displays**
1. Use `session.layouts.showTextWall()` or similar
2. Consider view types (MAIN vs DASHBOARD)
3. Test on actual smart glasses

#### **AI Improvements**
1. Replace `generateSimpleAIMove()` with Stockfish integration
2. Add move validation and legal move checking
3. Implement different difficulty algorithms

## 🧪 Testing

### **Voice Command Testing**
```bash
# Test move parsing
curl -X POST http://localhost:3000/api/test/move \
  -H "Content-Type: application/json" \
  -d '{"transcript": "rook to d4"}'
```

### **Game State Testing**
```bash
# Get current game state
curl http://localhost:3000/api/games/{sessionId}

# Get FEN representation
curl http://localhost:3000/api/games/{sessionId}/fen
```

## 🚀 Deployment

### **Production Setup**
1. **Environment Variables**: Set production API keys
2. **Process Management**: Use PM2 or similar
3. **Load Balancing**: For multiple server instances
4. **Monitoring**: Health checks and logging

### **Docker Deployment**
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## 🔮 Future Enhancements

### **Planned Features**
- [ ] **Stockfish Integration**: Advanced AI engine
- [ ] **Multiplayer Support**: Human vs human games
- [ ] **Game Analysis**: Move suggestions and analysis
- [ ] **Tournament Mode**: Multiple game management
- [ ] **Voice Customization**: Custom voice commands
- [ ] **Gesture Support**: Hand gesture controls

### **Performance Optimizations**
- [ ] **Move Caching**: Cache legal moves for faster response
- [ ] **State Compression**: Optimize memory usage
- [ ] **Connection Pooling**: Improve WebSocket handling
- [ ] **Database Integration**: Persistent game storage

## 📚 API Documentation

For detailed API documentation, see the inline comments in the source code and the AugmentOS SDK documentation.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For issues and questions:
1. Check the AugmentOS SDK documentation
2. Review the inline code comments
3. Open an issue on GitHub
4. Contact the development team

---

**Built with ❤️ for the AugmentOS community**
