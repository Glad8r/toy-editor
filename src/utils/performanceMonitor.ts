/**
 * Performance Monitor Utility
 * Helps debug app hangs and performance issues
 */

let renderCount = 0;
let effectRunCount = 0;
const effectRunLog: Array<{ component: string; effect: string; count: number; timestamp: number }> = [];

export const performanceMonitor = {
  /**
   * Track component renders
   */
  trackRender(componentName: string) {
    renderCount++;
    if (renderCount % 100 === 0) {
      console.warn(`⚠️ High render count: ${renderCount} renders detected`);
    }
    if (renderCount > 500) {
      console.error(`🚨 CRITICAL: ${renderCount} renders - possible infinite loop!`);
    }
  },

  /**
   * Track effect executions
   */
  trackEffect(componentName: string, effectName: string) {
    effectRunCount++;
    const existing = effectRunLog.find(
      e => e.component === componentName && e.effect === effectName
    );
    
    if (existing) {
      existing.count++;
      existing.timestamp = Date.now();
    } else {
      effectRunLog.push({
        component: componentName,
        effect: effectName,
        count: 1,
        timestamp: Date.now()
      });
    }

    // Warn if effect runs too frequently
    if (existing && existing.count > 50) {
      console.warn(
        `⚠️ Effect "${effectName}" in ${componentName} has run ${existing.count} times - possible loop!`
      );
    }
  },

  /**
   * Get performance stats
   */
  getStats() {
    return {
      renderCount,
      effectRunCount,
      effectRunLog: [...effectRunLog].sort((a, b) => b.count - a.count)
    };
  },

  /**
   * Reset counters
   */
  reset() {
    renderCount = 0;
    effectRunCount = 0;
    effectRunLog.length = 0;
  },

  /**
   * Log top offenders
   */
  logTopOffenders() {
    const stats = this.getStats();
    console.group('📊 Performance Monitor Stats');
    console.log('Total renders:', stats.renderCount);
    console.log('Total effect runs:', stats.effectRunCount);
    console.log('Top effect offenders:');
    stats.effectRunLog.slice(0, 10).forEach(e => {
      console.log(`  ${e.component}.${e.effect}: ${e.count} runs`);
    });
    console.groupEnd();
  }
};

/**
 * React hook to monitor component renders
 * Usage: const { trackEffect } = usePerformanceMonitor('ComponentName');
 * Then call trackEffect('effectName') at the start of each useEffect
 */
import { useEffect } from 'react';

export function usePerformanceMonitor(componentName: string) {
  useEffect(() => {
    performanceMonitor.trackRender(componentName);
  });

  return {
    trackEffect: (effectName: string) => {
      performanceMonitor.trackEffect(componentName, effectName);
    }
  };
}

// Auto-log stats every 10 seconds in development
if (import.meta.env.DEV) {
  setInterval(() => {
    const stats = performanceMonitor.getStats();
    if (stats.renderCount > 100 || stats.effectRunCount > 200) {
      performanceMonitor.logTopOffenders();
    }
  }, 10000);
}

