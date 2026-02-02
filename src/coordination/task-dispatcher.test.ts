/**
 * Tests for task-dispatcher tier calculation.
 * @module coordination/task-dispatcher.test
 */

import { describe, it, expect } from 'vitest';
import { parseUnits } from 'viem';
import { TIER_THRESHOLDS, getTierForBalance } from './task-dispatcher.js';

describe('TIER_THRESHOLDS', () => {
  it('should have 4 tiers', () => {
    expect(TIER_THRESHOLDS).toHaveLength(4);
  });

  it('should be sorted by threshold descending', () => {
    for (let i = 0; i < TIER_THRESHOLDS.length - 1; i++) {
      expect(TIER_THRESHOLDS[i].threshold).toBeGreaterThan(TIER_THRESHOLDS[i + 1].threshold);
    }
  });

  it('should have Free tier with 0 threshold', () => {
    const freeTier = TIER_THRESHOLDS.find(t => t.name === 'Free');
    expect(freeTier).toBeDefined();
    expect(freeTier!.threshold).toBe(0n);
  });

  it('should have correct quota values', () => {
    const tiers = Object.fromEntries(TIER_THRESHOLDS.map(t => [t.name, t.quota]));
    expect(tiers['Free']).toBe(10);
    expect(tiers['Basic (10K)']).toBe(100);
    expect(tiers['Pro (100K)']).toBe(1000);
    expect(tiers['Unlimited (1M)']).toBe(Infinity);
  });
});

describe('getTierForBalance', () => {
  it('should return Free tier for 0 balance', () => {
    const tier = getTierForBalance(0n);
    expect(tier.name).toBe('Free');
    expect(tier.quota).toBe(10);
  });

  it('should return Free tier for balance under 10K', () => {
    const balance = parseUnits('9999', 18);
    const tier = getTierForBalance(balance);
    expect(tier.name).toBe('Free');
  });

  it('should return Basic tier for 10K tokens', () => {
    const balance = parseUnits('10000', 18);
    const tier = getTierForBalance(balance);
    expect(tier.name).toBe('Basic (10K)');
    expect(tier.quota).toBe(100);
  });

  it('should return Basic tier for 50K tokens', () => {
    const balance = parseUnits('50000', 18);
    const tier = getTierForBalance(balance);
    expect(tier.name).toBe('Basic (10K)');
  });

  it('should return Pro tier for 100K tokens', () => {
    const balance = parseUnits('100000', 18);
    const tier = getTierForBalance(balance);
    expect(tier.name).toBe('Pro (100K)');
    expect(tier.quota).toBe(1000);
  });

  it('should return Pro tier for 500K tokens', () => {
    const balance = parseUnits('500000', 18);
    const tier = getTierForBalance(balance);
    expect(tier.name).toBe('Pro (100K)');
  });

  it('should return Unlimited tier for 1M tokens', () => {
    const balance = parseUnits('1000000', 18);
    const tier = getTierForBalance(balance);
    expect(tier.name).toBe('Unlimited (1M)');
    expect(tier.quota).toBe(Infinity);
  });

  it('should return Unlimited tier for 10M tokens', () => {
    const balance = parseUnits('10000000', 18);
    const tier = getTierForBalance(balance);
    expect(tier.name).toBe('Unlimited (1M)');
  });

  it('should handle exact threshold boundaries', () => {
    // Just below 10K
    expect(getTierForBalance(parseUnits('9999.999999999999999999', 18)).name).toBe('Free');
    // Exactly 10K
    expect(getTierForBalance(parseUnits('10000', 18)).name).toBe('Basic (10K)');
  });
});
