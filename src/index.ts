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

// Create Express server for health checks
const express = require('express');
const healthApp = express();
const port = config.port;

// Health check endpoints
healthApp.get('/', (req: any, res: any) => {
    res.status(200).json({
        status: 'healthy',
        service: 'AR Chess Server',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

healthApp.get('/health', (req: any, res: any) => {
    res.status(200).json({
        status: 'healthy',
        service: 'AR Chess Server',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Start health check server first
const healthServer = healthApp.listen(port, () => {
    console.log(`✅ Health check server running on port ${port}`);
    console.log(`🔗 Health check available at: http://localhost:${port}/health`);
    
    // Now start the chess server
    chessServerInstance = new ChessServer(config);
    
    chessServerInstance.start()
        .then(() => {
            console.log(`✅ AR Chess Server started successfully on port ${config.port}`);
            console.log('🎮 Server is ready to handle chess game sessions!');
            console.log('\nFeatures:');
            console.log('- Voice-controlled chess gameplay');
            console.log('- Real-time AR display updates');
            console.log('- AI opponent with configurable difficulty');
            console.log('- Ambiguous move resolution');
            console.log('- Game state management');
        })
        .catch((error) => {
            console.error('❌ Failed to start AR Chess Server:', error);
            healthServer.close();
            process.exit(1);
        });
});

healthServer.on('error', (error: any) => {
    console.error('❌ Health server error:', error);
    process.exit(1);
});

// Graceful shutdown handling
let chessServerInstance: ChessServer | null = null;

process.on('SIGINT', () => {
    console.log('\nShutting down AR Chess Server...');
    if (chessServerInstance) {
        chessServerInstance.stop();
    }
    healthServer.close();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\nShutting down AR Chess Server...');
    if (chessServerInstance) {
        chessServerInstance.stop();
    }
    healthServer.close();
    process.exit(0);
});