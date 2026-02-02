/**
 * auto-topup.ts
 * 
 * Automated credit monitoring and replenishment.
 * The complete self-funding autonomy loop for AI agents.
 * 
 * This script:
 * 1. Monitors OpenRouter credit balance
 * 2. When balance drops below threshold, triggers purchase
 * 3. Uses ETH on Base (from Clawnch trading fees) to buy credits
 * 4. Logs all activity for transparency
 * 
 * Usage:
 *   # Run once (check and top-up if needed)
 *   OPENROUTER_API_KEY=sk-... PRIVATE_KEY=0x... npx tsx auto-topup.ts
 *   
 *   # Run with custom thresholds
 *   npx tsx auto-topup.ts --min-balance 10 --topup-amount 20
 *   
 *   # Daemon mode (check every 5 minutes)
 *   npx tsx auto-topup.ts --daemon --interval 300
 */

import 'dotenv/config';
import { createPublicClient, http, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { checkCredits } from './check-credits';
import { purchaseCredits } from './purchase-credits';

interface TopupConfig {
  minBalance: number;      // Minimum balance before triggering top-up ($)
  topupAmount: number;     // Amount to purchase when topping up ($)
  maxEthPerTopup: number;  // Maximum ETH to spend per top-up
  daemon: boolean;         // Run continuously
  intervalSeconds: number; // Check interval in daemon mode
  dryRun: boolean;         // Don't execute transactions
}

const DEFAULT_CONFIG: TopupConfig = {
  minBalance: 5,
  topupAmount: 10,
  maxEthPerTopup: 0.01, // ~$23 at $2300/ETH
  daemon: false,
  intervalSeconds: 300,
  dryRun: false,
};

async function checkWalletBalance(address: `0x${string}`): Promise<bigint> {
  const publicClient = createPublicClient({
    chain: base,
    transport: http('https://mainnet.base.org'),
  });
  return publicClient.getBalance({ address });
}

async function runTopupCheck(config: TopupConfig): Promise<{
  creditsBefore: number;
  creditsAfter: number;
  topupExecuted: boolean;
  txHash?: string;
}> {
  console.log('\n' + '='.repeat(60));
  console.log(`🤖 UPSKILL Auto-Topup Check - ${new Date().toISOString()}`);
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
  const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
  const ethBalance = await checkWalletBalance(account.address);
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
    
    return {
      creditsBefore: credits.available,
      creditsAfter: credits.available,
      topupExecuted: false,
    };
  }

  if (config.dryRun) {
    console.log('\n🔍 DRY RUN - Would execute top-up');
    return {
      creditsBefore: credits.available,
      creditsAfter: credits.available,
      topupExecuted: false,
    };
  }

  // Execute purchase
  console.log('\n🚀 Executing credit purchase...');
  const txHash = await purchaseCredits(config.topupAmount, false);
  
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
    txHash,
  };
}

async function runDaemon(config: TopupConfig) {
  console.log('🔄 Starting auto-topup daemon...');
  console.log(`   Check interval: ${config.intervalSeconds}s`);
  console.log(`   Min balance: $${config.minBalance}`);
  console.log(`   Top-up amount: $${config.topupAmount}`);
  console.log('\nPress Ctrl+C to stop\n');

  while (true) {
    try {
      await runTopupCheck(config);
    } catch (error) {
      console.error('❌ Error during check:', error);
    }

    console.log(`\n⏰ Next check in ${config.intervalSeconds} seconds...`);
    await new Promise(resolve => setTimeout(resolve, config.intervalSeconds * 1000));
  }
}

// Parse command line arguments
function parseArgs(): TopupConfig {
  const args = process.argv.slice(2);
  const config = { ...DEFAULT_CONFIG };

  const getArg = (name: string, defaultVal: number): number => {
    const index = args.indexOf(`--${name}`);
    return index !== -1 ? parseFloat(args[index + 1]) : defaultVal;
  };

  config.minBalance = getArg('min-balance', DEFAULT_CONFIG.minBalance);
  config.topupAmount = getArg('topup-amount', DEFAULT_CONFIG.topupAmount);
  config.intervalSeconds = getArg('interval', DEFAULT_CONFIG.intervalSeconds);
  config.daemon = args.includes('--daemon');
  config.dryRun = args.includes('--dry-run');

  return config;
}

async function main() {
  const config = parseArgs();

  // Validate environment
  if (!process.env.OPENROUTER_API_KEY) {
    console.error('Error: OPENROUTER_API_KEY not set');
    process.exit(1);
  }

  if (!process.env.PRIVATE_KEY) {
    console.error('Error: PRIVATE_KEY not set');
    process.exit(1);
  }

  if (config.daemon) {
    await runDaemon(config);
  } else {
    await runTopupCheck(config);
  }
}

main().catch(console.error);

export { runTopupCheck, TopupConfig };
