/**
 * create-market.ts
 * 
 * Create a Morpho Blue lending market for any Clawnch token
 * that has a Uniswap V3 pool.
 * 
 * Prerequisites:
 * - Token must have a Uniswap V3 pool with WETH
 * - Small amount of ETH for gas (~$1-2)
 * 
 * This script:
 * 1. Validates the token has a V3 pool
 * 2. Creates a TWAP oracle via Clawnch factory
 * 3. Creates the Morpho Blue market
 * 
 * Usage:
 *   PRIVATE_KEY=0x... npx tsx create-market.ts --token 0x...
 *   npx tsx create-market.ts --token 0x... --lltv 38.5 --dry-run
 */

import 'dotenv/config';
import { 
  createPublicClient, 
  createWalletClient, 
  http, 
  formatEther,
  keccak256,
  encodeAbiParameters,
  parseAbiParameters,
  type Address
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

// Contract addresses
const MORPHO_BLUE = '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb' as const;
const TWAP_ORACLE_FACTORY = '0x3Ce2EbEE744a054902A9B4172a3bBa19D1e25a3C' as const;
const ADAPTIVE_CURVE_IRM = '0x46415998764C29aB2a25CbeA6254146D50D22687' as const;
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
const WETH = '0x4200000000000000000000000000000000000006' as const;
const UNISWAP_V3_FACTORY = '0x33128a8fC17869897dcE68Ed026d694621f6FDfD' as const;

// Available LLTV options (from skill.md)
const LLTV_OPTIONS: Record<string, bigint> = {
  '0': 0n,
  '38.5': 385000000000000000n,
  '62.5': 625000000000000000n,
  '77': 770000000000000000n,
  '86': 860000000000000000n,
  '91.5': 915000000000000000n,
  '94.5': 945000000000000000n,
  '96.5': 965000000000000000n,
  '98': 980000000000000000n,
};

// Uniswap V3 Factory ABI
const FACTORY_ABI = [
  {
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
      { name: 'fee', type: 'uint24' },
    ],
    name: 'getPool',
    outputs: [{ name: 'pool', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// TWAP Oracle Factory ABI (simplified)
const TWAP_FACTORY_ABI = [
  {
    inputs: [
      { name: 'pool', type: 'address' },
      { name: 'baseToken', type: 'address' },
      { name: 'quoteToken', type: 'address' },
      { name: 'twapWindow', type: 'uint32' },
    ],
    name: 'createOracle',
    outputs: [{ name: 'oracle', type: 'address' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'pool0', type: 'address' },
      { name: 'pool1', type: 'address' },
      { name: 'baseToken', type: 'address' },
      { name: 'intermediateToken', type: 'address' },
      { name: 'quoteToken', type: 'address' },
      { name: 'twapWindow', type: 'uint32' },
    ],
    name: 'createTwoHopOracle',
    outputs: [{ name: 'oracle', type: 'address' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

// Morpho ABI for createMarket
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
    ],
    name: 'createMarket',
    outputs: [],
    stateMutability: 'nonpayable',
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

// Fee tiers to check
const FEE_TIERS = [500, 3000, 10000] as const;

async function findV3Pool(tokenAddress: Address): Promise<{ pool: Address; fee: number } | null> {
  const publicClient = createPublicClient({
    chain: base,
    transport: http('https://mainnet.base.org'),
  });

  console.log('🔍 Searching for Uniswap V3 pool...');

  for (const fee of FEE_TIERS) {
    const pool = await publicClient.readContract({
      address: UNISWAP_V3_FACTORY,
      abi: FACTORY_ABI,
      functionName: 'getPool',
      args: [tokenAddress, WETH, fee],
    });

    if (pool !== '0x0000000000000000000000000000000000000000') {
      console.log(`   ✅ Found V3 pool at ${pool} (fee tier: ${fee / 10000}%)`);
      return { pool, fee };
    }
  }

  console.log('   ❌ No V3 pool found with WETH');
  return null;
}

async function findWethUsdcPool(): Promise<Address> {
  const publicClient = createPublicClient({
    chain: base,
    transport: http('https://mainnet.base.org'),
  });

  // WETH/USDC pool (usually 0.05% tier)
  const pool = await publicClient.readContract({
    address: UNISWAP_V3_FACTORY,
    abi: FACTORY_ABI,
    functionName: 'getPool',
    args: [WETH, USDC, 500],
  });

  if (pool === '0x0000000000000000000000000000000000000000') {
    throw new Error('WETH/USDC pool not found');
  }

  return pool;
}

function computeMarketId(marketParams: {
  loanToken: Address;
  collateralToken: Address;
  oracle: Address;
  irm: Address;
  lltv: bigint;
}): `0x${string}` {
  const encoded = encodeAbiParameters(
    parseAbiParameters('address, address, address, address, uint256'),
    [
      marketParams.loanToken,
      marketParams.collateralToken,
      marketParams.oracle,
      marketParams.irm,
      marketParams.lltv,
    ]
  );
  return keccak256(encoded);
}

async function createMarket(
  tokenAddress: Address,
  options: {
    lltv?: string;
    dryRun?: boolean;
  } = {}
) {
  const lltv = LLTV_OPTIONS[options.lltv || '38.5'];
  if (lltv === undefined) {
    throw new Error(`Invalid LLTV. Options: ${Object.keys(LLTV_OPTIONS).join(', ')}`);
  }

  console.log('═'.repeat(60));
  console.log('  CREATE MORPHO MARKET');
  console.log('═'.repeat(60));
  console.log(`\n📊 Configuration:`);
  console.log(`   Token: ${tokenAddress}`);
  console.log(`   LLTV: ${options.lltv || '38.5'}%`);
  console.log(`   Loan Asset: USDC`);

  const publicClient = createPublicClient({
    chain: base,
    transport: http('https://mainnet.base.org'),
  });

  // Step 1: Find V3 pool
  console.log('\n📌 Step 1: Validate Uniswap V3 Pool');
  const poolInfo = await findV3Pool(tokenAddress);
  
  if (!poolInfo) {
    console.log('\n❌ Cannot create market: No V3 pool exists');
    console.log('   The token needs a Uniswap V3 pool with WETH');
    console.log('   (Uniswap V4 pools are not compatible with Morpho TWAP oracles)');
    return null;
  }

  // Step 2: Get WETH/USDC pool for two-hop oracle
  console.log('\n📌 Step 2: Locate WETH/USDC Pool');
  const wethUsdcPool = await findWethUsdcPool();
  console.log(`   ✅ WETH/USDC pool: ${wethUsdcPool}`);

  if (options.dryRun) {
    console.log('\n🔍 DRY RUN - Would create:');
    console.log('   1. Two-hop TWAP oracle (TOKEN → WETH → USDC)');
    console.log('   2. Morpho Blue market with above oracle');
    
    // Compute what the market ID would be (with placeholder oracle)
    const placeholderMarketParams = {
      loanToken: USDC,
      collateralToken: tokenAddress,
      oracle: '0x0000000000000000000000000000000000000001' as Address,
      irm: ADAPTIVE_CURVE_IRM,
      lltv,
    };
    
    console.log(`\n   Market Parameters:`);
    console.log(`     Loan Token: ${USDC} (USDC)`);
    console.log(`     Collateral: ${tokenAddress}`);
    console.log(`     IRM: ${ADAPTIVE_CURVE_IRM}`);
    console.log(`     LLTV: ${lltv}`);
    
    return null;
  }

  if (!process.env.PRIVATE_KEY) {
    throw new Error('PRIVATE_KEY required for market creation');
  }

  const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http('https://mainnet.base.org'),
  });

  // Step 3: Create TWAP Oracle
  console.log('\n📌 Step 3: Create TWAP Oracle');
  console.log('   Creating two-hop oracle: TOKEN → WETH → USDC');
  
  const { request: oracleRequest } = await publicClient.simulateContract({
    address: TWAP_ORACLE_FACTORY,
    abi: TWAP_FACTORY_ABI,
    functionName: 'createTwoHopOracle',
    args: [
      poolInfo.pool,  // TOKEN/WETH pool
      wethUsdcPool,   // WETH/USDC pool
      tokenAddress,   // base token
      WETH,           // intermediate
      USDC,           // quote token
      300,            // 5-minute TWAP window
    ],
    account,
  });

  const oracleTxHash = await walletClient.writeContract(oracleRequest);
  console.log(`   TX: https://basescan.org/tx/${oracleTxHash}`);
  
  const oracleReceipt = await publicClient.waitForTransactionReceipt({ hash: oracleTxHash });
  
  // Extract oracle address from logs (simplified - would need proper log parsing)
  // For now, assume it's in the first log's address
  const oracleAddress = oracleReceipt.logs[0]?.address as Address;
  console.log(`   ✅ Oracle created: ${oracleAddress}`);

  // Step 4: Create Morpho Market
  console.log('\n📌 Step 4: Create Morpho Market');
  
  const marketParams = {
    loanToken: USDC,
    collateralToken: tokenAddress,
    oracle: oracleAddress,
    irm: ADAPTIVE_CURVE_IRM,
    lltv,
  };

  const marketId = computeMarketId(marketParams);
  console.log(`   Market ID: ${marketId}`);

  const { request: marketRequest } = await publicClient.simulateContract({
    address: MORPHO_BLUE,
    abi: MORPHO_ABI,
    functionName: 'createMarket',
    args: [marketParams],
    account,
  });

  const marketTxHash = await walletClient.writeContract(marketRequest);
  console.log(`   TX: https://basescan.org/tx/${marketTxHash}`);
  
  await publicClient.waitForTransactionReceipt({ hash: marketTxHash });
  console.log(`   ✅ Market created!`);

  console.log('\n═'.repeat(60));
  console.log('  MARKET CREATION COMPLETE');
  console.log('═'.repeat(60));
  console.log(`\n📊 Summary:`);
  console.log(`   Market ID: ${marketId}`);
  console.log(`   Oracle: ${oracleAddress}`);
  console.log(`   Collateral: ${tokenAddress}`);
  console.log(`   Borrow: USDC`);
  console.log(`   LLTV: ${options.lltv || '38.5'}%`);

  return { marketId, oracleAddress, marketParams };
}

// Parse args and run
async function main() {
  const args = process.argv.slice(2);
  
  const tokenIndex = args.indexOf('--token');
  const lltvIndex = args.indexOf('--lltv');
  const dryRun = args.includes('--dry-run');

  if (tokenIndex === -1) {
    console.log('Usage: npx tsx create-market.ts --token 0x... [--lltv 38.5] [--dry-run]');
    console.log('\nLLTV Options: 0, 38.5, 62.5, 77, 86, 91.5, 94.5, 96.5, 98');
    console.log('Default: 38.5% (recommended for memecoins)');
    process.exit(1);
  }

  const tokenAddress = args[tokenIndex + 1] as Address;
  const lltv = lltvIndex !== -1 ? args[lltvIndex + 1] : '38.5';

  await createMarket(tokenAddress, { lltv, dryRun });
}

main().catch(console.error);

export { createMarket, findV3Pool, computeMarketId };
