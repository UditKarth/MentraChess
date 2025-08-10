import { AppServerConfig } from '@mentra/sdk';
import { ChessServer } from './server/ChessServer';
import dotenv from 'dotenv';
import http from 'http';

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

// Create a simple HTTP server to handle the root path for Railway's public webview
const rootServer = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            name: 'AR Chess Server',
            version: '1.0.0',
            status: 'running',
            description: 'Augmented Reality Chess Server for MentraOS Smart Glasses',
            endpoints: {
                health: '/health',
                info: 'This server is managed by MentraOS SDK'
            },
            message: 'Server is running and ready for MentraOS connections'
        }));
    } else if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'healthy',
            app: config.packageName,
            activeSessions: 0
        }));
    } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            message: 'AR Chess Server is running',
            availableEndpoints: ['/', '/health'],
            note: 'This is the public webview endpoint for Railway'
        }));
    }
});

// Start the root server first
rootServer.listen(config.port, () => {
    console.log(`✅ Root path handler started on port ${config.port}`);
    console.log(`✅ Railway public webview should now work at: http://localhost:${config.port}/`);
    
    // Now start the MentraOS server on a different port
    const mentraConfig = {
        ...config,
        port: (config.port || 3000) + 1
    };
    
    const chessServer = new ChessServer(mentraConfig);
    
    chessServer.start()
        .then(() => {
            console.log(`AR Chess Server started successfully on port ${mentraConfig.port}`);
            console.log('Server is ready to handle chess game sessions!');
            console.log('\nFeatures:');
            console.log('- Voice-controlled chess gameplay');
            console.log('- Real-time AR display updates');
            console.log('- AI opponent with configurable difficulty');
            console.log('- Ambiguous move resolution');
            console.log('- Game state management');
            console.log('\nHealth check available at: http://localhost:' + config.port + '/health');
            console.log('MentraOS server running on port: ' + mentraConfig.port);
        })
        .catch((error) => {
            console.error('Failed to start AR Chess Server:', error);
            rootServer.close();
            process.exit(1);
        });
});

// Graceful shutdown handling
process.on('SIGINT', () => {
    console.log('\nShutting down AR Chess Server...');
    rootServer.close();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\nShutting down AR Chess Server...');
    rootServer.close();
    process.exit(0);
});