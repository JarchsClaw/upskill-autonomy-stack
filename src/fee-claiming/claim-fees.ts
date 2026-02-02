/**
 * claim-fees.ts
 * 
 * Claim accumulated trading fees from Clanker tokens.
 * Part of the agent autonomy loop - converting trading activity into funds.
 * 
 * Usage:
 *   PRIVATE_KEY=0x... npx tsx claim-fees.ts --token 0x...
 *   
 *   # Claim both WETH and token fees
 *   npx tsx claim-fees.ts --token 0x... --claim-both
 *   
 *   # Dry run (check what would be claimed)
 *   npx tsx claim-fees.ts --token 0x... --dry-run
 */

import 'dotenv/config';
import { createPublicClient, createWalletClient, http, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { checkFees, FEE_LOCKER_ADDRESS, WETH_ADDRESS } from './check-fees';

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
  {
    inputs: [
      { name: 'feeOwner', type: 'address' },
      { name: 'token', type: 'address' },
    ],
    name: 'claim',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

interface ClaimResult {
  tokenAddress: `0x${string}`;
  wethClaimed: bigint;
  tokenClaimed: bigint;
  wethTxHash?: string;
  tokenTxHash?: string;
}

async function claimFees(
  tokenAddress: `0x${string}`,
  options: {
    claimBoth?: boolean;
    dryRun?: boolean;
  } = {}
): Promise<ClaimResult> {
  const { claimBoth = false, dryRun = false } = options;

  const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
  
  const publicClient = createPublicClient({
    chain: base,
    transport: http('https://mainnet.base.org'),
  });

  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http('https://mainnet.base.org'),
  });

  console.log('💰 Clanker Fee Claimer\n');
  console.log(`🔐 Wallet: ${account.address}`);
  console.log(`🪙 Token:  ${tokenAddress}\n`);

  // Check current fees
  const feeInfo = await checkFees(account.address, tokenAddress);
  
  console.log('📊 Fees Available:');
  console.log(`   WETH:  ${feeInfo.wethFeesFormatted} WETH`);
  console.log(`   Token: ${feeInfo.tokenFeesFormatted} tokens\n`);

  const result: ClaimResult = {
    tokenAddress,
    wethClaimed: 0n,
    tokenClaimed: 0n,
  };

  if (!feeInfo.hasClaimable) {
    console.log('ℹ️  No fees to claim');
    return result;
  }

  if (dryRun) {
    console.log('🔍 DRY RUN - Would claim:');
    if (feeInfo.wethFees > 0n) {
      console.log(`   ✓ ${feeInfo.wethFeesFormatted} WETH`);
    }
    if (claimBoth && feeInfo.tokenFees > 0n) {
      console.log(`   ✓ ${feeInfo.tokenFeesFormatted} tokens`);
    }
    return result;
  }

  // Claim WETH fees (always claim these - they're valuable)
  if (feeInfo.wethFees > 0n) {
    console.log('📤 Claiming WETH fees...');
    
    const { request } = await publicClient.simulateContract({
      address: FEE_LOCKER_ADDRESS,
      abi: FEE_LOCKER_ABI,
      functionName: 'claim',
      args: [account.address, WETH_ADDRESS],
      account,
    });

    const txHash = await walletClient.writeContract(request);
    console.log(`   TX: https://basescan.org/tx/${txHash}`);
    
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(`   ✅ Claimed ${feeInfo.wethFeesFormatted} WETH!\n`);
    
    result.wethClaimed = feeInfo.wethFees;
    result.wethTxHash = txHash;
  }

  // Optionally claim token fees
  if (claimBoth && feeInfo.tokenFees > 0n) {
    console.log('📤 Claiming token fees...');
    
    const { request } = await publicClient.simulateContract({
      address: FEE_LOCKER_ADDRESS,
      abi: FEE_LOCKER_ABI,
      functionName: 'claim',
      args: [account.address, tokenAddress],
      account,
    });

    const txHash = await walletClient.writeContract(request);
    console.log(`   TX: https://basescan.org/tx/${txHash}`);
    
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(`   ✅ Claimed ${feeInfo.tokenFeesFormatted} tokens!\n`);
    
    result.tokenClaimed = feeInfo.tokenFees;
    result.tokenTxHash = txHash;
  }

  console.log('🎉 Fee claiming complete!');
  console.log('   WETH now available in your wallet for:');
  console.log('   - Purchasing OpenRouter credits (self-funding)');
  console.log('   - Gas for transactions');
  console.log('   - Swapping to other assets');

  return result;
}

// Parse command line arguments
async function main() {
  if (!process.env.PRIVATE_KEY) {
    console.error('Error: PRIVATE_KEY not set');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const tokenIndex = args.indexOf('--token');
  const tokenAddress = (tokenIndex !== -1 
    ? args[tokenIndex + 1] 
    : process.env.TOKEN_ADDRESS) as `0x${string}`;

  if (!tokenAddress) {
    console.error('Usage: npx tsx claim-fees.ts --token 0x...');
    process.exit(1);
  }

  const claimBoth = args.includes('--claim-both');
  const dryRun = args.includes('--dry-run');

  await claimFees(tokenAddress, { claimBoth, dryRun });
}

main().catch(console.error);

export { claimFees };
