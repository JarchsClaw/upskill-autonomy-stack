/**
 * auto-topup.ts
 * 
 * Automated credit monitoring and replenishment.
 * The complete self-funding autonomy loop for AI agents.
 * 
 * Usage:
 *   OPENROUTER_API_KEY=sk-... PRIVATE_KEY=0x... npx tsx auto-topup.ts
 *   npx tsx auto-topup.ts --min-balance 10 --topup-amount 20
 *   npx tsx auto-topup.ts --daemon --interval 300
 */

import 'dotenv/config';
import { formatEther } from 'viem';
import {
  getPublicClient,
  getAccount,
  requireEnv,
  RecoverableError,
  isRecoverable,
  parseArgs as cliParseArgs,
  wantsHelp,
  printHelp,
  type CliConfig,
} from '../lib/index.js';
import { checkCredits, LOW_BALANCE_THRESHOLD } from './check-credits.js';
import { purchaseCredits } from './purchase-credits.js';

export interface TopupConfig {
  minBalance: number;
  topupAmount: number;
  maxEthPerTopup: number;
  daemon: boolean;
  intervalSeconds: number;
  dryRun: boolean;
}

const DEFAULT_CONFIG: TopupConfig = {
  minBalance: parseFloat(process.env.MIN_CREDITS || '5'),
  topupAmount: parseFloat(process.env.CREDIT_PURCHASE_AMOUNT || '10'),
  maxEthPerTopup: 0.01,
  daemon: false,
  intervalSeconds: parseInt(process.env.CHECK_INTERVAL_MS || '300000', 10) / 1000,
  dryRun: false,
};

async function checkWalletBalance(): Promise<bigint> {
  const publicClient = getPublicClient();
  const account = getAccount();
  return publicClient.getBalance({ address: account.address });
}

async function runTopupCheck(config: TopupConfig): Promise<{
  creditsBefore: number;
  creditsAfter: number;
  topupExecuted: boolean;
  txHash?: string;
}> {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.log('\n' + '='.repeat(60));
  console.log(`[${timestamp}] 🔄 AUTONOMY CYCLE`);
  console.log('='.repeat(60));

  // Check current credit balance
  const credits = await checkCredits();
  console.log(`\n💳 Current OpenRouter Balance: $${credits.available.toFixed(2)}`);
  console.log(`   Threshold: $${config.minBalance}`);

  if (credits.available >= config.minBalance) {
    console.log('\n✅ Balance healthy - no top-up needed');
    return {
      creditsBefore: credits.available,
      creditsAfter: credits.available,
      topupExecuted: false,
    };
  }

  console.log(`\n⚠️  Balance below threshold! Initiating top-up...`);
  console.log(`   Target top-up: $${config.topupAmount}`);

  // Check wallet ETH balance
  const account = getAccount();
  const ethBalance = await checkWalletBalance();
  const ethBalanceFloat = parseFloat(formatEther(ethBalance));

  console.log(`\n🔐 Wallet: ${account.address}`);
  console.log(`   ETH Balance: ${formatEther(ethBalance)} ETH`);

  if (ethBalanceFloat < config.maxEthPerTopup) {
    console.log(`\n❌ Insufficient ETH for top-up`);
    console.log(`   Need: ~${config.maxEthPerTopup} ETH`);
    console.log(`   Have: ${ethBalanceFloat.toFixed(6)} ETH`);
    console.log('\n💡 Options:');
    console.log('   1. Claim trading fees from your Clawnch tokens');
    console.log('   2. Transfer ETH to wallet');
    console.log('   3. Swap WETH to ETH');

    throw new RecoverableError('Insufficient ETH for top-up');
  }

  if (config.dryRun) {
    console.log('\n🔍 DRY RUN - Would execute top-up');
    return {
      creditsBefore: credits.available,
      creditsAfter: credits.available,
      topupExecuted: false,
    };
  }

  // Execute purchase with known balance to avoid extra RPC call
  console.log('\n🚀 Executing credit purchase...');
  const txHash = await purchaseCredits(config.topupAmount, { knownBalance: ethBalance });

  // Check new balance
  const newCredits = await checkCredits();

  console.log('\n📊 Top-up complete!');
  console.log(`   Before: $${credits.available.toFixed(2)}`);
  console.log(`   After:  $${newCredits.available.toFixed(2)}`);
  console.log(`   Added:  $${(newCredits.available - credits.available).toFixed(2)}`);

  return {
    creditsBefore: credits.available,
    creditsAfter: newCredits.available,
    topupExecuted: true,
    txHash: txHash ?? undefined,
  };
}

// Graceful shutdown handling
let running = true;
const MAX_CONSECUTIVE_FAILURES = 5;

process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  running = false;
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  running = false;
});

async function runDaemon(config: TopupConfig) {
  console.log('🔄 Starting auto-topup daemon...');
  console.log(`   Check interval: ${config.intervalSeconds}s`);
  console.log(`   Min balance: $${config.minBalance}`);
  console.log(`   Top-up amount: $${config.topupAmount}`);
  console.log('\nPress Ctrl+C to stop\n');

  let consecutiveFailures = 0;

  while (running) {
    const cycleStart = Date.now();

    try {
      await runTopupCheck(config);
      consecutiveFailures = 0;
    } catch (error) {
      consecutiveFailures++;

      if (isRecoverable(error)) {
        console.log(`\n⚠️ Recoverable error: ${error.message}`);
      } else {
        console.error(`\n❌ Error during check (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}):`, error);
      }

      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.error('\n🛑 Too many consecutive failures, stopping daemon');
        process.exit(1);
      }
    }

    if (!running) break;

    // Calculate remaining wait time
    const cycleDuration = Date.now() - cycleStart;
    const remainingWait = Math.max(0, config.intervalSeconds * 1000 - cycleDuration);

    if (remainingWait > 0) {
      console.log(`\n⏰ Next check in ${(remainingWait / 1000).toFixed(1)}s...`);
      await new Promise((resolve) => setTimeout(resolve, remainingWait));
    }
  }

  console.log('\n👋 Daemon stopped gracefully');
}

const CLI_CONFIG: CliConfig = {
  name: 'auto-topup',
  description: 'Automated credit monitoring and replenishment daemon.',
  usage: 'npx tsx auto-topup.ts [options]',
  options: [
    { name: 'min-balance', description: 'Minimum credit balance before top-up', default: '5' },
    { name: 'topup-amount', description: 'USD amount to purchase when topping up', default: '10' },
    { name: 'interval', description: 'Check interval in seconds (daemon mode)', default: '300' },
    { name: 'daemon', short: 'd', description: 'Run continuously in daemon mode' },
    { name: 'dry-run', description: 'Simulate without executing transactions' },
  ],
  examples: [
    'npx tsx auto-topup.ts                    # Single check',
    'npx tsx auto-topup.ts --daemon           # Run continuously',
    'npx tsx auto-topup.ts -d --interval 600  # Check every 10 minutes',
    'npx tsx auto-topup.ts --dry-run          # Simulate',
  ],
};

function parseLocalArgs(): TopupConfig {
  const args = cliParseArgs();
  const config = { ...DEFAULT_CONFIG };

  if (args['min-balance']) config.minBalance = parseFloat(args['min-balance'] as string);
  if (args['topup-amount']) config.topupAmount = parseFloat(args['topup-amount'] as string);
  if (args['interval']) config.intervalSeconds = parseFloat(args['interval'] as string);
  config.daemon = args.daemon === true || args.d === true;
  config.dryRun = args['dry-run'] === true;

  return config;
}

async function main() {
  const args = cliParseArgs();
  
  if (wantsHelp(args)) {
    printHelp(CLI_CONFIG);
    process.exit(0);
  }
  
  const config = parseLocalArgs();

  // Validate environment
  requireEnv('OPENROUTER_API_KEY');
  requireEnv('PRIVATE_KEY');

  if (config.daemon) {
    await runDaemon(config);
  } else {
    await runTopupCheck(config);
  }
}

const isMainModule = process.argv[1]?.endsWith('auto-topup.ts');
if (isMainModule) {
  main().catch((error) => {
    console.error('❌ Error:', error.message);
    process.exit(1);
  });
}

// runTopupCheck and TopupConfig already exported at definition
