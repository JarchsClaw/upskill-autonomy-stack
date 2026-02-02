/**
 * Tests for metrics collection.
 * @module lib/metrics.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  registerMetricHandler,
  metricFeeChecked,
  metricFeeClaimed,
  metricCreditsChecked,
  metricCreditsPurchased,
  metricTaskDispatched,
  metricTaskCompleted,
  metricTaskFailed,
  metricCycleStarted,
  metricCycleCompleted,
  metricCycleFailed,
  getCounters,
  getGauges,
  getMetricsSummary,
  resetMetrics,
} from './metrics.js';

describe('metrics', () => {
  beforeEach(() => {
    resetMetrics();
  });

  describe('registerMetricHandler', () => {
    it('should call handler on metric emit', () => {
      const handler = vi.fn();
      registerMetricHandler(handler);
      
      metricCycleStarted();
      
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'cycle_started',
          timestamp: expect.any(Number),
        })
      );
    });

    it('should return unregister function', () => {
      const handler = vi.fn();
      const unregister = registerMetricHandler(handler);
      
      metricCycleStarted();
      expect(handler).toHaveBeenCalledTimes(1);
      
      unregister();
      
      metricCycleStarted();
      expect(handler).toHaveBeenCalledTimes(1); // Still 1, not called again
    });

    it('should support multiple handlers', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      
      registerMetricHandler(handler1);
      registerMetricHandler(handler2);
      
      metricCycleStarted();
      
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });

  describe('metric functions', () => {
    it('should emit fee_checked with correct labels', () => {
      const handler = vi.fn();
      registerMetricHandler(handler);
      
      metricFeeChecked(1000n, 2000n, '0xtoken');
      
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'fee_checked',
          labels: {
            weth_wei: '1000',
            token_wei: '2000',
            token: '0xtoken',
          },
        })
      );
    });

    it('should emit fee_claimed with value', () => {
      const handler = vi.fn();
      registerMetricHandler(handler);
      
      metricFeeClaimed(1000000000000000000n, '0xtoken', '0xtxhash');
      
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'fee_claimed',
          value: 1.0, // 1 ETH
          labels: { token: '0xtoken', txHash: '0xtxhash' },
        })
      );
    });

    it('should emit credits_checked with balance', () => {
      const handler = vi.fn();
      registerMetricHandler(handler);
      
      metricCreditsChecked(25.50);
      
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'credits_checked',
          value: 25.50,
        })
      );
    });

    it('should emit task events', () => {
      const handler = vi.fn();
      registerMetricHandler(handler);
      
      metricTaskDispatched('trade', 'Pro');
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'task_dispatched',
          labels: { skill: 'trade', tier: 'Pro' },
        })
      );
      
      metricTaskCompleted('trade', 150);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'task_completed',
          value: 150,
          labels: { skill: 'trade' },
        })
      );
      
      metricTaskFailed('trade', 'Connection timeout');
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'task_failed',
          labels: { skill: 'trade', error: 'Connection timeout' },
        })
      );
    });

    it('should emit cycle events', () => {
      const handler = vi.fn();
      registerMetricHandler(handler);
      
      metricCycleStarted();
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'cycle_started' })
      );
      
      metricCycleCompleted(5000, ['fees', 'credits']);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'cycle_completed',
          value: 5000,
          labels: { actions: 'fees,credits' },
        })
      );
      
      metricCycleFailed('Network error');
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'cycle_failed',
          labels: { error: 'Network error' },
        })
      );
    });
  });

  describe('counters and gauges', () => {
    it('should increment counters on each event', () => {
      metricCycleStarted();
      metricCycleStarted();
      metricCycleStarted();
      
      const counters = getCounters();
      expect(counters['cycle_started']).toBe(3);
    });

    it('should update gauges with latest value', () => {
      metricCreditsChecked(10);
      metricCreditsChecked(25);
      metricCreditsChecked(15);
      
      const gauges = getGauges();
      expect(gauges['credit_balance']).toBe(15);
    });

    it('should reset metrics', () => {
      metricCycleStarted();
      metricCreditsChecked(100);
      
      expect(getCounters()['cycle_started']).toBe(1);
      expect(getGauges()['credit_balance']).toBe(100);
      
      resetMetrics();
      
      expect(getCounters()['cycle_started']).toBeUndefined();
      expect(getGauges()['credit_balance']).toBeUndefined();
    });
  });

  describe('getMetricsSummary', () => {
    it('should return complete summary', () => {
      metricCycleStarted();
      metricCreditsChecked(50);
      
      const summary = getMetricsSummary();
      
      expect(summary).toHaveProperty('counters');
      expect(summary).toHaveProperty('gauges');
      expect(summary).toHaveProperty('uptime');
      expect(summary.counters['cycle_started']).toBe(1);
      expect(summary.gauges['credit_balance']).toBe(50);
      expect(typeof summary.uptime).toBe('number');
    });
  });
});
