/**
 * check-fees.ts
 * 
 * Check accumulated trading fees from Clanker tokens.
 * Agents earn 80% of Uniswap V4 LP fees from their launched tokens.
 * 
 * Usage:
 *   npx tsx check-fees.ts --wallet 0x... --token 0x...
 *   npx tsx check-fees.ts  # Uses env vars WALLET_ADDRESS and TOKEN_ADDRESS
 */

import 'dotenv/config';
import { formatEther, type Address } from 'viem';
import {
  getPublicClient,
  FEE_LOCKER_ABI,
  FEE_LOCKER,
  WETH,
  validateAddress,
} from '../lib/index.js';

export interface FeeInfo {
  wallet: Address;
  token: Address;
  wethFees: bigint;
  wethFeesFormatted: string;
  tokenFees: bigint;
  tokenFeesFormatted: string;
  hasClaimable: boolean;
}

/**
 * Check accumulated trading fees for a wallet/token pair.
 * Uses multicall to batch both reads into a single RPC call.
 */
export async function checkFees(
  walletAddress: Address,
  tokenAddress: Address
): Promise<FeeInfo> {
  const publicClient = getPublicClient();

  // Batch both fee checks into a single RPC call
  const results = await publicClient.multicall({
    contracts: [
      {
        address: FEE_LOCKER,
        abi: FEE_LOCKER_ABI,
        functionName: 'feesToClaim',
        args: [walletAddress, WETH],
      },
      {
        address: FEE_LOCKER,
        abi: FEE_LOCKER_ABI,
        functionName: 'feesToClaim',
        args: [walletAddress, tokenAddress],
      },
    ],
  });

  const wethFees = (results[0].result as bigint) ?? 0n;
  const tokenFees = (results[1].result as bigint) ?? 0n;

  return {
    wallet: walletAddress,
    token: tokenAddress,
    wethFees,
    wethFeesFormatted: formatEther(wethFees),
    tokenFees,
    tokenFeesFormatted: formatEther(tokenFees),
    hasClaimable: wethFees > 0n || tokenFees > 0n,
  };
}

async function main() {
  // Parse arguments with validation
  const args = process.argv.slice(2);
  const walletIndex = args.indexOf('--wallet');
  const tokenIndex = args.indexOf('--token');

  const walletAddress = validateAddress(
    walletIndex !== -1 ? args[walletIndex + 1] : process.env.WALLET_ADDRESS,
    'wallet address'
  );

  const tokenAddress = validateAddress(
    tokenIndex !== -1 ? args[tokenIndex + 1] : process.env.TOKEN_ADDRESS,
    'token address'
  );

  console.log('🔍 Checking Clawnch/Clanker Trading Fees\n');
  console.log(`📍 Fee Locker: ${FEE_LOCKER}`);
  console.log(`👛 Wallet:     ${walletAddress}`);
  console.log(`🪙 Token:      ${tokenAddress}\n`);

  const feeInfo = await checkFees(walletAddress, tokenAddress);

  console.log('📊 Accumulated Fees:');
  console.log(`   WETH:  ${feeInfo.wethFeesFormatted} WETH`);
  console.log(`   Token: ${feeInfo.tokenFeesFormatted} tokens\n`);

  if (feeInfo.hasClaimable) {
    console.log('✅ You have fees to claim!');
    console.log('   Run claim-fees.ts to collect them');
    console.log(`   Or visit: https://clanker.world/clanker/${tokenAddress}/admin`);
  } else {
    console.log('ℹ️  No fees to claim yet');
    console.log('   Fees accumulate when people trade your token');
  }

  return feeInfo;
}

// Only run main if called directly (not imported)
const isMainModule = process.argv[1]?.endsWith('check-fees.ts');
if (isMainModule) {
  main().catch(console.error);
}

// Re-export for convenience (already exported from lib)
