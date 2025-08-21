import { WebSocketNetworkService } from '../services/WebSocketNetworkService';
import { MatchmakingServiceImpl } from '../services/MatchmakingServiceImpl';
import { PlayerColor } from '../utils/types';

/**
 * Demo script for Phase 1: Core Multiplayer Infrastructure
 * This demonstrates the basic functionality of the network service and matchmaking system
 */
async function runPhase1Demo() {
  console.log('🚀 Starting Phase 1 Demo: Core Multiplayer Infrastructure\n');
  
  // Initialize services
  const networkService = new WebSocketNetworkService(8080);
  const matchmakingService = new MatchmakingServiceImpl(networkService);
  
  try {
    // Demo 1: User Management
    console.log('📋 Demo 1: User Management');
    console.log('========================');
    
    const user1 = 'alice@example.com';
    const user2 = 'bob@example.com';
    const user3 = 'charlie@example.com';
    
    // Add users as online
    matchmakingService.addOnlineUser(user1);
    matchmakingService.addOnlineUser(user2);
    matchmakingService.addOnlineUser(user3);
    
    // Set nicknames
    await matchmakingService.setUserNickname(user1, 'Alice');
    await matchmakingService.setUserNickname(user2, 'Bob');
    await matchmakingService.setUserNickname(user3, 'Charlie');
    
    // Display online users
    const onlineUsers = await matchmakingService.getOnlineUsers();
    console.log(`Online users: ${onlineUsers.join(', ')}`);
    console.log(`Total online: ${onlineUsers.length}\n`);
    
    // Demo 2: Friend-based Matchmaking
    console.log('🎯 Demo 2: Friend-based Matchmaking');
    console.log('==================================');
    
    // Alice challenges Bob
    console.log('Alice challenges Bob to a game...');
    const challenge = await matchmakingService.sendChallenge(user1, user2);
    console.log(`Challenge created: ${challenge.id}`);
    console.log(`From: ${challenge.fromNickname} (${challenge.fromUserId})`);
    console.log(`To: ${challenge.toUserId}`);
    console.log(`Expires: ${challenge.expiresAt.toLocaleTimeString()}`);
    
    // Check pending challenges
    const bobChallenges = await matchmakingService.getPendingChallenges(user2);
    console.log(`Bob has ${bobChallenges.length} pending challenge(s)`);
    
    // Bob accepts the challenge
    console.log('\nBob accepts the challenge...');
    const accepted = await matchmakingService.acceptChallenge(challenge.id, user2);
    console.log(`Challenge accepted: ${accepted}`);
    
    // Check active games
    const aliceGames = await matchmakingService.getActiveGames(user1);
    const bobGames = await matchmakingService.getActiveGames(user2);
    console.log(`Alice active games: ${aliceGames.length}`);
    console.log(`Bob active games: ${bobGames.length}`);
    
    if (aliceGames.length > 0 && bobGames.length > 0) {
      const aliceGame = aliceGames[0];
      const bobGame = bobGames[0];
      if (aliceGame && bobGame) {
        const gameId = aliceGame.gameId;
        console.log(`Game created: ${gameId}`);
        console.log(`Alice color: ${aliceGame.playerColor}`);
        console.log(`Bob color: ${bobGame.playerColor}`);
        console.log(`Alice's turn: ${aliceGame.isMyTurn}`);
        console.log(`Bob's turn: ${bobGame.isMyTurn}\n`);
      }
    }
    
    // Demo 3: Random Matchmaking
    console.log('🎲 Demo 3: Random Matchmaking');
    console.log('============================');
    
    // Charlie joins matchmaking queue
    console.log('Charlie joins matchmaking queue...');
    await matchmakingService.joinMatchmaking(user3, {
      timeControl: 'blitz',
      allowUnrated: true
    });
    console.log(`Queue size: ${matchmakingService.getQueueSize()}`);
    
    // Add another user to match with Charlie
    const user4 = 'diana@example.com';
    matchmakingService.addOnlineUser(user4);
    await matchmakingService.setUserNickname(user4, 'Diana');
    
    console.log('Diana joins matchmaking queue...');
    await matchmakingService.joinMatchmaking(user4, {
      timeControl: 'blitz',
      allowUnrated: true
    });
    console.log(`Queue size: ${matchmakingService.getQueueSize()}`);
    
    // The matchmaking should happen automatically
    // Let's check if a game was created
    setTimeout(async () => {
      const charlieGames = await matchmakingService.getActiveGames(user3);
      const dianaGames = await matchmakingService.getActiveGames(user4);
      
      console.log(`Charlie active games: ${charlieGames.length}`);
      console.log(`Diana active games: ${dianaGames.length}`);
      console.log(`Final queue size: ${matchmakingService.getQueueSize()}\n`);
    }, 100);
    
    // Demo 4: Error Handling
    console.log('⚠️  Demo 4: Error Handling');
    console.log('==========================');
    
    // Try to challenge offline user
    try {
      await matchmakingService.sendChallenge(user1, 'offline@example.com');
    } catch (error) {
      console.log(`Expected error: ${(error as Error).message}`);
    }
    
    // Try to challenge user in game
    try {
      await matchmakingService.sendChallenge(user3, user1);
    } catch (error) {
      console.log(`Expected error: ${(error as Error).message}`);
    }
    
    // Try to accept invalid challenge
    const invalidResult = await matchmakingService.acceptChallenge('invalid-id', user1);
    console.log(`Invalid challenge acceptance: ${invalidResult}\n`);
    
    // Demo 5: Statistics
    console.log('📊 Demo 5: System Statistics');
    console.log('============================');
    
    console.log(`Active games: ${matchmakingService.getActiveGameCount()}`);
    console.log(`Pending challenges: ${matchmakingService.getPendingChallengeCount()}`);
    console.log(`Queue size: ${matchmakingService.getQueueSize()}`);
    console.log(`Online users: ${(await matchmakingService.getOnlineUsers()).length}`);
    
    // Demo 6: Network Service Features
    console.log('\n🌐 Demo 6: Network Service Features');
    console.log('===================================');
    
    // Test message queuing for offline users
    console.log('Testing message queuing for offline users...');
    await networkService.sendGameRequest('sender', 'offline-user', 'test-game');
    
    const messageQueues = (networkService as any).messageQueues;
    console.log(`Queued messages: ${messageQueues.size}`);
    
    // Test game participant management
    const testGameId = 'demo-game';
    networkService.addGameParticipant(testGameId, user1);
    networkService.addGameParticipant(testGameId, user2);
    
    const activeGames = networkService.getActiveGames();
    console.log(`Network service active games: ${activeGames.length}`);
    
    console.log('\n✅ Phase 1 Demo completed successfully!');
    console.log('\nKey Features Demonstrated:');
    console.log('• User connection management');
    console.log('• Friend-based matchmaking with challenges');
    console.log('• Random matchmaking with queue system');
    console.log('• Game creation and management');
    console.log('• Error handling and validation');
    console.log('• Network message queuing');
    console.log('• Real-time communication infrastructure');
    
  } catch (error) {
    console.error('❌ Demo failed:', error);
  } finally {
    // Cleanup
    setTimeout(async () => {
      try {
        if (matchmakingService && 'stop' in matchmakingService) {
          matchmakingService.stop();
        }
        
        if (networkService && 'stop' in networkService) {
          await networkService.stop();
        }
        
        console.log('\n🧹 Demo cleanup completed');
        process.exit(0);
      } catch (error) {
        console.error('Error during demo cleanup:', error);
        process.exit(1);
      }
    }, 1000);
  }
}

// Run the demo if this file is executed directly
if (require.main === module) {
  runPhase1Demo().catch(console.error);
}

export { runPhase1Demo };
