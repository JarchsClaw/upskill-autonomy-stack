/**
 * Price utilities using Chainlink oracles.
 * Provides reliable on-chain price data for transaction calculations.
 * @module lib/price
 */

import { parseEther, formatUnits } from 'viem';
import { getPublicClient } from './clients.js';
import { CHAINLINK_PRICE_FEED_ABI } from './abis.js';
import { CHAINLINK_ETH_USD } from './addresses.js';

/** Price data from Chainlink oracle */
export interface PriceData {
  /** Price in USD (e.g., 2500.00) */
  price: number;
  /** Timestamp of the price update (Unix seconds) */
  updatedAt: number;
  /** Round ID from Chainlink */
  roundId: bigint;
}

/** Cached price data */
let cachedPrice: PriceData | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 60_000; // 1 minute cache

/**
 * Get the current ETH/USD price from Chainlink oracle.
 * Results are cached for 1 minute to reduce RPC calls.
 * 
 * @returns Current ETH price in USD
 * @throws Error if oracle returns stale data (>1 hour old)
 * 
 * @example
 * const ethPrice = await getEthPriceUsd();
 * console.log(`ETH is $${ethPrice.price}`);
 */
export async function getEthPriceUsd(): Promise<PriceData> {
  const now = Date.now();
  
  // Return cached value if still fresh
  if (cachedPrice && (now - lastFetchTime) < CACHE_TTL_MS) {
    return cachedPrice;
  }
  
  const publicClient = getPublicClient();
  
  const [roundData, decimals] = await publicClient.multicall({
    contracts: [
      {
        address: CHAINLINK_ETH_USD,
        abi: CHAINLINK_PRICE_FEED_ABI,
        functionName: 'latestRoundData',
      },
      {
        address: CHAINLINK_ETH_USD,
        abi: CHAINLINK_PRICE_FEED_ABI,
        functionName: 'decimals',
      },
    ],
  });
  
  if (roundData.status !== 'success' || decimals.status !== 'success') {
    throw new Error('Failed to fetch ETH price from Chainlink oracle');
  }
  
  const [roundId, answer, , updatedAt] = roundData.result;
  const decimalValue = decimals.result;
  
  // Validate data freshness (must be updated within last hour)
  const updatedAtMs = Number(updatedAt) * 1000;
  const ageMs = Date.now() - updatedAtMs;
  const maxAgeMs = 60 * 60 * 1000; // 1 hour
  
  if (ageMs > maxAgeMs) {
    throw new Error(`Chainlink price is stale: last updated ${Math.round(ageMs / 60000)} minutes ago`);
  }
  
  // Convert price to number (8 decimals for Chainlink ETH/USD)
  const price = Number(formatUnits(answer, decimalValue));
  
  cachedPrice = {
    price,
    updatedAt: Number(updatedAt),
    roundId,
  };
  lastFetchTime = now;
  
  return cachedPrice;
}

/**
 * Calculate ETH required for a USD amount (with buffer).
 * Uses live Chainlink price data instead of hardcoded estimates.
 * 
 * @param usdAmount - Amount in USD to convert
 * @param bufferPercent - Safety buffer percentage (default: 20%)
 * @returns ETH amount in wei (bigint)
 * 
 * @example
 * const ethNeeded = await calculateEthForUsd(10); // $10 worth of ETH
 * console.log(`Need ${formatEther(ethNeeded)} ETH`);
 */
export async function calculateEthForUsd(
  usdAmount: number,
  bufferPercent: number = 20
): Promise<bigint> {
  const { price } = await getEthPriceUsd();
  
  // Calculate ETH needed with buffer
  const ethNeeded = (usdAmount * (1 + bufferPercent / 100)) / price;
  
  // Convert to wei with 6 decimal precision
  return parseEther(ethNeeded.toFixed(6));
}

/**
 * Convert ETH amount to USD value.
 * 
 * @param ethAmount - Amount in wei
 * @returns USD value as number
 */
export async function ethToUsd(ethAmount: bigint): Promise<number> {
  const { price } = await getEthPriceUsd();
  const ethValue = Number(formatUnits(ethAmount, 18));
  return ethValue * price;
}

/**
 * Clear the price cache. Useful for testing.
 */
export function clearPriceCache(): void {
  cachedPrice = null;
  lastFetchTime = 0;
}
