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
 * 
 * Use Case:
 * Agents can borrow USDC against their $CLAWNCH holdings to fund
 * operations without selling tokens. This preserves upside exposure
 * while accessing liquidity.
 */

import 'dotenv/config';
import { 
  createPublicClient, 
  createWalletClient, 
  http, 
  formatEther, 
  formatUnits,
  parseEther,
  parseUnits,
  encodeFunctionData,
  type Address
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

// Contract addresses on Base
const MORPHO_BLUE = '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb' as const;
const CLAWNCH_TOKEN = '0xa1F72459dfA10BAD200Ac160eCd78C6b77a747be' as const;
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
const CLAWNCH_ORACLE = '0x81DD756b6de7908b998b4f9E4Ca44Ee0d230ee5e' as const;
const ADAPTIVE_CURVE_IRM = '0x46415998764C29aB2a25CbeA6254146D50D22687' as const;

// The CLAWNCH Morpho market ID
const CLAWNCH_MARKET_ID = '0xd7746cb1ce24f11256004bfcbaaddc400fb2087866a02529df0a0f6fe4a33e99' as const;

// Market parameters (from skill.md)
const MARKET_PARAMS = {
  loanToken: USDC,
  collateralToken: CLAWNCH_TOKEN,
  oracle: CLAWNCH_ORACLE,
  irm: ADAPTIVE_CURVE_IRM,
  lltv: 385000000000000000n, // 38.5% in 18 decimals
} as const;

// Morpho Blue ABI (relevant functions)
const MORPHO_ABI = [
  {
    inputs: [
      {
        components: [
          { name: 'loanToken', type: 'address' },
          { name: 'collateralToken', type: 'address' },
          { name: 'oracle', type: 'address' },
          { name: 'irm', type: 'address' },
          { name: 'lltv', type: 'uint256' },
        ],
        name: 'marketParams',
        type: 'tuple',
      },
      { name: 'assets', type: 'uint256' },
      { name: 'shares', type: 'uint256' },
      { name: 'onBehalf', type: 'address' },
      { name: 'data', type: 'bytes' },
    ],
    name: 'supplyCollateral',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        components: [
          { name: 'loanToken', type: 'address' },
          { name: 'collateralToken', type: 'address' },
          { name: 'oracle', type: 'address' },
          { name: 'irm', type: 'address' },
          { name: 'lltv', type: 'uint256' },
        ],
        name: 'marketParams',
        type: 'tuple',
      },
      { name: 'assets', type: 'uint256' },
      { name: 'shares', type: 'uint256' },
      { name: 'onBehalf', type: 'address' },
      { name: 'receiver', type: 'address' },
    ],
    name: 'borrow',
    outputs: [{ name: 'assetsBorrowed', type: 'uint256' }, { name: 'sharesBorrowed', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        components: [
          { name: 'loanToken', type: 'address' },
          { name: 'collateralToken', type: 'address' },
          { name: 'oracle', type: 'address' },
          { name: 'irm', type: 'address' },
          { name: 'lltv', type: 'uint256' },
        ],
        name: 'marketParams',
        type: 'tuple',
      },
      { name: 'assets', type: 'uint256' },
      { name: 'shares', type: 'uint256' },
      { name: 'onBehalf', type: 'address' },
      { name: 'data', type: 'bytes' },
    ],
    name: 'repay',
    outputs: [{ name: 'assetsRepaid', type: 'uint256' }, { name: 'sharesRepaid', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        components: [
          { name: 'loanToken', type: 'address' },
          { name: 'collateralToken', type: 'address' },
          { name: 'oracle', type: 'address' },
          { name: 'irm', type: 'address' },
          { name: 'lltv', type: 'uint256' },
        ],
        name: 'marketParams',
        type: 'tuple',
      },
      { name: 'assets', type: 'uint256' },
      { name: 'onBehalf', type: 'address' },
      { name: 'receiver', type: 'address' },
    ],
    name: 'withdrawCollateral',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'id', type: 'bytes32' }, { name: 'user', type: 'address' }],
    name: 'position',
    outputs: [
      { name: 'supplyShares', type: 'uint256' },
      { name: 'borrowShares', type: 'uint128' },
      { name: 'collateral', type: 'uint128' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'id', type: 'bytes32' }],
    name: 'market',
    outputs: [
      { name: 'totalSupplyAssets', type: 'uint128' },
      { name: 'totalSupplyShares', type: 'uint128' },
      { name: 'totalBorrowAssets', type: 'uint128' },
      { name: 'totalBorrowShares', type: 'uint128' },
      { name: 'lastUpdate', type: 'uint128' },
      { name: 'fee', type: 'uint128' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// ERC20 ABI for approvals
const ERC20_ABI = [
  {
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

interface MorphoPosition {
  collateral: bigint;
  collateralFormatted: string;
  borrowShares: bigint;
  borrowedUsdc: bigint;
  borrowedUsdcFormatted: string;
  healthFactor: number;
  maxBorrowable: bigint;
  maxBorrowableFormatted: string;
}

interface MarketInfo {
  totalSupply: bigint;
  totalBorrow: bigint;
  utilization: number;
  availableLiquidity: bigint;
}

export async function getMarketInfo(): Promise<MarketInfo> {
  const publicClient = createPublicClient({
    chain: base,
    transport: http('https://mainnet.base.org'),
  });

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

export async function getPosition(walletAddress: Address): Promise<MorphoPosition> {
  const publicClient = createPublicClient({
    chain: base,
    transport: http('https://mainnet.base.org'),
  });

  const position = await publicClient.readContract({
    address: MORPHO_BLUE,
    abi: MORPHO_ABI,
    functionName: 'position',
    args: [CLAWNCH_MARKET_ID, walletAddress],
  });

  const collateral = BigInt(position[2]);
  const borrowShares = BigInt(position[1]);

  // Calculate max borrowable (38.5% of collateral value)
  // This is simplified - real calculation needs oracle price
  const maxBorrowable = (collateral * 385n) / 1000n;

  return {
    collateral,
    collateralFormatted: formatEther(collateral),
    borrowShares,
    borrowedUsdc: 0n, // Would need to convert shares to assets
    borrowedUsdcFormatted: '0',
    healthFactor: borrowShares > 0n ? 1.0 : Infinity,
    maxBorrowable,
    maxBorrowableFormatted: formatUnits(maxBorrowable, 6), // USDC has 6 decimals
  };
}

export async function supplyCollateral(
  amount: bigint,
  options: { dryRun?: boolean } = {}
): Promise<string | null> {
  if (!process.env.PRIVATE_KEY) {
    throw new Error('PRIVATE_KEY not set');
  }

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
      });
      await publicClient.waitForTransactionReceipt({ hash: approveTx });
      console.log(`   ✅ Approved: ${approveTx}`);
    }
  }

  if (options.dryRun) {
    console.log('   🔍 DRY RUN - Would supply collateral');
    return null;
  }

  // Supply collateral
  const { request } = await publicClient.simulateContract({
    address: MORPHO_BLUE,
    abi: MORPHO_ABI,
    functionName: 'supplyCollateral',
    args: [MARKET_PARAMS, amount, 0n, account.address, '0x'],
    account,
  });

  const txHash = await walletClient.writeContract(request);
  console.log(`   📝 TX: https://basescan.org/tx/${txHash}`);
  
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`   ✅ Collateral supplied!`);

  return txHash;
}

export async function borrowUsdc(
  amount: bigint,
  options: { dryRun?: boolean } = {}
): Promise<string | null> {
  if (!process.env.PRIVATE_KEY) {
    throw new Error('PRIVATE_KEY not set');
  }

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

  // Borrow USDC
  const { request } = await publicClient.simulateContract({
    address: MORPHO_BLUE,
    abi: MORPHO_ABI,
    functionName: 'borrow',
    args: [MARKET_PARAMS, amount, 0n, account.address, account.address],
    account,
  });

  const txHash = await walletClient.writeContract(request);
  console.log(`   📝 TX: https://basescan.org/tx/${txHash}`);
  
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`   ✅ USDC borrowed!`);

  return txHash;
}

// Demo function
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

  if (process.env.PRIVATE_KEY) {
    const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
    console.log(`\n👛 Your Position (${account.address.slice(0, 10)}...):`);
    
    try {
      const position = await getPosition(account.address);
      console.log(`   Collateral: ${position.collateralFormatted} CLAWNCH`);
      console.log(`   Borrowed: ${position.borrowedUsdcFormatted} USDC`);
    } catch (e) {
      console.log('   No position yet');
    }
  }

  console.log('\n💡 Usage:');
  console.log('   1. Acquire CLAWNCH tokens');
  console.log('   2. Supply as collateral: supplyCollateral(amount)');
  console.log('   3. Borrow USDC: borrowUsdc(amount)');
  console.log('   4. Use USDC for operations');
  console.log('   5. Repay when ready');

  console.log('\n═'.repeat(60));
}

// Run demo if called directly
demo().catch(console.error);

export { 
  MORPHO_BLUE, 
  CLAWNCH_TOKEN, 
  USDC, 
  CLAWNCH_MARKET_ID, 
  MARKET_PARAMS 
};
