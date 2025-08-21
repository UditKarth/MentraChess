/**
 * Voice command processor for game mode selection
 * Handles the choice between AI and multiplayer games
 */

export interface GameModeCommand {
  type: 'ai_game' | 'friend_game' | 'random_match' | 'show_menu' | 'help' | 'accept' | 'reject' | 'cancel' | 'unknown';
  params?: {
    difficulty?: string | undefined;
    friendName?: string | undefined;
    timeControl?: string | undefined;
  };
}

export class GameModeCommandProcessor {
  private static readonly COMMANDS = {
    // AI Game commands
    AI_GAME: /^(play\s+)?(against\s+)?(ai|computer|bot)$/i,
    AI_DIFFICULTY: /^(play\s+)?(against\s+)?(ai|computer|bot)\s+(easy|medium|hard)$/i,
    
    // Friend Game commands
    FRIEND_GAME: /^(play\s+)?(against\s+)?(friend|buddy|mate)$/i,
    
    // Random Matchmaking commands
    RANDOM_MATCH: /^(find|get|search\s+for)\s+(opponent|match|game)$/i,
    RANDOM_MATCH_QUICK: /^(quick\s+)?(match|game|play)$/i,
    
    // Menu and Help commands
    SHOW_MENU: /^(menu|options|settings)$/i,
    HELP: /^(help|what\s+can\s+i\s+do|how\s+to\s+play|commands)$/i,
    
    // Alternative AI commands
    SINGLE_PLAYER: /^(single\s+)?(player|mode)$/i,
    MULTIPLAYER: /^(multi\s+)?(player|mode)$/i,
    MULTIPLAYER_EXACT: /^multiplayer$/i,
    
    // Challenge response commands
    ACCEPT: /^(accept|yes|okay|ok)$/i,
    REJECT: /^(reject|no|decline)$/i,
    CANCEL: /^(cancel|back|stop)$/i,
    
    // Friend name patterns (must come after other patterns)
    FRIEND_NAMED: /^(play\s+)?(against\s+)?([a-zA-Z]+)$/i,
  };
  
  /**
   * Parse voice command for game mode selection
   */
  static parseCommand(text: string): GameModeCommand {
    const cleanText = text.toLowerCase().trim();
    
    // Check each command pattern
    for (const [commandType, pattern] of Object.entries(this.COMMANDS)) {
      const match = cleanText.match(pattern);
      if (match) {
        return this.processMatch(commandType, match, cleanText);
      }
    }
    
    return { type: 'unknown' };
  }
  
  private static processMatch(commandType: string, match: RegExpMatchArray, originalText: string): GameModeCommand {
    switch (commandType) {
      case 'AI_GAME':
        return { type: 'ai_game' };
        
      case 'AI_DIFFICULTY':
        return { 
          type: 'ai_game',
          params: { difficulty: match[4] || undefined } // easy, medium, or hard
        };
        
      case 'FRIEND_GAME':
        return { type: 'friend_game' };
        
      case 'RANDOM_MATCH':
      case 'RANDOM_MATCH_QUICK':
        return { type: 'random_match' };
        
      case 'SHOW_MENU':
        return { type: 'show_menu' };
        
      case 'HELP':
        return { type: 'help' };
        
      case 'SINGLE_PLAYER':
        return { type: 'ai_game' };
        
      case 'MULTIPLAYER':
      case 'MULTIPLAYER_EXACT':
        return { type: 'show_menu' }; // Show multiplayer options
        
      case 'ACCEPT':
        return { type: 'accept' };
        
      case 'REJECT':
        return { type: 'reject' };
        
      case 'CANCEL':
        return { type: 'cancel' };
        
      case 'FRIEND_NAMED':
        const friendName = match[3];
        if (friendName && friendName.length >= 2) {
          return { 
            type: 'friend_game',
            params: { friendName }
          };
        }
        return { type: 'unknown' };
        
      default:
        // Handle friend names that weren't caught by specific patterns
        const extractedFriendName = this.extractFriendName(originalText);
        if (extractedFriendName) {
          return { 
            type: 'friend_game',
            params: { friendName: extractedFriendName }
          };
        }
        return { type: 'unknown' };
    }
  }
  
  private static extractFriendName(text: string): string | null {
    // Check if it starts with "play against" or similar patterns
    const playAgainstPattern = /^(play\s+)?(against\s+)?(.+)$/i;
    const match = text.match(playAgainstPattern);
    
    if (!match) {
      return null;
    }
    
    const friendName = match[3]?.trim();
    
    // Don't return empty strings or very short names
    if (!friendName || friendName.length < 2) {
      return null;
    }
    
    // Don't return if it's a common command word
    const commandWords = ['ai', 'computer', 'bot', 'friend', 'buddy', 'mate', 'opponent', 'match', 'game', 'menu', 'help', 'single', 'multi', 'player', 'mode', 'multiplayer'];
    if (commandWords.includes(friendName.toLowerCase())) {
      return null;
    }
    
    // Don't return if it contains AI-related words
    if (friendName.toLowerCase().includes('ai') || friendName.toLowerCase().includes('computer') || friendName.toLowerCase().includes('bot')) {
      return null;
    }
    
    return friendName;
  }
  
  /**
   * Get help text for available commands
   */
  static getHelpText(): string {
    return `Available Commands:
    
🎮 Game Mode Selection:
• "Play against AI" - Start AI game
• "AI easy/medium/hard" - AI with specific difficulty
• "Play against [friend name]" - Challenge specific friend
• "Find opponent" - Random matchmaking
• "Quick match" - Fast random game

📋 Navigation:
• "Menu" - Show main menu
• "Help" - Show this help

💡 Examples:
• "Play against AI hard"
• "Play against Alice"
• "Find opponent"
• "Menu"`;
  }
  
  /**
   * Get menu text for game mode selection
   */
  static getMenuText(): string {
    return `Chess Game Mode Selection:

🤖 AI Opponent:
• Say "Play against AI" for default difficulty
• Say "AI easy/medium/hard" for specific difficulty

👥 Multiplayer:
• Say "Play against [friend name]" to challenge a friend
• Say "Find opponent" for random matchmaking
• Say "Quick match" for fast pairing

📋 Other:
• Say "Help" for command list
• Say "Menu" anytime to return here`;
  }
  
  /**
   * Validate difficulty level
   */
  static isValidDifficulty(difficulty: string): boolean {
    return ['easy', 'medium', 'hard'].includes(difficulty.toLowerCase());
  }
  
  /**
   * Get default difficulty if none specified
   */
  static getDefaultDifficulty(): string {
    return 'medium';
  }
}
