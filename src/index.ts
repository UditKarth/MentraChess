import { ChessServer } from './server/ChessServer';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Add proper error handling types
interface ErrorWithMessage {
    message: string;
}

// Environment variables (loaded from .env file by dotenv.config())
const MENTRAOS_API_KEY = process.env.MENTRAOS_API_KEY ?? '';
const PACKAGE_NAME = process.env.PACKAGE_NAME ?? 'com.mentra.chess';
const PORT = parseInt(process.env.PORT || '3000');

// Validate required environment variables
if (!MENTRAOS_API_KEY) {
    throw new Error('MENTRAOS_API_KEY is required. Please set it in your environment variables.');
}

console.log('Starting AR Chess Server...');
console.log(`Package Name: ${PACKAGE_NAME}`);
console.log(`Port: ${PORT}`);

// Create and start the chess server
const chessServer = new ChessServer();

chessServer.start()
    .then(() => {
        console.log(`AR Chess Server started successfully on port ${PORT}`);
        console.log('Server is ready to handle chess game sessions!');
        console.log('\nFeatures:');
        console.log('- Voice-controlled chess gameplay');
        console.log('- Real-time AR display updates');
        console.log('- AI opponent with configurable difficulty');
        console.log('- Ambiguous move resolution');
        console.log('- Game state management');
        console.log('\nHealth check available at: http://localhost:' + PORT + '/health');
    })
    .catch((error: ErrorWithMessage) => {
        console.error('Failed to start AR Chess Server:', error.message);
        process.exit(1);
    });

// Graceful shutdown handling
process.on('SIGINT', () => {
    console.log('\nShutting down AR Chess Server...');
    chessServer.stop();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\nShutting down AR Chess Server...');
    chessServer.stop();
    process.exit(0);
});