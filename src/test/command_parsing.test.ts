import { GameModeCommandProcessor } from '../utils/gameModeCommands';

describe('Command Parsing Tests', () => {
  describe('Help and Menu Commands', () => {
    test('should parse "help" command correctly', () => {
      const result = GameModeCommandProcessor.parseCommand('help');
      expect(result.type).toBe('help');
    });

    test('should parse "Help" command correctly (case insensitive)', () => {
      const result = GameModeCommandProcessor.parseCommand('Help');
      expect(result.type).toBe('help');
    });

    test('should parse "HELP" command correctly (uppercase)', () => {
      const result = GameModeCommandProcessor.parseCommand('HELP');
      expect(result.type).toBe('help');
    });

    test('should parse "menu" command correctly', () => {
      const result = GameModeCommandProcessor.parseCommand('menu');
      expect(result.type).toBe('show_menu');
    });

    test('should parse "Menu" command correctly (case insensitive)', () => {
      const result = GameModeCommandProcessor.parseCommand('Menu');
      expect(result.type).toBe('show_menu');
    });

    test('should parse "MENU" command correctly (uppercase)', () => {
      const result = GameModeCommandProcessor.parseCommand('MENU');
      expect(result.type).toBe('show_menu');
    });

    test('should parse "what can i do" as help command', () => {
      const result = GameModeCommandProcessor.parseCommand('what can i do');
      expect(result.type).toBe('help');
    });

    test('should parse "how to play" as help command', () => {
      const result = GameModeCommandProcessor.parseCommand('how to play');
      expect(result.type).toBe('help');
    });

    test('should parse "commands" as help command', () => {
      const result = GameModeCommandProcessor.parseCommand('commands');
      expect(result.type).toBe('help');
    });

    test('should parse "options" as menu command', () => {
      const result = GameModeCommandProcessor.parseCommand('options');
      expect(result.type).toBe('show_menu');
    });

    test('should parse "settings" as menu command', () => {
      const result = GameModeCommandProcessor.parseCommand('settings');
      expect(result.type).toBe('show_menu');
    });
  });

  describe('Command Order Priority', () => {
    test('should prioritize help over friend name', () => {
      const result = GameModeCommandProcessor.parseCommand('help');
      expect(result.type).toBe('help');
      expect(result.params).toBeUndefined();
    });

    test('should prioritize menu over friend name', () => {
      const result = GameModeCommandProcessor.parseCommand('menu');
      expect(result.type).toBe('show_menu');
      expect(result.params).toBeUndefined();
    });

    test('should not treat help as a friend name', () => {
      const result = GameModeCommandProcessor.parseCommand('play against help');
      expect(result.type).toBe('help');
      expect(result.params).toBeUndefined();
    });

    test('should not treat menu as a friend name', () => {
      const result = GameModeCommandProcessor.parseCommand('play against menu');
      expect(result.type).toBe('show_menu');
      expect(result.params).toBeUndefined();
    });
  });

  describe('Friend Name Validation', () => {
    test('should reject help as a friend name', () => {
      const result = GameModeCommandProcessor.parseCommand('play against help');
      expect(result.type).toBe('help');
    });

    test('should reject menu as a friend name', () => {
      const result = GameModeCommandProcessor.parseCommand('play against menu');
      expect(result.type).toBe('show_menu');
    });

    test('should accept valid friend names', () => {
      const result = GameModeCommandProcessor.parseCommand('play against Alice');
      expect(result.type).toBe('friend_game');
      expect(result.params?.friendName).toBe('Alice');
    });
  });
});
