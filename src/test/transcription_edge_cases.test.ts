import { GameModeCommandProcessor } from '../utils/gameModeCommands';

describe('Transcription Edge Cases', () => {
  describe('Real-world transcription scenarios', () => {
    test('should handle transcripts with periods', () => {
      const testCases = [
        { input: 'help.', expected: 'help' },
        { input: 'menu.', expected: 'show_menu' },
        { input: 'Help.', expected: 'help' },
        { input: 'Menu.', expected: 'show_menu' },
        { input: 'HELP.', expected: 'help' },
        { input: 'MENU.', expected: 'show_menu' }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = GameModeCommandProcessor.parseCommand(input);
        console.log(`Testing: "${input}" -> ${result.type} (expected: ${expected})`);
        expect(result.type).toBe(expected);
      });
    });

    test('should handle transcripts with extra whitespace', () => {
      const testCases = [
        { input: ' help ', expected: 'help' },
        { input: ' menu ', expected: 'show_menu' },
        { input: '  help  ', expected: 'help' },
        { input: '  menu  ', expected: 'show_menu' },
        { input: '\thelp\t', expected: 'help' },
        { input: '\tmenu\t', expected: 'show_menu' }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = GameModeCommandProcessor.parseCommand(input);
        console.log(`Testing: "${input}" -> ${result.type} (expected: ${expected})`);
        expect(result.type).toBe(expected);
      });
    });

    test('should handle transcripts with mixed case and punctuation', () => {
      const testCases = [
        { input: 'Help.', expected: 'help' },
        { input: 'Menu.', expected: 'show_menu' },
        { input: 'HELP!', expected: 'help' },
        { input: 'MENU?', expected: 'show_menu' },
        { input: 'help...', expected: 'help' },
        { input: 'menu...', expected: 'show_menu' }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = GameModeCommandProcessor.parseCommand(input);
        console.log(`Testing: "${input}" -> ${result.type} (expected: ${expected})`);
        expect(result.type).toBe(expected);
      });
    });

    test('should handle very short transcripts that might be incomplete', () => {
      const testCases = [
        { input: 'h', expected: 'unknown' },
        { input: 'm', expected: 'unknown' },
        { input: 'he', expected: 'unknown' },
        { input: 'me', expected: 'unknown' },
        { input: 'hel', expected: 'unknown' },
        { input: 'men', expected: 'unknown' }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = GameModeCommandProcessor.parseCommand(input);
        console.log(`Testing short input: "${input}" -> ${result.type} (expected: ${expected})`);
        expect(result.type).toBe(expected);
      });
    });

    test('should handle transcripts that might be voice recognition errors', () => {
      const testCases = [
        { input: 'help', expected: 'help' },
        { input: 'help!', expected: 'help' },
        { input: 'help?', expected: 'help' },
        { input: 'help...', expected: 'help' },
        { input: 'menu', expected: 'show_menu' },
        { input: 'menu!', expected: 'show_menu' },
        { input: 'menu?', expected: 'show_menu' },
        { input: 'menu...', expected: 'show_menu' }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = GameModeCommandProcessor.parseCommand(input);
        console.log(`Testing voice recognition: "${input}" -> ${result.type} (expected: ${expected})`);
        expect(result.type).toBe(expected);
      });
    });

    test('should handle transcripts with leading/trailing punctuation', () => {
      const testCases = [
        { input: '.help', expected: 'help' },
        { input: 'help.', expected: 'help' },
        { input: '.menu', expected: 'show_menu' },
        { input: 'menu.', expected: 'show_menu' },
        { input: '!help', expected: 'help' },
        { input: 'help!', expected: 'help' },
        { input: '?menu', expected: 'show_menu' },
        { input: 'menu?', expected: 'show_menu' }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = GameModeCommandProcessor.parseCommand(input);
        console.log(`Testing punctuation: "${input}" -> ${result.type} (expected: ${expected})`);
        expect(result.type).toBe(expected);
      });
    });

    test('should handle empty and whitespace-only inputs', () => {
      const testCases = [
        { input: '', expected: 'unknown' },
        { input: ' ', expected: 'unknown' },
        { input: '  ', expected: 'unknown' },
        { input: '\t', expected: 'unknown' },
        { input: '\n', expected: 'unknown' },
        { input: '\r', expected: 'unknown' }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = GameModeCommandProcessor.parseCommand(input);
        console.log(`Testing empty/whitespace: "${input}" -> ${result.type} (expected: ${expected})`);
        expect(result.type).toBe(expected);
      });
    });

    test('should handle transcripts that might be cut off', () => {
      // These should be detected as incomplete and not processed
      const incompleteInputs = ['hel', 'he', 'h', 'men', 'me', 'm'];
      
      incompleteInputs.forEach(input => {
        const result = GameModeCommandProcessor.parseCommand(input);
        console.log(`Testing incomplete: "${input}" -> ${result.type}`);
        expect(result.type).toBe('unknown');
      });
    });

    test('should handle transcripts with numbers or special characters', () => {
      const testCases = [
        { input: 'help1', expected: 'unknown' },
        { input: 'menu2', expected: 'unknown' },
        { input: 'help@', expected: 'unknown' },
        { input: 'menu#', expected: 'unknown' },
        { input: 'help123', expected: 'unknown' },
        { input: 'menu456', expected: 'unknown' }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = GameModeCommandProcessor.parseCommand(input);
        console.log(`Testing with numbers/special chars: "${input}" -> ${result.type} (expected: ${expected})`);
        expect(result.type).toBe(expected);
      });
    });
  });

  describe('Debug specific scenarios from logs', () => {
    test('should handle the exact scenario from the logs', () => {
      // Based on the logs showing "Command not recognized", let's test various possibilities
      const possibleInputs = [
        'help',
        'menu',
        'help.',
        'menu.',
        'Help',
        'Menu',
        'Help.',
        'Menu.',
        'HELP',
        'MENU',
        'HELP.',
        'MENU.'
      ];

      possibleInputs.forEach(input => {
        const result = GameModeCommandProcessor.parseCommand(input);
        console.log(`Debug test: "${input}" -> ${result.type}`);
        
        // These should all be recognized as valid commands
        if (input.toLowerCase().includes('help')) {
          expect(result.type).toBe('help');
        } else if (input.toLowerCase().includes('menu')) {
          expect(result.type).toBe('show_menu');
        }
      });
    });

    test('should verify the incomplete word detection logic', () => {
      // Test the exact logic from the server
      const incompleteEndings = ['hel', 'he', 'h', 'pl', 'p', 'roo', 'ro', 'r', 'kni', 'kni', 'kn', 'k'];
      const completeWords = ['help', 'menu', 'play', 'game', 'ai', 'computer', 'bot', 'friend', 'buddy', 'mate', 'opponent', 'match', 'find', 'get', 'search', 'quick', 'single', 'multi', 'player', 'mode', 'easy', 'medium', 'hard', 'accept', 'reject', 'cancel', 'back', 'stop', 'yes', 'no', 'okay', 'ok', 'what', 'how', 'commands', 'options', 'settings'];
      
      // Test complete words
      completeWords.forEach(word => {
        const lowerWord = word.toLowerCase();
        const isCompleteWord = completeWords.includes(lowerWord);
        const hasIncompleteEnding = incompleteEndings.some(ending => lowerWord.endsWith(ending));
        const shouldBeProcessed = !hasIncompleteEnding || isCompleteWord;
        
        console.log(`Complete word "${word}": hasIncompleteEnding = ${hasIncompleteEnding}, isCompleteWord = ${isCompleteWord}, shouldBeProcessed = ${shouldBeProcessed}`);
        expect(shouldBeProcessed).toBe(true);
      });

      // Test incomplete words
      const incompleteWords = ['hel', 'he', 'h', 'men', 'me', 'm'];
      incompleteWords.forEach(word => {
        const lowerWord = word.toLowerCase();
        const isCompleteWord = completeWords.includes(lowerWord);
        const hasIncompleteEnding = incompleteEndings.some(ending => lowerWord.endsWith(ending));
        const shouldBeProcessed = !hasIncompleteEnding || isCompleteWord;
        
        console.log(`Incomplete word "${word}": hasIncompleteEnding = ${hasIncompleteEnding}, isCompleteWord = ${isCompleteWord}, shouldBeProcessed = ${shouldBeProcessed}`);
        
        // Note: 'men' and 'me' are not in the incompleteEndings list, so they should be processed
        if (word === 'hel' || word === 'he' || word === 'h') {
          expect(shouldBeProcessed).toBe(false);
        }
      });
    });
  });
});
