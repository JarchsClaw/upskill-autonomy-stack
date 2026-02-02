/**
 * Singleton viem clients for efficient RPC usage.
 * Creates clients once and reuses them across all modules.
 */

import { createPublicClient, createWalletClient, http, type Chain, type Transport } from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { base } from 'viem/chains';

// RPC URL - configurable via environment
export const RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';

// Create public client immediately (no private key needed)
const publicClient = createPublicClient({
  chain: base,
  transport: http(RPC_URL, {
    retryCount: 3,
    retryDelay: 150,
  }),
});

// Lazy account - needs PRIVATE_KEY
let _account: PrivateKeyAccount | null = null;

// Lazy wallet client - needs PRIVATE_KEY
let _walletClient: ReturnType<typeof createWalletClient> | null = null;

/**
 * Get the public client for read operations.
 */
export function getPublicClient() {
  return publicClient;
}

/**
 * Get the singleton account derived from PRIVATE_KEY.
 * Validates key format on first call.
 */
export function getAccount(): PrivateKeyAccount {
  if (!_account) {
    const pk = process.env.PRIVATE_KEY;

    if (!pk) {
      throw new Error('PRIVATE_KEY environment variable is required');
    }

    if (!pk.startsWith('0x')) {
      throw new Error('PRIVATE_KEY must be 0x-prefixed');
    }

    if (pk.length !== 66) {
      throw new Error('PRIVATE_KEY must be a 64-character hex string (with 0x prefix)');
    }

    // Check for placeholder key
    if (pk === '0x' + '0'.repeat(64)) {
      throw new Error('PRIVATE_KEY appears to be a placeholder (all zeros)');
    }

    _account = privateKeyToAccount(pk as `0x${string}`);
  }
  return _account;
}

/**
 * Get the singleton wallet client for write operations.
 * Requires PRIVATE_KEY to be set.
 */
export function getWalletClient() {
  if (!_walletClient) {
    const account = getAccount();
    _walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(RPC_URL),
    });
  }
  return _walletClient;
}

/**
 * Reset all clients (useful for testing).
 */
export function resetClients(): void {
  _account = null;
  _walletClient = null;
}
