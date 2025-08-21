/**
 * Memory monitoring utility for the chess application
 */
export class MemoryMonitor {
  private static instance: MemoryMonitor;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private readonly MEMORY_THRESHOLD_MB = 512; // 512MB warning threshold
  private readonly CRITICAL_MEMORY_MB = 1024; // 1GB critical threshold
  private readonly CHECK_INTERVAL_MS = 30 * 1000; // Check every 30 seconds

  private constructor() {}

  static getInstance(): MemoryMonitor {
    if (!MemoryMonitor.instance) {
      MemoryMonitor.instance = new MemoryMonitor();
    }
    return MemoryMonitor.instance;
  }

  /**
   * Start memory monitoring
   */
  startMonitoring(): void {
    if (this.monitoringInterval) {
      console.warn('[MemoryMonitor] Monitoring already started');
      return;
    }

    console.log('[MemoryMonitor] Starting memory monitoring...');
    
    this.monitoringInterval = setInterval(() => {
      this.checkMemoryUsage();
    }, this.CHECK_INTERVAL_MS);
  }

  /**
   * Stop memory monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      console.log('[MemoryMonitor] Memory monitoring stopped');
    }
  }

  /**
   * Check current memory usage and log warnings if needed
   */
  private checkMemoryUsage(): void {
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    const externalMB = Math.round(memUsage.external / 1024 / 1024);

    const memoryInfo = {
      heapUsed: heapUsedMB,
      heapTotal: heapTotalMB,
      external: externalMB,
      rss: Math.round(memUsage.rss / 1024 / 1024)
    };

    // Log memory usage in production only if it's high
    if (heapUsedMB > this.MEMORY_THRESHOLD_MB || process.env.NODE_ENV !== 'production') {
      console.log(`[MemoryMonitor] Memory usage: ${JSON.stringify(memoryInfo)}`);
    }

    // Critical memory warning
    if (heapUsedMB > this.CRITICAL_MEMORY_MB) {
      console.error(`[MemoryMonitor] CRITICAL: High memory usage detected: ${heapUsedMB}MB`);
      this.triggerMemoryCleanup();
    }
  }

  /**
   * Get current memory statistics
   */
  getMemoryStats(): {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
    heapUsedMB: number;
    heapTotalMB: number;
    externalMB: number;
    rssMB: number;
  } {
    const memUsage = process.memoryUsage();
    return {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
      heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
      externalMB: Math.round(memUsage.external / 1024 / 1024),
      rssMB: Math.round(memUsage.rss / 1024 / 1024)
    };
  }

  /**
   * Trigger memory cleanup actions
   */
  private triggerMemoryCleanup(): void {
    console.warn('[MemoryMonitor] Triggering memory cleanup...');
    
    // Force garbage collection if available
    if (global.gc) {
      console.log('[MemoryMonitor] Running garbage collection...');
      global.gc();
    }

    // Log memory usage after cleanup
    setTimeout(() => {
      const afterCleanup = this.getMemoryStats();
      console.log(`[MemoryMonitor] Memory after cleanup: ${afterCleanup.heapUsedMB}MB`);
    }, 1000);
  }

  /**
   * Check if memory usage is healthy
   */
  isMemoryHealthy(): boolean {
    const stats = this.getMemoryStats();
    return stats.heapUsedMB < this.MEMORY_THRESHOLD_MB;
  }

  /**
   * Get memory health status
   */
  getMemoryHealthStatus(): 'healthy' | 'warning' | 'critical' {
    const stats = this.getMemoryStats();
    
    if (stats.heapUsedMB > this.CRITICAL_MEMORY_MB) {
      return 'critical';
    } else if (stats.heapUsedMB > this.MEMORY_THRESHOLD_MB) {
      return 'warning';
    } else {
      return 'healthy';
    }
  }
}

// Export singleton instance
export const memoryMonitor = MemoryMonitor.getInstance();
