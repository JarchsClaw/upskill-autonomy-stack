/**
 * Metrics collection for monitoring.
 * Provides hooks for external monitoring systems (Prometheus, Datadog, etc.)
 * @module lib/metrics
 */

import { formatEther, formatUnits } from 'viem';

/** Metric event types */
export type MetricEvent = 
  | 'fee_checked'
  | 'fee_claimed'
  | 'credits_checked'
  | 'credits_purchased'
  | 'task_dispatched'
  | 'task_completed'
  | 'task_failed'
  | 'cycle_started'
  | 'cycle_completed'
  | 'cycle_failed'
  | 'health_check';

/** Metric data structure */
export interface MetricData {
  event: MetricEvent;
  timestamp: number;
  value?: number;
  labels?: Record<string, string | number>;
}

/** Metric handler function type */
export type MetricHandler = (metric: MetricData) => void;

// Registered metric handlers
const handlers: MetricHandler[] = [];

// In-memory counters for basic metrics
const counters: Record<string, number> = {};
const gauges: Record<string, number> = {};

/**
 * Register a metric handler.
 * Called for every metric event, allowing integration with external systems.
 * 
 * @param handler - Function to handle metric events
 * @returns Unregister function
 * 
 * @example
 * // Log all metrics
 * registerMetricHandler((m) => console.log(JSON.stringify(m)));
 * 
 * @example
 * // Send to Datadog
 * registerMetricHandler((m) => {
 *   dogstatsd.increment(`upskill.${m.event}`, m.labels);
 * });
 */
export function registerMetricHandler(handler: MetricHandler): () => void {
  handlers.push(handler);
  return () => {
    const index = handlers.indexOf(handler);
    if (index > -1) handlers.splice(index, 1);
  };
}

/**
 * Emit a metric event.
 * Calls all registered handlers with the metric data.
 */
function emit(event: MetricEvent, value?: number, labels?: Record<string, string | number>): void {
  const metric: MetricData = {
    event,
    timestamp: Date.now(),
    value,
    labels,
  };
  
  // Update internal counters
  counters[event] = (counters[event] || 0) + 1;
  
  // Call all handlers
  for (const handler of handlers) {
    try {
      handler(metric);
    } catch (e) {
      // Don't let metric handlers break the app
      console.error('Metric handler error:', e);
    }
  }
}

// ============ Pre-defined Metric Functions ============

/**
 * Record fee check event.
 */
export function metricFeeChecked(wethFees: bigint, tokenFees: bigint, token: string): void {
  emit('fee_checked', undefined, {
    weth_wei: wethFees.toString(),
    token_wei: tokenFees.toString(),
    token,
  });
}

/**
 * Record fee claimed event.
 */
export function metricFeeClaimed(amount: bigint, token: string, txHash: string): void {
  const value = parseFloat(formatEther(amount));
  gauges['last_fee_claimed'] = value;
  emit('fee_claimed', value, { token, txHash });
}

/**
 * Record credits checked event.
 */
export function metricCreditsChecked(balance: number): void {
  gauges['credit_balance'] = balance;
  emit('credits_checked', balance);
}

/**
 * Record credits purchased event.
 */
export function metricCreditsPurchased(amount: number, txHash: string): void {
  emit('credits_purchased', amount, { txHash });
}

/**
 * Record task dispatched event.
 */
export function metricTaskDispatched(skill: string, tier: string): void {
  emit('task_dispatched', undefined, { skill, tier });
}

/**
 * Record task completed event.
 */
export function metricTaskCompleted(skill: string, durationMs: number): void {
  emit('task_completed', durationMs, { skill });
}

/**
 * Record task failed event.
 */
export function metricTaskFailed(skill: string, error: string): void {
  emit('task_failed', undefined, { skill, error: error.slice(0, 100) });
}

/**
 * Record autonomy cycle started.
 */
export function metricCycleStarted(): void {
  emit('cycle_started');
}

/**
 * Record autonomy cycle completed.
 */
export function metricCycleCompleted(durationMs: number, actions: string[]): void {
  gauges['last_cycle_duration'] = durationMs;
  emit('cycle_completed', durationMs, { actions: actions.join(',') });
}

/**
 * Record autonomy cycle failed.
 */
export function metricCycleFailed(error: string): void {
  emit('cycle_failed', undefined, { error: error.slice(0, 100) });
}

// ============ Metrics API ============

/**
 * Get current counter values.
 * Useful for health checks and debugging.
 */
export function getCounters(): Record<string, number> {
  return { ...counters };
}

/**
 * Get current gauge values.
 * Useful for health checks and debugging.
 */
export function getGauges(): Record<string, number> {
  return { ...gauges };
}

/**
 * Get all metrics as a summary object.
 * Suitable for JSON health check responses.
 */
export function getMetricsSummary(): {
  counters: Record<string, number>;
  gauges: Record<string, number>;
  uptime: number;
} {
  return {
    counters: getCounters(),
    gauges: getGauges(),
    uptime: process.uptime(),
  };
}

/**
 * Reset all counters (useful for testing).
 */
export function resetMetrics(): void {
  Object.keys(counters).forEach(k => delete counters[k]);
  Object.keys(gauges).forEach(k => delete gauges[k]);
}
