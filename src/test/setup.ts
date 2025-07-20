// Jest setup file for chess tests

// Global test configuration
beforeAll(() => {
  // Set up any global test configuration
  console.log('🧪 Setting up chess test environment...');
});

afterAll(() => {
  // Clean up any global test resources
  console.log('🧹 Cleaning up test environment...');
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