// AugmentOS Chess Server Configuration
// Update this file with your actual values

export const config = {
    // Your unique app identifier (must match console.mentra.glass)
    packageName: 'com.mentra.chess',
    
    // Your API key from console.mentra.glass
    apiKey: 'your_api_key_here', // Replace with your actual API key
    
    // Server port (default: 3000)
    port: 3000,
    
    // Optional: Enable debug logging
    debug: false,
    
    // Game settings
    game: {
        // Timeout for move clarification (30 seconds)
        clarificationTimeout: 30000,
        
        // AI thinking delay (2 seconds)
        aiMoveDelay: 2000,
        
        // Maximum concurrent games
        maxConcurrentGames: 100
    }
}; 