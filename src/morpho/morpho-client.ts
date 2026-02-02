/**
 * morpho-client.ts
 * 
 * Morpho Blue integration for the Clawnch ecosystem.
 * Demonstrates borrowing USDC against $CLAWNCH collateral.
 * 
 * The $CLAWNCH Morpho Market:
 * - Collateral: CLAWNCH
 * - Borrow Asset: USDC
 * - LLTV: 38.5% (conservative for memecoins)
 * - Oracle: Uniswap V3 TWAP (5-min window)
 */

import 'dotenv/config';
import { formatEther, formatUnits, type Address } from 'viem';
import {
  getPublicClient,
  getWalletClient,
  getAccount,
  MORPHO_ABI,
  ERC20_ABI,
  MORPHO_BLUE,
  CLAWNCH_TOKEN,
  USDC,
  CLAWNCH_MARKET_ID,
  CLAWNCH_MARKET_PARAMS,
  withRetry,
} from '../lib/index.js';

// ============ Constants ============

/** LLTV (Loan-to-Value) for CLAWNCH market: 38.5% */
const CLAWNCH_LLTV_BPS = 385n; // basis points / 10 = 38.5%
const LLTV_DIVISOR = 1000n;

// ============ Types ============

export interface MorphoPosition {
  collateral: bigint;
  collateralFormatted: string;
  borrowShares: bigint;
  /** 
   * Note: Actual borrowed USDC requires market data conversion.
   * This is a simplified representation.
   */
  borrowedUsdc: bigint;
  borrowedUsdcFormatted: string;
  /**
   * Health factor for the position.
   * 
   * ⚠️ LIMITATION: This returns a placeholder value (1.0 if borrowing, Infinity if not).
   * 
   * Real health factor calculation requires:
   * 1. Querying the CLAWNCH_ORACLE for current collateral price
   * 2. Converting borrow shares to assets using market totalBorrowShares/Assets
   * 3. Calculating: (collateralValue * LLTV) / borrowValue
   * 
   * @todo Integrate with CLAWNCH_ORACLE (0x81DD756b...) for accurate health factor
   * @see https://docs.morpho.org/morpho/concepts/position-health
   */
  healthFactor: number;
  maxBorrowable: bigint;
  maxBorrowableFormatted: string;
}

export interface MarketInfo {
  totalSupply: bigint;
  totalBorrow: bigint;
  utilization: number;
  availableLiquidity: bigint;
}

/**
 * Get Morpho market info for the CLAWNCH market.
 */
export async function getMarketInfo(): Promise<MarketInfo> {
  const publicClient = getPublicClient();

  const marketData = await publicClient.readContract({
    address: MORPHO_BLUE,
    abi: MORPHO_ABI,
    functionName: 'market',
    args: [CLAWNCH_MARKET_ID],
  });

  const totalSupply = BigInt(marketData[0]);
  const totalBorrow = BigInt(marketData[2]);
  const utilization = totalSupply > 0n 
    ? Number((totalBorrow * 10000n) / totalSupply) / 100 
    : 0;

  return {
    totalSupply,
    totalBorrow,
    utilization,
    availableLiquidity: totalSupply - totalBorrow,
  };
}

/**
 * Get a wallet's position in the CLAWNCH Morpho market.
 */
export async function getPosition(walletAddress: Address): Promise<MorphoPosition> {
  const publicClient = getPublicClient();

  const position = await publicClient.readContract({
    address: MORPHO_BLUE,
    abi: MORPHO_ABI,
    functionName: 'position',
    args: [CLAWNCH_MARKET_ID, walletAddress],
  });

  const collateral = BigInt(position[2]);
  const borrowShares = BigInt(position[1]);

  // NOTE: maxBorrowable is an approximation using LLTV only
  // For accurate values, integrate with the Morpho oracle to get collateral price
  const maxBorrowable = (collateral * CLAWNCH_LLTV_BPS) / LLTV_DIVISOR;

  return {
    collateral,
    collateralFormatted: formatEther(collateral),
    borrowShares,
    borrowedUsdc: 0n, // Would need shares-to-assets conversion
    borrowedUsdcFormatted: '0',
    healthFactor: borrowShares > 0n ? 1.0 : Infinity,
    maxBorrowable,
    maxBorrowableFormatted: formatUnits(maxBorrowable, 6),
  };
}

/**
 * Supply CLAWNCH tokens as collateral to Morpho.
 */
export async function supplyCollateral(
  amount: bigint,
  options: { dryRun?: boolean } = {}
): Promise<string | null> {
  const account = getAccount();
  const publicClient = getPublicClient();
  const walletClient = getWalletClient();

  console.log('📥 Supplying CLAWNCH as collateral to Morpho...');
  console.log(`   Amount: ${formatEther(amount)} CLAWNCH`);
  console.log(`   Wallet: ${account.address}`);

  // Check CLAWNCH balance
  const balance = await publicClient.readContract({
    address: CLAWNCH_TOKEN,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [account.address],
  });

  if (balance < amount) {
    throw new Error(`Insufficient CLAWNCH. Have: ${formatEther(balance)}, Need: ${formatEther(amount)}`);
  }

  // Check and set approval
  const allowance = await publicClient.readContract({
    address: CLAWNCH_TOKEN,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [account.address, MORPHO_BLUE],
  });

  if (allowance < amount) {
    console.log('   Approving CLAWNCH for Morpho...');

    if (!options.dryRun) {
      const approveTx = await walletClient.writeContract({
        address: CLAWNCH_TOKEN,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [MORPHO_BLUE, amount],
        chain: null, // Uses wallet client's chain
        account: account.address,
      });
      await publicClient.waitForTransactionReceipt({ hash: approveTx });
      console.log(`   ✅ Approved: ${approveTx}`);
    }
  }

  if (options.dryRun) {
    console.log('   🔍 DRY RUN - Would supply collateral');
    return null;
  }

  // Supply collateral with retry
  const txHash = await withRetry(async () => {
    const { request } = await publicClient.simulateContract({
      address: MORPHO_BLUE,
      abi: MORPHO_ABI,
      functionName: 'supplyCollateral',
      args: [CLAWNCH_MARKET_PARAMS, amount, 0n, account.address, '0x'],
      account: account.address,
    });

    return walletClient.writeContract(request);
  }, { retries: 2 });

  console.log(`   📝 TX: https://basescan.org/tx/${txHash}`);

  await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`   ✅ Collateral supplied!`);

  return txHash;
}

/**
 * Borrow USDC against CLAWNCH collateral.
 */
export async function borrowUsdc(
  amount: bigint,
  options: { dryRun?: boolean } = {}
): Promise<string | null> {
  const account = getAccount();
  const publicClient = getPublicClient();
  const walletClient = getWalletClient();

  console.log('💸 Borrowing USDC against CLAWNCH collateral...');
  console.log(`   Amount: ${formatUnits(amount, 6)} USDC`);

  // Check position first
  const position = await getPosition(account.address);
  console.log(`   Current collateral: ${position.collateralFormatted} CLAWNCH`);

  if (position.collateral === 0n) {
    throw new Error('No collateral supplied. Call supplyCollateral first.');
  }

  if (options.dryRun) {
    console.log('   🔍 DRY RUN - Would borrow USDC');
    return null;
  }

  // Borrow with retry
  const txHash = await withRetry(async () => {
    const { request } = await publicClient.simulateContract({
      address: MORPHO_BLUE,
      abi: MORPHO_ABI,
      functionName: 'borrow',
      args: [CLAWNCH_MARKET_PARAMS, amount, 0n, account.address, account.address],
      account: account.address,
    });

    return walletClient.writeContract(request);
  }, { retries: 2 });

  console.log(`   📝 TX: https://basescan.org/tx/${txHash}`);

  await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`   ✅ USDC borrowed!`);

  return txHash;
}

async function demo() {
  console.log('═'.repeat(60));
  console.log('  CLAWNCH MORPHO INTEGRATION DEMO');
  console.log('  Borrow USDC Against Your CLAWNCH Holdings');
  console.log('═'.repeat(60));

  console.log('\n📊 Market Info:');
  console.log(`   Market ID: ${CLAWNCH_MARKET_ID.slice(0, 20)}...`);
  console.log(`   Collateral: CLAWNCH (${CLAWNCH_TOKEN})`);
  console.log(`   Borrow: USDC (${USDC})`);
  console.log(`   LLTV: 38.5%`);
  console.log(`   Oracle: Uniswap V3 TWAP (5-min)`);

  try {
    const marketInfo = await getMarketInfo();
    console.log('\n📈 Market Status:');
    console.log(`   Total Supply: ${formatUnits(marketInfo.totalSupply, 6)} USDC`);
    console.log(`   Total Borrow: ${formatUnits(marketInfo.totalBorrow, 6)} USDC`);
    console.log(`   Utilization: ${marketInfo.utilization.toFixed(2)}%`);
    console.log(`   Available: ${formatUnits(marketInfo.availableLiquidity, 6)} USDC`);
  } catch (e) {
    console.log('\n⚠️ Could not fetch market info (may need RPC access)');
  }

  try {
    const account = getAccount();
    console.log(`\n👛 Your Position (${account.address.slice(0, 10)}...):`);

    const position = await getPosition(account.address);
    console.log(`   Collateral: ${position.collateralFormatted} CLAWNCH`);
    console.log(`   Borrowed: ${position.borrowedUsdcFormatted} USDC`);
  } catch (e) {
    console.log('\n👛 Set PRIVATE_KEY to check your position');
  }

  console.log('\n💡 Usage:');
  console.log('   1. Acquire CLAWNCH tokens');
  console.log('   2. Supply as collateral: supplyCollateral(amount)');
  console.log('   3. Borrow USDC: borrowUsdc(amount)');
  console.log('   4. Use USDC for operations');
  console.log('   5. Repay when ready');

  console.log('\n═'.repeat(60));
}

const isMainModule = process.argv[1]?.endsWith('morpho-client.ts');
if (isMainModule) {
  demo().catch(console.error);
}

export { 
  MORPHO_BLUE, 
  CLAWNCH_TOKEN, 
  USDC, 
  CLAWNCH_MARKET_ID, 
  CLAWNCH_MARKET_PARAMS 
};
