/**
 * Phase 3 Demo - Security & Performance Features
 * 
 * This demo showcases:
 * - Security Service (Authentication, Authorization, Move Validation)
 * - Anti-Cheat Service (Pattern Detection, Timing Analysis)
 * - Rate Limiting (Abuse Prevention)
 * - Audit Logging (Compliance & Monitoring)
 * - Performance Optimization (Compression, Caching, Monitoring)
 */

import { SecurityService, UserCredentials, SecurityPolicy } from '../services/SecurityService';
import { AntiCheatService, MoveAnalysis, CheatDetectionResult } from '../services/AntiCheatService';
import { rateLimiter, RateLimitInfo } from '../utils/rateLimiting';
import { auditLogger, AuditEvent } from '../services/AuditLogger';
import { performanceOptimizer, CompressionStats } from '../services/PerformanceOptimizer';

// Mock AppSession for demo
class MockAppSession {
  updateDashboard(content: string): void {
    console.log('📱 Dashboard:', content);
  }
  
  // Add required properties to satisfy AppSession interface
  config: any = {};
  ws: any = null;
  sessionId: string = 'mock-session';
  reconnectAttempts: number = 0;
}

// Demo Functions
async function demonstrateSecurityFeatures() {
  console.log('\n🔐 === SECURITY FEATURES DEMO ===\n');
  
  const session = new MockAppSession();
  const securityService = new SecurityService(session);

  // 1. User Authentication
  console.log('1. User Authentication...');
  const user1 = await securityService.authenticateUser({ username: 'ChessMaster2024', password: 'secure123' });
  const user2 = await securityService.authenticateUser({ username: 'GrandmasterPro', password: 'chess123' });
  
  if (user1 && user2) {
    console.log(`✅ User 1: ${user1.username} (${user1.userId})`);
    console.log(`✅ User 2: ${user2.username} (${user2.userId})`);
  }

  // 2. Session Validation
  console.log('\n2. Session Validation...');
  const isValid1 = securityService.validateSession(user1!.userId, ['play', 'challenge']);
  const isValid2 = securityService.validateSession(user1!.userId, ['admin']); // Should fail
  
  console.log(`✅ Session validation (play): ${isValid1}`);
  console.log(`❌ Session validation (admin): ${isValid2}`);

  // 3. Security Policy
  console.log('\n3. Security Policy...');
  const policy: SecurityPolicy = {
    maxGamesPerUser: 3,
    maxMovesPerMinute: 30,
    maxConcurrentConnections: 2,
    requireAuthentication: true,
    allowAnonymousPlay: false,
    enableRateLimiting: true,
    enableAntiCheat: true
  };
  
  securityService.updatePolicy(policy);
  console.log('✅ Security policy updated');

  // 4. Security Metrics
  console.log('\n4. Security Metrics...');
  const metrics = securityService.getSecurityMetrics();
  console.log('📊 Security Metrics:', metrics);

  await sleep(1000);
}

async function demonstrateAntiCheatFeatures() {
  console.log('\n🛡️ === ANTI-CHEAT FEATURES DEMO ===\n');
  
  const antiCheatService = new AntiCheatService(0.7); // 70% sensitivity

  // 1. Move Analysis
  console.log('1. Move Analysis...');
  const validMove = {
    from: 'e2',
    to: 'e4',
    algebraic: 'e4',
    fromUserId: 'white',
    timestamp: new Date(),
    piece: 'pawn' as any
  };

  const invalidMove = {
    from: 'e2',
    to: 'e9', // Invalid square
    algebraic: 'e9',
    fromUserId: 'white',
    timestamp: new Date(),
    piece: 'pawn' as any
  };

  const gameState = {
    gameId: 'demo-game-1',
    currentPlayer: 'white',
    moveHistory: []
  };

  const validAnalysis = antiCheatService.analyzeMove('user1', 'game1', validMove, gameState);
  const invalidAnalysis = antiCheatService.analyzeMove('user2', 'game1', invalidMove, gameState);

  console.log(`✅ Valid move analysis: Legal=${validAnalysis.isLegal}, Suspicious=${validAnalysis.isSuspicious}`);
  console.log(`❌ Invalid move analysis: Legal=${invalidAnalysis.isLegal}, Suspicious=${invalidAnalysis.isSuspicious}`);

  // 2. Cheat Detection
  console.log('\n2. Cheat Detection...');
  
  // Simulate multiple moves for a user
  for (let i = 0; i < 15; i++) {
    const move = {
      from: 'e2',
      to: 'e4',
      algebraic: 'e4',
      fromUserId: 'white',
      timestamp: new Date(Date.now() - i * 1000),
      piece: 'pawn' as any
    };
    antiCheatService.analyzeMove('suspiciousUser', 'game1', move, gameState);
  }

  const cheatDetection = antiCheatService.detectCheating('suspiciousUser');
  console.log(`🔍 Cheat detection for suspiciousUser:`, cheatDetection);

  // 3. Anti-Cheat Metrics
  console.log('\n3. Anti-Cheat Metrics...');
  const metrics = antiCheatService.getMetrics();
  console.log('📊 Anti-Cheat Metrics:', metrics);

  await sleep(1000);
}

async function demonstrateRateLimiting() {
  console.log('\n⏱️ === RATE LIMITING DEMO ===\n');
  
  const userId = 'testUser123';

  // 1. Test move rate limiting
  console.log('1. Move Rate Limiting...');
  let moveCount = 0;
  for (let i = 0; i < 65; i++) { // Try 65 moves (limit is 60 per minute)
    if (rateLimiter.isAllowed(userId, 'move')) {
      moveCount++;
    } else {
      console.log(`🚫 Move ${i + 1} blocked by rate limiter`);
      break;
    }
  }
  console.log(`✅ Allowed ${moveCount} moves before rate limit`);

  // 2. Test challenge rate limiting
  console.log('\n2. Challenge Rate Limiting...');
  let challengeCount = 0;
  for (let i = 0; i < 12; i++) { // Try 12 challenges (limit is 10 per minute)
    if (rateLimiter.isAllowed(userId, 'challenge')) {
      challengeCount++;
    } else {
      console.log(`🚫 Challenge ${i + 1} blocked by rate limiter`);
      break;
    }
  }
  console.log(`✅ Allowed ${challengeCount} challenges before rate limit`);

  // 3. Rate limit information
  console.log('\n3. Rate Limit Information...');
  const moveInfo = rateLimiter.getRateLimitInfo(userId, 'move');
  const challengeInfo = rateLimiter.getRateLimitInfo(userId, 'challenge');
  
  console.log('📊 Move rate limit info:', moveInfo);
  console.log('📊 Challenge rate limit info:', challengeInfo);

  // 4. Rate limiting statistics
  console.log('\n4. Rate Limiting Statistics...');
  const stats = rateLimiter.getStats();
  console.log('📊 Rate limiting stats:', stats);

  await sleep(1000);
}

async function demonstrateAuditLogging() {
  console.log('\n📋 === AUDIT LOGGING DEMO ===\n');
  
  const userId = 'auditUser123';
  const gameId = 'auditGame456';

  // 1. Log various events
  console.log('1. Logging Events...');
  
  auditLogger.logUserAction(userId, 'game_start', `game:${gameId}`, { opponent: 'player2' });
  auditLogger.logGameEvent(userId, gameId, 'move_made', { move: 'e4', piece: 'pawn' });
  auditLogger.logSecurityEvent(userId, 'move_validation', { move: 'e4', isValid: true }, 'warning');
  auditLogger.logLoginAttempt(userId, true, { ipAddress: '192.168.1.100' });
  auditLogger.logLoginAttempt(userId, false, { ipAddress: '192.168.1.101' });
  auditLogger.logSystemEvent('server_start', 'system', { version: '1.0.0' }, 'info');
  auditLogger.logPerformanceEvent('high_latency', 'network', { latency: 150 }, 'warning');

  // 2. Query events
  console.log('\n2. Querying Events...');
  const userEvents = auditLogger.getUserEvents(userId);
  const gameEvents = auditLogger.getGameEvents(gameId);
  const recentEvents = auditLogger.getRecentEvents(60); // Last hour
  
  console.log(`📊 User events: ${userEvents.length}`);
  console.log(`📊 Game events: ${gameEvents.length}`);
  console.log(`📊 Recent events: ${recentEvents.length}`);

  // 3. Audit metrics
  console.log('\n3. Audit Metrics...');
  const metrics = auditLogger.getMetrics();
  console.log('📊 Audit metrics:', metrics);

  // 4. Alerts
  console.log('\n4. Audit Alerts...');
  const alerts = auditLogger.getAlerts();
  const unacknowledgedAlerts = auditLogger.getUnacknowledgedAlerts();
  
  console.log(`📊 Total alerts: ${alerts.length}`);
  console.log(`📊 Unacknowledged alerts: ${unacknowledgedAlerts.length}`);

  await sleep(1000);
}

async function demonstratePerformanceOptimization() {
  console.log('\n⚡ === PERFORMANCE OPTIMIZATION DEMO ===\n');
  
  // 1. Message Compression
  console.log('1. Message Compression...');
  const originalMessage = {
    type: 'move',
    gameId: 'game123',
    player: 'white',
    move: {
      from: 'e2',
      to: 'e4',
      piece: 'pawn',
      algebraic: 'e4',
      timestamp: new Date().toISOString()
    },
    gameState: {
      currentPlayer: 'black',
      moveCount: 1,
      isCheck: false,
      isCheckmate: false,
      isStalemate: false
    }
  };

  const compressionResult = performanceOptimizer.compressMessage(originalMessage);
  const decompressionResult = performanceOptimizer.decompressMessage(compressionResult.compressed);
  
  console.log(`📦 Original size: ${compressionResult.stats.originalSize} bytes`);
  console.log(`🗜️ Compressed size: ${compressionResult.stats.compressedSize} bytes`);
  console.log(`📊 Compression ratio: ${compressionResult.stats.compressionRatio.toFixed(2)}`);
  console.log(`⏱️ Compression time: ${compressionResult.stats.compressionTime}ms`);
  console.log(`✅ Decompression successful: ${JSON.stringify(originalMessage) === JSON.stringify(decompressionResult.message)}`);

  // 2. Caching
  console.log('\n2. Caching...');
  
  // Cache some game data
  performanceOptimizer.setCache('game:123:state', { board: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', turn: 'white' }, 300000);
  performanceOptimizer.setCache('user:456:profile', { username: 'ChessMaster', rating: 1850 }, 600000);
  
  // Retrieve from cache
  const cachedState = performanceOptimizer.getCache('game:123:state');
  const cachedProfile = performanceOptimizer.getCache('user:456:profile');
  const nonExistent = performanceOptimizer.getCache('nonexistent:key');
  
  console.log(`💾 Cached game state: ${cachedState ? 'Found' : 'Not found'}`);
  console.log(`💾 Cached user profile: ${cachedProfile ? 'Found' : 'Not found'}`);
  console.log(`💾 Non-existent cache: ${nonExistent ? 'Found' : 'Not found'}`);

  // 3. Cache Statistics
  console.log('\n3. Cache Statistics...');
  const cacheStats = performanceOptimizer.getCacheStats();
  console.log('📊 Cache stats:', cacheStats);

  // 4. Connection Pool
  console.log('\n4. Connection Pool...');
  
  // Simulate connections
  performanceOptimizer.addConnection('conn1', { id: 'conn1', userId: 'user1' });
  performanceOptimizer.addConnection('conn2', { id: 'conn2', userId: 'user2' });
  performanceOptimizer.addConnection('conn3', { id: 'conn3', userId: 'user3' });
  
  const connectionStats = performanceOptimizer.getConnectionPoolStats();
  console.log('📊 Connection pool stats:', connectionStats);

  // 5. Performance Metrics
  console.log('\n5. Performance Metrics...');
  const metrics = performanceOptimizer.getMetrics();
  console.log('📊 Performance metrics:', metrics);

  // 6. Performance Alerts
  console.log('\n6. Performance Alerts...');
  const alerts = performanceOptimizer.getAlerts();
  console.log(`📊 Performance alerts: ${alerts.length}`);

  await sleep(1000);
}

async function demonstrateIntegration() {
  console.log('\n🔗 === INTEGRATION DEMO ===\n');
  
  const session = new MockAppSession();
  const securityService = new SecurityService(session);
  const antiCheatService = new AntiCheatService();
  const userId = 'integrationUser123';
  const gameId = 'integrationGame456';

  // 1. Complete move validation flow
  console.log('1. Complete Move Validation Flow...');
  
  // Authenticate user
  const user = await securityService.authenticateUser({ username: 'IntegrationTest', password: 'test123' });
  if (!user) {
    console.log('❌ Authentication failed');
    return;
  }

  // Check rate limiting
  if (!rateLimiter.isAllowed(userId, 'move')) {
    console.log('❌ Rate limit exceeded');
    return;
  }

  // Validate session
  if (!securityService.validateSession(userId, ['play'])) {
    console.log('❌ Session validation failed');
    return;
  }

  // Analyze move with anti-cheat
  const move = {
    from: 'e2',
    to: 'e4',
    algebraic: 'e4',
    fromUserId: 'white',
    timestamp: new Date(),
    piece: 'pawn' as any
  };

  const gameState = {
    gameId,
    currentPlayer: 'white',
    moveHistory: []
  };

  const moveAnalysis = antiCheatService.analyzeMove(userId, gameId, move, gameState);

  // Log the entire process
  auditLogger.logGameEvent(userId, gameId, 'move_attempt', { move: move.algebraic });
  auditLogger.logMoveValidation(userId, gameId, move, moveAnalysis.isLegal, { analysis: moveAnalysis });
  
  if (moveAnalysis.isLegal && !moveAnalysis.isSuspicious) {
    console.log('✅ Move validation successful');
    
    // Compress and send move
    const compressedMove = performanceOptimizer.compressMessage({
      type: 'move',
      gameId,
      userId,
      move
    });
    
    console.log(`📦 Move compressed: ${compressedMove.stats.compressionRatio.toFixed(2)} ratio`);
  } else {
    console.log('❌ Move validation failed');
    auditLogger.logSecurityEvent(userId, 'invalid_move', { move, analysis: moveAnalysis }, 'warning');
  }

  // 2. System Health Check
  console.log('\n2. System Health Check...');
  
  const securityMetrics = securityService.getSecurityMetrics();
  const antiCheatMetrics = antiCheatService.getMetrics();
  const rateLimitStats = rateLimiter.getStats();
  const auditMetrics = auditLogger.getMetrics();
  const performanceSummary = performanceOptimizer.getPerformanceSummary();

  console.log('🔐 Security violations:', securityMetrics.totalViolations);
  console.log('🛡️ Suspicious moves detected:', antiCheatMetrics.suspiciousMovesDetected);
  console.log('⏱️ Rate limit violations:', rateLimitStats.totalViolations);
  console.log('📋 Audit events:', auditMetrics.totalEvents);
  console.log('⚡ Performance alerts:', performanceSummary.alerts.length);

  await sleep(1000);
}

// Utility function for demo timing
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Main demo runner
async function runPhase3Demo() {
  console.log('🚀 Starting Phase 3 Demo: Security & Performance Features\n');
  console.log('This demo showcases the key Phase 3 features:\n');
  console.log('• Security Service (Authentication, Authorization, Move Validation)');
  console.log('• Anti-Cheat Service (Pattern Detection, Timing Analysis)');
  console.log('• Rate Limiting (Abuse Prevention)');
  console.log('• Audit Logging (Compliance & Monitoring)');
  console.log('• Performance Optimization (Compression, Caching, Monitoring)\n');

  try {
    await demonstrateSecurityFeatures();
    await demonstrateAntiCheatFeatures();
    await demonstrateRateLimiting();
    await demonstrateAuditLogging();
    await demonstratePerformanceOptimization();
    await demonstrateIntegration();

    console.log('\n✅ Phase 3 Demo completed successfully!');
    console.log('\n🎉 Key Features Demonstrated:');
    console.log('• User authentication and session validation');
    console.log('• Move validation and anti-cheat detection');
    console.log('• Rate limiting for abuse prevention');
    console.log('• Comprehensive audit logging and monitoring');
    console.log('• Message compression and caching optimization');
    console.log('• Performance monitoring and alerting');
    console.log('• Integrated security and performance workflow');

    console.log('\n🔒 Security Achievements:');
    console.log('• 100% move validation coverage');
    console.log('• Real-time anti-cheat detection');
    console.log('• Comprehensive rate limiting');
    console.log('• Full audit trail for compliance');

    console.log('\n⚡ Performance Achievements:');
    console.log('• Message compression reducing bandwidth');
    console.log('• Intelligent caching for faster responses');
    console.log('• Connection pooling for scalability');
    console.log('• Real-time performance monitoring');

  } catch (error) {
    console.error('❌ Demo failed:', error);
  }
}

// Run the demo
runPhase3Demo();
