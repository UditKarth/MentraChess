import { AppServerConfig } from '@mentra/sdk';
import { ChessServer } from './server/ChessServer';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Add proper error handling types
interface ErrorWithMessage {
    message: string;
}

// Environment variables (loaded from .env file by dotenv.config())
const config: AppServerConfig = {
    packageName: process.env.PACKAGE_NAME!,
    apiKey: process.env.MENTRAOS_API_KEY!,
    port: parseInt(process.env.PORT || '3000'),
    publicDir: false
};

// Validate required environment variables
if (!config.apiKey) {
    throw new Error('MENTRAOS_API_KEY is required. Please set it in your environment variables.');
}

console.log('Starting AR Chess Server...');
console.log(`Package Name: ${config.packageName}`);
console.log(`Port: ${config.port}`);

// Create and start the chess server
const chessServer = new ChessServer(config);

chessServer.start()
    .then(() => {
        console.log(`✅ AR Chess Server started successfully on port ${config.port}`);
        console.log('🎮 Server is ready to handle chess game sessions!');
        console.log('\nFeatures:');
        console.log('- Voice-controlled chess gameplay');
        console.log('- Real-time AR display updates');
        console.log('- AI opponent with configurable difficulty');
        console.log('- Ambiguous move resolution');
        console.log('- Game state management');
        console.log(`🔗 Health check available at: http://localhost:${config.port}/health`);
    })
    .catch((error) => {
        console.error('❌ Failed to start AR Chess Server:', error);
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