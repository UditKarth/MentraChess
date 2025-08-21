/**
 * PerformanceOptimizer - Advanced performance optimization and monitoring
 * 
 * Features:
 * - Message compression and optimization
 * - Connection pooling and reuse
 * - Caching strategies
 * - Performance monitoring and alerts
 * - Load balancing support
 */

export interface PerformanceMetrics {
  messageLatency: number;
  compressionRatio: number;
  cacheHitRate: number;
  connectionUtilization: number;
  memoryUsage: number;
  cpuUsage: number;
  activeConnections: number;
  messagesPerSecond: number;
}

export interface CacheEntry<T> {
  key: string;
  value: T;
  timestamp: Date;
  ttl: number; // Time to live in milliseconds
  accessCount: number;
  lastAccessed: Date;
}

export interface CompressionStats {
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  compressionTime: number;
  decompressionTime: number;
}

export interface PerformanceAlert {
  id: string;
  timestamp: Date;
  type: 'latency' | 'memory' | 'cpu' | 'connection' | 'cache';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  metrics: Partial<PerformanceMetrics>;
  threshold: number;
  current: number;
}

export class PerformanceOptimizer {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private connectionPool: Map<string, any> = new Map();
  private metrics: PerformanceMetrics;
  private alerts: PerformanceAlert[] = [];
  private isEnabled: boolean = true;
  private compressionEnabled: boolean = true;
  private cachingEnabled: boolean = true;
  private monitoringEnabled: boolean = true;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;

  // Performance thresholds
  private thresholds = {
    maxLatency: 100, // ms
    maxMemoryUsage: 0.8, // 80%
    maxCpuUsage: 0.7, // 70%
    maxConnections: 1000,
    minCacheHitRate: 0.7, // 70%
    maxCompressionTime: 10 // ms
  };

  constructor() {
    this.metrics = {
      messageLatency: 0,
      compressionRatio: 1.0,
      cacheHitRate: 0,
      connectionUtilization: 0,
      memoryUsage: 0,
      cpuUsage: 0,
      activeConnections: 0,
      messagesPerSecond: 0
    };

    // Start monitoring
    this.startMonitoring();
  }

  /**
   * Compress a message for transmission
   */
  compressMessage(message: any): { compressed: string; stats: CompressionStats } {
    if (!this.compressionEnabled) {
      return {
        compressed: JSON.stringify(message),
        stats: {
          originalSize: JSON.stringify(message).length,
          compressedSize: JSON.stringify(message).length,
          compressionRatio: 1.0,
          compressionTime: 0,
          decompressionTime: 0
        }
      };
    }

    const startTime = Date.now();
    const original = JSON.stringify(message);
    const originalSize = original.length;

    // Simple compression for demo - in production, use gzip or similar
    let compressed = original;
    
    // Remove unnecessary whitespace
    compressed = compressed.replace(/\s+/g, ' ');
    
    // Basic dictionary compression for common chess terms
    const chessTerms: Record<string, string> = {
      'white': 'w',
      'black': 'b',
      'king': 'k',
      'queen': 'q',
      'rook': 'r',
      'bishop': 'b',
      'knight': 'n',
      'pawn': 'p',
      'check': 'c',
      'checkmate': 'm',
      'stalemate': 's'
    };

    Object.entries(chessTerms).forEach(([term, code]) => {
      const regex = new RegExp(`"${term}"`, 'g');
      compressed = compressed.replace(regex, `"${code}"`);
    });

    const compressedSize = compressed.length;
    const compressionTime = Date.now() - startTime;
    const compressionRatio = originalSize > 0 ? compressedSize / originalSize : 1.0;

    // Update metrics
    this.updateCompressionMetrics(compressionRatio, compressionTime);

    return {
      compressed,
      stats: {
        originalSize,
        compressedSize,
        compressionRatio,
        compressionTime,
        decompressionTime: 0
      }
    };
  }

  /**
   * Decompress a message
   */
  decompressMessage(compressed: string): { message: any; stats: CompressionStats } {
    const startTime = Date.now();
    
    // Reverse the compression process
    let decompressed = compressed;
    
    // Restore chess terms
    const chessTerms: Record<string, string> = {
      'w': 'white',
      'b': 'black',
      'k': 'king',
      'q': 'queen',
      'r': 'rook',
      'b': 'bishop',
      'n': 'knight',
      'p': 'pawn',
      'c': 'check',
      'm': 'checkmate',
      's': 'stalemate'
    };

    Object.entries(chessTerms).forEach(([code, term]) => {
      const regex = new RegExp(`"${code}"`, 'g');
      decompressed = decompressed.replace(regex, `"${term}"`);
    });

    const message = JSON.parse(decompressed);
    const decompressionTime = Date.now() - startTime;

    return {
      message,
      stats: {
        originalSize: compressed.length,
        compressedSize: compressed.length,
        compressionRatio: 1.0,
        compressionTime: 0,
        decompressionTime
      }
    };
  }

  /**
   * Cache a value with TTL
   */
  setCache<T>(key: string, value: T, ttl: number = 300000): void { // Default 5 minutes
    if (!this.cachingEnabled) return;

    const entry: CacheEntry<T> = {
      key,
      value,
      timestamp: new Date(),
      ttl,
      accessCount: 0,
      lastAccessed: new Date()
    };

    this.cache.set(key, entry);
    this.cleanupExpiredCache();
  }

  /**
   * Get a value from cache
   */
  getCache<T>(key: string): T | null {
    if (!this.cachingEnabled) return null;

    const entry = this.cache.get(key) as CacheEntry<T>;
    if (!entry) return null;

    // Check if expired
    const now = Date.now();
    if (now - entry.timestamp.getTime() > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    // Update access stats
    entry.accessCount++;
    entry.lastAccessed = new Date();

    return entry.value;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    totalEntries: number;
    hitRate: number;
    averageAccessCount: number;
    memoryUsage: number;
  } {
    if (!this.cachingEnabled) {
      return {
        totalEntries: 0,
        hitRate: 0,
        averageAccessCount: 0,
        memoryUsage: 0
      };
    }

    const entries = Array.from(this.cache.values());
    const totalEntries = entries.length;
    const totalAccessCount = entries.reduce((sum, entry) => sum + entry.accessCount, 0);
    const averageAccessCount = totalEntries > 0 ? totalAccessCount / totalEntries : 0;

    // Estimate memory usage (simplified)
    const memoryUsage = totalEntries * 1024; // Rough estimate: 1KB per entry

    return {
      totalEntries,
      hitRate: this.metrics.cacheHitRate,
      averageAccessCount,
      memoryUsage
    };
  }

  /**
   * Manage connection pool
   */
  getConnection(connectionId: string): any {
    return this.connectionPool.get(connectionId);
  }

  /**
   * Add connection to pool
   */
  addConnection(connectionId: string, connection: any): void {
    this.connectionPool.set(connectionId, connection);
    this.updateConnectionMetrics();
  }

  /**
   * Remove connection from pool
   */
  removeConnection(connectionId: string): void {
    this.connectionPool.delete(connectionId);
    this.updateConnectionMetrics();
  }

  /**
   * Get connection pool statistics
   */
  getConnectionPoolStats(): {
    activeConnections: number;
    utilization: number;
    maxConnections: number;
  } {
    return {
      activeConnections: this.connectionPool.size,
      utilization: this.metrics.connectionUtilization,
      maxConnections: this.thresholds.maxConnections
    };
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Update performance metrics
   */
  updateMetrics(newMetrics: Partial<PerformanceMetrics>): void {
    this.metrics = { ...this.metrics, ...newMetrics };
    this.checkPerformanceThresholds();
  }

  /**
   * Get performance alerts
   */
  getAlerts(): PerformanceAlert[] {
    return [...this.alerts];
  }

  /**
   * Get unacknowledged alerts
   */
  getUnacknowledgedAlerts(): PerformanceAlert[] {
    return this.alerts.filter(a => !a.acknowledged);
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string): void {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      alert.acknowledgedAt = new Date();
    }
  }

  /**
   * Set performance thresholds
   */
  setThresholds(thresholds: Partial<typeof this.thresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
    console.log('⚡ Performance thresholds updated');
  }

  /**
   * Enable or disable performance optimization features
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    console.log(`⚡ Performance optimization ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Enable or disable compression
   */
  setCompressionEnabled(enabled: boolean): void {
    this.compressionEnabled = enabled;
    console.log(`🗜️ Compression ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Enable or disable caching
   */
  setCachingEnabled(enabled: boolean): void {
    this.cachingEnabled = enabled;
    console.log(`💾 Caching ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Enable or disable monitoring
   */
  setMonitoringEnabled(enabled: boolean): void {
    this.monitoringEnabled = enabled;
    console.log(`📊 Monitoring ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupExpiredCache(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    this.cache.forEach((entry, key) => {
      if (now - entry.timestamp.getTime() > entry.ttl) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => this.cache.delete(key));
  }

  /**
   * Update compression metrics
   */
  private updateCompressionMetrics(ratio: number, time: number): void {
    // Update rolling average
    this.metrics.compressionRatio = (this.metrics.compressionRatio * 0.9) + (ratio * 0.1);
  }

  /**
   * Update connection metrics
   */
  private updateConnectionMetrics(): void {
    this.metrics.activeConnections = this.connectionPool.size;
    this.metrics.connectionUtilization = this.connectionPool.size / this.thresholds.maxConnections;
  }

  /**
   * Check performance thresholds and create alerts
   */
  private checkPerformanceThresholds(): void {
    if (!this.monitoringEnabled) return;

    // Check latency
    if (this.metrics.messageLatency > this.thresholds.maxLatency) {
      this.createAlert('latency', 'high', 
        `High message latency: ${this.metrics.messageLatency}ms`,
        { messageLatency: this.metrics.messageLatency },
        this.thresholds.maxLatency,
        this.metrics.messageLatency
      );
    }

    // Check memory usage
    if (this.metrics.memoryUsage > this.thresholds.maxMemoryUsage) {
      this.createAlert('memory', 'critical',
        `High memory usage: ${(this.metrics.memoryUsage * 100).toFixed(1)}%`,
        { memoryUsage: this.metrics.memoryUsage },
        this.thresholds.maxMemoryUsage,
        this.metrics.memoryUsage
      );
    }

    // Check CPU usage
    if (this.metrics.cpuUsage > this.thresholds.maxCpuUsage) {
      this.createAlert('cpu', 'high',
        `High CPU usage: ${(this.metrics.cpuUsage * 100).toFixed(1)}%`,
        { cpuUsage: this.metrics.cpuUsage },
        this.thresholds.maxCpuUsage,
        this.metrics.cpuUsage
      );
    }

    // Check connections
    if (this.metrics.activeConnections > this.thresholds.maxConnections) {
      this.createAlert('connection', 'critical',
        `Too many active connections: ${this.metrics.activeConnections}`,
        { activeConnections: this.metrics.activeConnections },
        this.thresholds.maxConnections,
        this.metrics.activeConnections
      );
    }

    // Check cache hit rate
    if (this.metrics.cacheHitRate < this.thresholds.minCacheHitRate) {
      this.createAlert('cache', 'medium',
        `Low cache hit rate: ${(this.metrics.cacheHitRate * 100).toFixed(1)}%`,
        { cacheHitRate: this.metrics.cacheHitRate },
        this.thresholds.minCacheHitRate,
        this.metrics.cacheHitRate
      );
    }
  }

  /**
   * Create a performance alert
   */
  private createAlert(
    type: string, 
    severity: string, 
    message: string, 
    metrics: Partial<PerformanceMetrics>,
    threshold: number,
    current: number
  ): void {
    const alert: PerformanceAlert = {
      id: `perf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      type: type as any,
      severity: severity as any,
      message,
      metrics,
      threshold,
      current
    };

    this.alerts.push(alert);
    console.log(`🚨 PERFORMANCE ALERT [${severity.toUpperCase()}] ${message}`);
  }

  /**
   * Start performance monitoring
   */
  startMonitoring(): void {
    if (!this.monitoringEnabled) return;

    // Clear existing intervals if any
    this.stopMonitoring();

    // Simulate performance monitoring
    this.monitoringInterval = setInterval(() => {
      // Simulate system metrics
      this.metrics.memoryUsage = Math.random() * 0.5 + 0.3; // 30-80%
      this.metrics.cpuUsage = Math.random() * 0.4 + 0.2; // 20-60%
      this.metrics.messagesPerSecond = Math.random() * 100 + 50; // 50-150 msg/s
      this.metrics.messageLatency = Math.random() * 50 + 20; // 20-70ms

      this.checkPerformanceThresholds();
    }, 5000); // Check every 5 seconds

    // Cleanup cache periodically
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredCache();
    }, 60000); // Every minute
  }

  /**
   * Stop monitoring and clear intervals
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary(): {
    metrics: PerformanceMetrics;
    cacheStats: ReturnType<typeof this.getCacheStats>;
    connectionStats: ReturnType<typeof this.getConnectionPoolStats>;
    alerts: PerformanceAlert[];
  } {
    return {
      metrics: this.getMetrics(),
      cacheStats: this.getCacheStats(),
      connectionStats: this.getConnectionPoolStats(),
      alerts: this.getAlerts()
    };
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    this.stopMonitoring();
    this.cache.clear();
    this.connectionPool.clear();
    this.alerts = this.alerts.filter(a => a.timestamp.getTime() > Date.now() - 24 * 60 * 60 * 1000);
    console.log('🧹 Performance optimizer cleanup completed');
  }
}

// Export a singleton instance for global use
export const performanceOptimizer = new PerformanceOptimizer();
