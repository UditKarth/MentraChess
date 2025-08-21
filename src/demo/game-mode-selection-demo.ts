import { GameModeCommandProcessor, GameModeCommand } from '../utils/gameModeCommands';

/**
 * Demo script showing how game mode selection works with voice commands
 */
function runGameModeSelectionDemo() {
  console.log('🎮 Game Mode Selection Demo\n');
  
  // Test commands
  const testCommands = [
    // AI Game commands
    'play against AI',
    'AI hard',
    'computer medium',
    'single player',
    
    // Friend Game commands
    'play against Alice',
    'play with Bob',
    'against Charlie',
    
    // Random Matchmaking commands
    'find opponent',
    'quick match',
    'search for game',
    
    // Menu and Help commands
    'menu',
    'help',
    'what can I do',
    
    // Edge cases
    'play against AI easy',
    'play against friend',
    'multiplayer',
    'unknown command'
  ];
  
  console.log('Testing voice command parsing:\n');
  
  testCommands.forEach(command => {
    const result = GameModeCommandProcessor.parseCommand(command);
    console.log(`"${command}" → ${result.type}${result.params ? ` (${JSON.stringify(result.params)})` : ''}`);
  });
  
  console.log('\n' + '='.repeat(50) + '\n');
  
  // Show help text
  console.log('📋 Help Text:');
  console.log(GameModeCommandProcessor.getHelpText());
  
  console.log('\n' + '='.repeat(50) + '\n');
  
  // Show menu text
  console.log('📋 Menu Text:');
  console.log(GameModeCommandProcessor.getMenuText());
  
  console.log('\n' + '='.repeat(50) + '\n');
  
  // Simulate user interaction flow
  console.log('🎯 Simulated User Interaction Flow:\n');
  
  simulateUserFlow();
}

function simulateUserFlow() {
  console.log('1. User starts app → Shows game mode selection menu');
  console.log('2. User says: "Play against AI hard"');
  
  const command1 = GameModeCommandProcessor.parseCommand('Play against AI hard');
  console.log(`   → Parsed as: ${command1.type} with difficulty: ${command1.params?.difficulty}`);
  console.log('   → Starts AI game with hard difficulty\n');
  
  console.log('3. User says: "Play against Alice"');
  const command2 = GameModeCommandProcessor.parseCommand('Play against Alice');
  console.log(`   → Parsed as: ${command2.type} with friend: ${command2.params?.friendName}`);
  console.log('   → Initiates friend challenge\n');
  
  console.log('4. User says: "Find opponent"');
  const command3 = GameModeCommandProcessor.parseCommand('Find opponent');
  console.log(`   → Parsed as: ${command3.type}`);
  console.log('   → Joins random matchmaking queue\n');
  
  console.log('5. User says: "Menu"');
  const command4 = GameModeCommandProcessor.parseCommand('Menu');
  console.log(`   → Parsed as: ${command4.type}`);
  console.log('   → Shows main menu again\n');
  
  console.log('6. User says: "Help"');
  const command5 = GameModeCommandProcessor.parseCommand('Help');
  console.log(`   → Parsed as: ${command5.type}`);
  console.log('   → Shows help text\n');
}

// Test specific command patterns
function testCommandPatterns() {
  console.log('\n🔍 Testing Specific Command Patterns:\n');
  
  const patterns = [
    { input: 'play against AI', expected: 'ai_game' },
    { input: 'AI hard', expected: 'ai_game' },
    { input: 'computer medium', expected: 'ai_game' },
    { input: 'play against Alice', expected: 'friend_game' },
    { input: 'against Bob', expected: 'friend_game' },
    { input: 'find opponent', expected: 'random_match' },
    { input: 'quick match', expected: 'random_match' },
    { input: 'menu', expected: 'show_menu' },
    { input: 'help', expected: 'help' },
    { input: 'single player', expected: 'ai_game' },
    { input: 'multiplayer', expected: 'show_menu' }
  ];
  
  patterns.forEach(({ input, expected }) => {
    const result = GameModeCommandProcessor.parseCommand(input);
    const status = result.type === expected ? '✅' : '❌';
    console.log(`${status} "${input}" → ${result.type} (expected: ${expected})`);
  });
}

// Run the demo if this file is executed directly
if (require.main === module) {
  runGameModeSelectionDemo();
  testCommandPatterns();
}

export { runGameModeSelectionDemo, testCommandPatterns };
