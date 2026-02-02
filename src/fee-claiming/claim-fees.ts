/**
 * claim-fees.ts
 * 
 * Claim accumulated trading fees from Clanker tokens.
 * Part of the agent autonomy loop - converting trading activity into funds.
 * 
 * Usage:
 *   PRIVATE_KEY=0x... npx tsx claim-fees.ts --token 0x...
 *   npx tsx claim-fees.ts --token 0x... --claim-both
 *   npx tsx claim-fees.ts --token 0x... --dry-run
 */

import 'dotenv/config';
import { formatEther, type Address } from 'viem';
import {
  getPublicClient,
  getWalletClient,
  getAccount,
  FEE_LOCKER_ABI,
  FEE_LOCKER,
  WETH,
  validateAddress,
  withRetry,
} from '../lib/index.js';
import { checkFees } from './check-fees.js';

export interface ClaimResult {
  tokenAddress: Address;
  wethClaimed: bigint;
  tokenClaimed: bigint;
  wethTxHash?: string;
  tokenTxHash?: string;
}

/**
 * Claim accumulated trading fees from a Clanker token.
 */
export async function claimFees(
  tokenAddress: Address,
  options: {
    claimBoth?: boolean;
    dryRun?: boolean;
  } = {}
): Promise<ClaimResult> {
  const { claimBoth = false, dryRun = false } = options;

  const account = getAccount();
  const publicClient = getPublicClient();
  const walletClient = getWalletClient();

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

  // Check gas balance before claiming
  const balance = await publicClient.getBalance({ address: account.address });
  const gasEstimate = await publicClient.estimateContractGas({
    address: FEE_LOCKER,
    abi: FEE_LOCKER_ABI,
    functionName: 'claim',
    args: [account.address, WETH],
    account: account.address,
  });
  const gasPrice = await publicClient.getGasPrice();
  const estimatedCost = gasEstimate * gasPrice;

  const requiredBalance = (estimatedCost * 12n) / 10n; // 20% buffer
  if (balance < requiredBalance) {
    throw new Error(
      `Insufficient ETH for gas. Need ~${formatEther(requiredBalance)} ETH, have ${formatEther(balance)} ETH`
    );
  }

  // Claim WETH fees with retry
  if (feeInfo.wethFees > 0n) {
    console.log('📤 Claiming WETH fees...');

    const txHash = await withRetry(async () => {
      const { request } = await publicClient.simulateContract({
        address: FEE_LOCKER,
        abi: FEE_LOCKER_ABI,
        functionName: 'claim',
        args: [account.address, WETH],
        account: account.address,
      });

      return walletClient.writeContract(request);
    }, { retries: 2, onRetry: (err, attempt) => console.log(`   Retry ${attempt}: ${err.message}`) });

    console.log(`   TX: https://basescan.org/tx/${txHash}`);

    await publicClient.waitForTransactionReceipt({ 
      hash: txHash,
      confirmations: 1,
      pollingInterval: 2000,
    });
    console.log(`   ✅ Claimed ${feeInfo.wethFeesFormatted} WETH!\n`);

    result.wethClaimed = feeInfo.wethFees;
    result.wethTxHash = txHash;
  }

  // Optionally claim token fees
  if (claimBoth && feeInfo.tokenFees > 0n) {
    console.log('📤 Claiming token fees...');

    const txHash = await withRetry(async () => {
      const { request } = await publicClient.simulateContract({
        address: FEE_LOCKER,
        abi: FEE_LOCKER_ABI,
        functionName: 'claim',
        args: [account.address, tokenAddress],
        account: account.address,
      });

      return walletClient.writeContract(request);
    }, { retries: 2 });

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

async function main() {
  const args = process.argv.slice(2);
  const tokenIndex = args.indexOf('--token');

  const tokenAddress = validateAddress(
    tokenIndex !== -1 ? args[tokenIndex + 1] : process.env.TOKEN_ADDRESS,
    'token address'
  );

  const claimBoth = args.includes('--claim-both');
  const dryRun = args.includes('--dry-run');

  await claimFees(tokenAddress, { claimBoth, dryRun });
}

const isMainModule = process.argv[1]?.endsWith('claim-fees.ts');
if (isMainModule) {
  main().catch(console.error);
}

// claimFees already exported at definition
