import { ChessServer } from '../server/ChessServer';
import { memoryMonitor } from '../utils/memoryMonitor';

console.log('🧪 Setting up chess test environment...');

// Global test cleanup
afterAll(async () => {
  console.log('🧹 Cleaning up test environment...');
  
  // Stop memory monitoring
  memoryMonitor.stopMonitoring();
  
  // Clear any remaining intervals (simplified approach)
  // Note: Jest should handle most cleanup automatically
  
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }
  
  // Wait a bit for any pending operations to complete
  await new Promise(resolve => setTimeout(resolve, 100));
}, 10000); // 10 second timeout for cleanup

// Handle unhandled promise rejections in tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions in tests
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

// Global test utilities
global.console = {
  ...console,
  // Uncomment to suppress console.log during tests
  // log: jest.fn(),
  // debug: jest.fn(),
  // info: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn(),
}; 