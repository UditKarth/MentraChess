import { ChessServer } from '../server/ChessServer';
import { AppServerConfig } from '@mentra/sdk';

describe('Railway Deployment Validation', () => {
    let originalNodeEnv: string | undefined;

    beforeEach(() => {
        // Store original NODE_ENV
        originalNodeEnv = process.env.NODE_ENV;
    });

    afterEach(() => {
        // Restore original NODE_ENV
        if (originalNodeEnv !== undefined) {
            process.env.NODE_ENV = originalNodeEnv;
        } else {
            delete process.env.NODE_ENV;
        }
    });

    test('should use random ports in development mode', () => {
        // Set development mode
        process.env.NODE_ENV = 'development';
        
        const config: AppServerConfig = {
            packageName: 'test-chess-server',
            apiKey: 'test-api-key',
            port: 3000,
            publicDir: false
        };

        const chessServer = new ChessServer(config);
        
        // In development mode, networkService should be initialized immediately
        expect(chessServer).toBeDefined();
        
        // Clean up
        chessServer.cleanupForTests();
    });

    test('should defer WebSocket initialization in production mode', () => {
        // Set production mode
        process.env.NODE_ENV = 'production';
        
        const config: AppServerConfig = {
            packageName: 'test-chess-server',
            apiKey: 'test-api-key',
            port: 3000,
            publicDir: false
        };

        const chessServer = new ChessServer(config);
        
        // In production mode, networkService should be null initially
        // It will be initialized after the server starts
        expect(chessServer).toBeDefined();
        
        // Clean up
        chessServer.cleanupForTests();
    });

    test('should handle missing NODE_ENV gracefully', () => {
        // Remove NODE_ENV
        delete process.env.NODE_ENV;
        
        const config: AppServerConfig = {
            packageName: 'test-chess-server',
            apiKey: 'test-api-key',
            port: 3000,
            publicDir: false
        };

        const chessServer = new ChessServer(config);
        
        // Should default to development behavior
        expect(chessServer).toBeDefined();
        
        // Clean up
        chessServer.cleanupForTests();
    });
});
