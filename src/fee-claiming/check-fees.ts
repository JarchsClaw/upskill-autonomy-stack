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
import { createPublicClient, http, formatEther } from 'viem';
import { base } from 'viem/chains';

// Clanker FeeLocker contract on Base
const FEE_LOCKER_ADDRESS = '0xF3622742b1E446D92e45E22923Ef11C2fcD55D68' as const;
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006' as const;

const FEE_LOCKER_ABI = [
  {
    inputs: [
      { name: 'feeOwner', type: 'address' },
      { name: 'token', type: 'address' },
    ],
    name: 'feesToClaim',
    outputs: [{ name: 'balance', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

interface FeeInfo {
  wallet: `0x${string}`;
  token: `0x${string}`;
  wethFees: bigint;
  wethFeesFormatted: string;
  tokenFees: bigint;
  tokenFeesFormatted: string;
  hasClaimable: boolean;
}

async function checkFees(
  walletAddress: `0x${string}`,
  tokenAddress: `0x${string}`
): Promise<FeeInfo> {
  const publicClient = createPublicClient({
    chain: base,
    transport: http('https://mainnet.base.org'),
  });

  // Check WETH fees (the valuable ones from trading)
  const wethFees = await publicClient.readContract({
    address: FEE_LOCKER_ADDRESS,
    abi: FEE_LOCKER_ABI,
    functionName: 'feesToClaim',
    args: [walletAddress, WETH_ADDRESS],
  });

  // Check native token fees
  const tokenFees = await publicClient.readContract({
    address: FEE_LOCKER_ADDRESS,
    abi: FEE_LOCKER_ABI,
    functionName: 'feesToClaim',
    args: [walletAddress, tokenAddress],
  });

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
  // Parse arguments
  const args = process.argv.slice(2);
  const walletIndex = args.indexOf('--wallet');
  const tokenIndex = args.indexOf('--token');

  const walletAddress = (walletIndex !== -1 
    ? args[walletIndex + 1] 
    : process.env.WALLET_ADDRESS) as `0x${string}`;

  const tokenAddress = (tokenIndex !== -1 
    ? args[tokenIndex + 1] 
    : process.env.TOKEN_ADDRESS) as `0x${string}`;

  if (!walletAddress || !tokenAddress) {
    console.error('Usage: npx tsx check-fees.ts --wallet 0x... --token 0x...');
    console.error('Or set WALLET_ADDRESS and TOKEN_ADDRESS env vars');
    process.exit(1);
  }

  console.log('🔍 Checking Clawnch/Clanker Trading Fees\n');
  console.log(`📍 Fee Locker: ${FEE_LOCKER_ADDRESS}`);
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

main().catch(console.error);

export { checkFees, FeeInfo, FEE_LOCKER_ADDRESS, WETH_ADDRESS };
