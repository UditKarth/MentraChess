import { AppServerConfig } from '@mentra/sdk';
import { ChessServer } from './server/ChessServer';
import dotenv from 'dotenv';
import express from 'express';

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

// Create Express app for health checks
const app = express();
const port = config.port;

// Health check endpoint for Railway
app.get('/', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        service: 'AR Chess Server',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Health check endpoint with more details
app.get('/health', (req, res) => {
    const memoryStats = chessServer?.getMemoryStats() || {
        activeSessions: 0,
        boardCacheSize: 0,
        totalMemoryUsage: 0
    };
    
    res.status(200).json({
        status: 'healthy',
        service: 'AR Chess Server',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: memoryStats,
        environment: process.env.NODE_ENV || 'development'
    });
});

// Create and start the chess server
const chessServer = new ChessServer(config);

// Start both servers
async function startServers() {
    try {
        // Start Express server for health checks
        app.listen(port, () => {
            console.log(`Health check server running on port ${port}`);
            console.log(`Health check available at: http://localhost:${port}/health`);
        });

        // Start the chess server
        await chessServer.start();
        console.log(`AR Chess Server started successfully on port ${port}`);
        console.log('Server is ready to handle chess game sessions!');
        console.log('\nFeatures:');
        console.log('- Voice-controlled chess gameplay');
        console.log('- Real-time AR display updates');
        console.log('- AI opponent with configurable difficulty');
        console.log('- Ambiguous move resolution');
        console.log('- Game state management');
    } catch (error) {
        console.error('Failed to start servers:', error);
        process.exit(1);
    }
}

startServers();

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