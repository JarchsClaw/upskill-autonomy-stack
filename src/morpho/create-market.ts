/**
 * create-market.ts
 * 
 * Create a Morpho Blue lending market for any Clawnch token
 * that has a Uniswap V3 pool.
 * 
 * Usage:
 *   PRIVATE_KEY=0x... npx tsx create-market.ts --token 0x...
 *   npx tsx create-market.ts --token 0x... --lltv 38.5 --dry-run
 */

import 'dotenv/config';
import { 
  formatEther,
  keccak256,
  encodeAbiParameters,
  parseAbiParameters,
  decodeEventLog,
  type Address,
  type Log
} from 'viem';
import {
  getPublicClient,
  getWalletClient,
  getAccount,
  MORPHO_ABI,
  UNISWAP_V3_FACTORY_ABI,
  TWAP_FACTORY_ABI,
  MORPHO_BLUE,
  TWAP_ORACLE_FACTORY,
  ADAPTIVE_CURVE_IRM,
  UNISWAP_V3_FACTORY,
  USDC,
  WETH,
  FEE_TIERS,
  LLTV_OPTIONS,
  ZERO_ADDRESS,
  validateAddress,
  validateOption,
  withRetry,
} from '../lib/index.js';

// Oracle created event for log parsing
const ORACLE_CREATED_EVENT = {
  type: 'event',
  name: 'OracleCreated',
  inputs: [
    { name: 'oracle', type: 'address', indexed: true },
    { name: 'pool', type: 'address', indexed: true },
  ],
} as const;

/**
 * Find a Uniswap V3 pool for a token paired with WETH.
 */
async function findV3Pool(tokenAddress: Address): Promise<{ pool: Address; fee: number } | null> {
  const publicClient = getPublicClient();

  console.log('🔍 Searching for Uniswap V3 pool...');

  // Check all fee tiers in parallel
  const results = await publicClient.multicall({
    contracts: FEE_TIERS.map(fee => ({
      address: UNISWAP_V3_FACTORY,
      abi: UNISWAP_V3_FACTORY_ABI,
      functionName: 'getPool',
      args: [tokenAddress, WETH, fee],
    })),
  });

  for (let i = 0; i < results.length; i++) {
    const pool = results[i].result as Address | undefined;
    if (pool && pool !== ZERO_ADDRESS) {
      console.log(`   ✅ Found V3 pool at ${pool} (fee tier: ${FEE_TIERS[i] / 10000}%)`);
      return { pool, fee: FEE_TIERS[i] };
    }
  }

  console.log('   ❌ No V3 pool found with WETH');
  return null;
}

/**
 * Find the WETH/USDC pool for two-hop oracle.
 */
async function findWethUsdcPool(): Promise<Address> {
  const publicClient = getPublicClient();

  const pool = await publicClient.readContract({
    address: UNISWAP_V3_FACTORY,
    abi: UNISWAP_V3_FACTORY_ABI,
    functionName: 'getPool',
    args: [WETH, USDC, 500], // 0.05% tier
  });

  if (pool === ZERO_ADDRESS) {
    throw new Error('WETH/USDC pool not found');
  }

  return pool;
}

/**
 * Extract oracle address from transaction logs.
 */
function extractOracleAddress(logs: Log[]): Address {
  for (const log of logs) {
    try {
      // Try to find OracleCreated event
      if (log.topics[0]) {
        // The oracle address is typically the contract that emitted the event
        // or in the first indexed topic after the event signature
        if (log.topics[1]) {
          return ('0x' + log.topics[1].slice(26)) as Address;
        }
      }
    } catch {
      // Not this event, continue
    }
  }
  
  // Fallback: use the contract address from the first log
  if (logs[0]?.address) {
    return logs[0].address;
  }
  
  throw new Error('OracleCreated event not found in transaction logs');
}

/**
 * Compute the Morpho market ID from parameters.
 */
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

/**
 * Create a Morpho Blue market for a token.
 */
export async function createMarket(
  tokenAddress: Address,
  options: {
    lltv?: string;
    dryRun?: boolean;
  } = {}
) {
  const lltvKey = options.lltv || '38.5';
  const lltv = LLTV_OPTIONS[lltvKey];
  
  if (lltv === undefined) {
    throw new Error(`Invalid LLTV. Options: ${Object.keys(LLTV_OPTIONS).join(', ')}`);
  }

  console.log('═'.repeat(60));
  console.log('  CREATE MORPHO MARKET');
  console.log('═'.repeat(60));
  console.log(`\n📊 Configuration:`);
  console.log(`   Token: ${tokenAddress}`);
  console.log(`   LLTV: ${lltvKey}%`);
  console.log(`   Loan Asset: USDC`);

  const publicClient = getPublicClient();

  // Step 1: Find V3 pool
  console.log('\n📌 Step 1: Validate Uniswap V3 Pool');
  const poolInfo = await findV3Pool(tokenAddress);

  if (!poolInfo) {
    console.log('\n❌ Cannot create market: No V3 pool exists');
    console.log('   The token needs a Uniswap V3 pool with WETH');
    console.log('   (Uniswap V4 pools are not compatible with Morpho TWAP oracles)');
    return null;
  }

  // Step 2: Get WETH/USDC pool
  console.log('\n📌 Step 2: Locate WETH/USDC Pool');
  const wethUsdcPool = await findWethUsdcPool();
  console.log(`   ✅ WETH/USDC pool: ${wethUsdcPool}`);

  if (options.dryRun) {
    console.log('\n🔍 DRY RUN - Would create:');
    console.log('   1. Two-hop TWAP oracle (TOKEN → WETH → USDC)');
    console.log('   2. Morpho Blue market with above oracle');

    console.log(`\n   Market Parameters:`);
    console.log(`     Loan Token: ${USDC} (USDC)`);
    console.log(`     Collateral: ${tokenAddress}`);
    console.log(`     IRM: ${ADAPTIVE_CURVE_IRM}`);
    console.log(`     LLTV: ${lltv}`);

    return null;
  }

  const account = getAccount();
  const walletClient = getWalletClient();

  // Step 3: Create TWAP Oracle
  console.log('\n📌 Step 3: Create TWAP Oracle');
  console.log('   Creating two-hop oracle: TOKEN → WETH → USDC');

  const oracleTxHash = await withRetry(async () => {
    const { request } = await publicClient.simulateContract({
      address: TWAP_ORACLE_FACTORY,
      abi: TWAP_FACTORY_ABI,
      functionName: 'createTwoHopOracle',
      args: [
        poolInfo.pool,
        wethUsdcPool,
        tokenAddress,
        WETH,
        USDC,
        300, // 5-minute TWAP
      ],
      account: account.address,
    });

    return walletClient.writeContract(request);
  }, { retries: 2 });

  console.log(`   TX: https://basescan.org/tx/${oracleTxHash}`);

  const oracleReceipt = await publicClient.waitForTransactionReceipt({ hash: oracleTxHash });
  const oracleAddress = extractOracleAddress(oracleReceipt.logs);
  
  console.log(`   ✅ Oracle created: ${oracleAddress}`);
  console.log(`   Block: ${oracleReceipt.blockNumber}`);
  console.log(`   Gas used: ${oracleReceipt.gasUsed}`);

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

  const marketTxHash = await withRetry(async () => {
    const { request } = await publicClient.simulateContract({
      address: MORPHO_BLUE,
      abi: MORPHO_ABI,
      functionName: 'createMarket',
      args: [marketParams],
      account: account.address,
    });

    return walletClient.writeContract(request);
  }, { retries: 2 });

  console.log(`   TX: https://basescan.org/tx/${marketTxHash}`);

  const marketReceipt = await publicClient.waitForTransactionReceipt({ hash: marketTxHash });
  
  console.log(`   ✅ Market created!`);
  console.log(`   Block: ${marketReceipt.blockNumber}`);
  console.log(`   Gas used: ${marketReceipt.gasUsed}`);

  console.log('\n═'.repeat(60));
  console.log('  MARKET CREATION COMPLETE');
  console.log('═'.repeat(60));
  console.log(`\n📊 Summary:`);
  console.log(`   Market ID: ${marketId}`);
  console.log(`   Oracle: ${oracleAddress}`);
  console.log(`   Collateral: ${tokenAddress}`);
  console.log(`   Borrow: USDC`);
  console.log(`   LLTV: ${lltvKey}%`);

  return { marketId, oracleAddress, marketParams };
}

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

  const tokenAddress = validateAddress(args[tokenIndex + 1], 'token address');
  const lltv = lltvIndex !== -1 ? args[lltvIndex + 1] : '38.5';

  await createMarket(tokenAddress, { lltv, dryRun });
}

const isMainModule = process.argv[1]?.endsWith('create-market.ts');
if (isMainModule) {
  main().catch(console.error);
}

// createMarket already exported at definition
