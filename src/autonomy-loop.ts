/**
 * autonomy-loop.ts
 * 
 * THE COMPLETE AGENT AUTONOMY STACK
 * 
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                    UPSKILL AUTONOMY LOOP                        │
 * ├─────────────────────────────────────────────────────────────────┤
 * │                                                                 │
 * │  1. EARN: Token trading generates fees                         │
 * │     └── $UPSKILL trades on Uniswap V4 → 80% fees to us        │
 * │                                                                 │
 * │  2. CLAIM: Collect accumulated WETH fees                       │
 * │     └── Call Clanker FeeLocker.claim()                         │
 * │                                                                 │
 * │  3. FUND: Convert to API credits                               │
 * │     └── ETH on Base → OpenRouter credits                       │
 * │                                                                 │
 * │  4. OPERATE: Run agent tasks                                   │
 * │     └── Use credits for inference, spawn subagents             │
 * │                                                                 │
 * │  5. COORDINATE: Multi-agent task routing                       │
 * │     └── Token holdings = compute access                        │
 * │                                                                 │
 * │  6. REPEAT: Monitor and auto-replenish                         │
 * │                                                                 │
 * └─────────────────────────────────────────────────────────────────┘
 * 
 * $UPSKILL Contract: 0xccaee0bf50E5790243c1D58F3682765709edEB07
 * Gateway: https://upskill-gateway-production.up.railway.app
 */

import 'dotenv/config';
import { formatEther } from 'viem';
import {
  getPublicClient,
  getAccount,
  UPSKILL_TOKEN,
  requireEnv,
  RecoverableError,
  isRecoverable,
  parseArgs,
  wantsHelp,
  printHelp,
  type CliConfig,
} from './lib/index.js';
import { checkFees } from './fee-claiming/check-fees.js';
import { claimFees } from './fee-claiming/claim-fees.js';
import { checkCredits } from './self-funding/check-credits.js';
import { purchaseCredits } from './self-funding/purchase-credits.js';
import { getAgentInfo } from './coordination/task-dispatcher.js';

// Configuration (from env with sensible defaults)
const CONFIG = {
  upskillToken: UPSKILL_TOKEN,
  minCredits: parseFloat(process.env.MIN_CREDITS || '5'),
  creditPurchaseAmount: parseFloat(process.env.CREDIT_PURCHASE_AMOUNT || '10'),
  minWethForTopup: parseFloat(process.env.MIN_WETH_FOR_TOPUP || '0.002'),
  gatewayUrl: process.env.UPSKILL_GATEWAY_URL || 'https://upskill-gateway-production.up.railway.app',
  checkInterval: parseInt(process.env.CHECK_INTERVAL_MS || '300000', 10),
} as const;

// Loop state tracking
interface LoopState {
  lastFeeCheck: Date | null;
  lastCreditCheck: Date | null;
  totalWethClaimed: bigint;
  totalCreditsPurchased: number;
  tasksExecuted: number;
  cycleCount: number;
}

const state: LoopState = {
  lastFeeCheck: null,
  lastCreditCheck: null,
  totalWethClaimed: 0n,
  totalCreditsPurchased: 0,
  tasksExecuted: 0,
  cycleCount: 0,
};

function log(emoji: string, message: string) {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${timestamp}] ${emoji} ${message}`);
}

async function checkAndClaimFees(): Promise<bigint> {
  const account = getAccount();

  log('🔍', 'Checking accumulated trading fees...');

  const feeInfo = await checkFees(account.address, CONFIG.upskillToken);
  state.lastFeeCheck = new Date();

  log('📊', `WETH fees: ${feeInfo.wethFeesFormatted} WETH`);

  const wethFeesFloat = parseFloat(feeInfo.wethFeesFormatted);

  if (wethFeesFloat < CONFIG.minWethForTopup) {
    log('ℹ️', `Fees below threshold (${CONFIG.minWethForTopup} WETH), skipping claim`);
    return 0n;
  }

  log('💰', 'Claiming WETH fees...');
  const result = await claimFees(CONFIG.upskillToken, { claimBoth: false });

  if (result.wethClaimed > 0n) {
    state.totalWethClaimed += result.wethClaimed;
    log('✅', `Claimed ${formatEther(result.wethClaimed)} WETH!`);
  }

  return result.wethClaimed;
}

async function checkAndTopupCredits(): Promise<boolean> {
  log('🔍', 'Checking OpenRouter credit balance...');

  const credits = await checkCredits();
  state.lastCreditCheck = new Date();

  log('📊', `Available credits: $${credits.available.toFixed(2)}`);

  if (credits.available >= CONFIG.minCredits) {
    log('✅', 'Credit balance healthy');
    return false;
  }

  log('⚠️', `Credits low! Purchasing $${CONFIG.creditPurchaseAmount}...`);
  await purchaseCredits(CONFIG.creditPurchaseAmount);
  state.totalCreditsPurchased += CONFIG.creditPurchaseAmount;
  log('✅', 'Credits purchased successfully');

  return true;
}

async function runAutonomyCycle() {
  state.cycleCount++;
  const account = getAccount();

  console.log('\n' + '═'.repeat(60));
  log('🔄', `AUTONOMY CYCLE ${state.cycleCount}`);
  console.log('═'.repeat(60));

  // Fetch read-only data in parallel for efficiency
  console.log('\n📌 Step 1: Gathering Status (parallel)');
  const [feeInfo, credits, agentInfo] = await Promise.all([
    checkFees(account.address, CONFIG.upskillToken),
    checkCredits(),
    getAgentInfo(account.address),
  ]);

  state.lastFeeCheck = new Date();
  state.lastCreditCheck = new Date();

  log('📊', `WETH fees: ${feeInfo.wethFeesFormatted} WETH`);
  log('📊', `Credits: $${credits.available.toFixed(2)}`);
  log('📊', `UPSKILL: ${agentInfo.balanceFormatted} (${agentInfo.tier})`);

  // Step 2: Claim fees if above threshold
  console.log('\n📌 Step 2: Fee Management');
  const wethFeesFloat = parseFloat(feeInfo.wethFeesFormatted);

  if (wethFeesFloat >= CONFIG.minWethForTopup && feeInfo.wethFees > 0n) {
    log('💰', 'Claiming WETH fees...');
    try {
      const result = await claimFees(CONFIG.upskillToken, { claimBoth: false });
      if (result.wethClaimed > 0n) {
        state.totalWethClaimed += result.wethClaimed;
        log('✅', `Claimed ${formatEther(result.wethClaimed)} WETH!`);
      }
    } catch (error) {
      if (isRecoverable(error)) {
        log('⚠️', `Fee claim skipped: ${error.message}`);
      } else {
        throw error;
      }
    }
  } else {
    log('ℹ️', `Fees below threshold (${CONFIG.minWethForTopup} WETH)`);
  }

  // Step 3: Top up credits if low
  console.log('\n📌 Step 3: Credit Management');
  if (credits.available < CONFIG.minCredits) {
    log('⚠️', `Credits low! Purchasing $${CONFIG.creditPurchaseAmount}...`);
    try {
      await purchaseCredits(CONFIG.creditPurchaseAmount);
      state.totalCreditsPurchased += CONFIG.creditPurchaseAmount;
      log('✅', 'Credits purchased successfully');
    } catch (error) {
      if (isRecoverable(error)) {
        log('⚠️', `Credit purchase skipped: ${error.message}`);
      } else {
        throw error;
      }
    }
  } else {
    log('✅', 'Credit balance healthy');
  }

  // Summary
  console.log('\n' + '─'.repeat(60));
  log('📈', 'CYCLE SUMMARY');
  console.log(`   Total WETH claimed: ${formatEther(state.totalWethClaimed)} WETH`);
  console.log(`   Total credits purchased: $${state.totalCreditsPurchased}`);
  console.log(`   Tasks executed: ${state.tasksExecuted}`);
  console.log(`   Cycles completed: ${state.cycleCount}`);
  console.log('─'.repeat(60));
}

// Graceful shutdown handling
let running = true;
const MAX_CONSECUTIVE_FAILURES = 5;

process.on('SIGINT', () => {
  log('🛑', 'Received SIGINT, shutting down gracefully...');
  running = false;
});

process.on('SIGTERM', () => {
  log('🛑', 'Received SIGTERM, shutting down gracefully...');
  running = false;
});

async function runDaemon() {
  console.log('\n' + '═'.repeat(60));
  console.log('  UPSKILL AUTONOMY DAEMON');
  console.log('  Self-Sustaining Agent Economy');
  console.log('═'.repeat(60));
  console.log(`\n🤖 Token: ${CONFIG.upskillToken}`);
  console.log(`🌐 Gateway: ${CONFIG.gatewayUrl}`);
  console.log(`⏰ Check Interval: ${CONFIG.checkInterval / 1000}s`);
  console.log('\nPress Ctrl+C to stop\n');

  let consecutiveFailures = 0;

  while (running) {
    const cycleStart = Date.now();

    try {
      await runAutonomyCycle();
      consecutiveFailures = 0;
    } catch (error) {
      consecutiveFailures++;

      if (isRecoverable(error)) {
        log('⚠️', `Recoverable error: ${error.message}`);
      } else {
        log('❌', `Cycle error (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}): ${error}`);
      }

      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        log('🛑', 'Too many consecutive failures, stopping daemon');
        process.exit(1);
      }
    }

    if (!running) break;

    const cycleDuration = Date.now() - cycleStart;
    const remainingWait = Math.max(0, CONFIG.checkInterval - cycleDuration);

    if (remainingWait > 0) {
      log('⏰', `Next cycle in ${(remainingWait / 1000).toFixed(1)}s...`);
      await new Promise((resolve) => setTimeout(resolve, remainingWait));
    }
  }

  log('👋', 'Daemon stopped gracefully');
}

async function runOnce() {
  console.log('\n' + '═'.repeat(60));
  console.log('  UPSKILL AUTONOMY LOOP - SINGLE RUN');
  console.log('═'.repeat(60));

  await runAutonomyCycle();

  console.log('\n✅ Single cycle complete');
  console.log('   Run with --daemon for continuous operation');
}

const CLI_CONFIG: CliConfig = {
  name: 'autonomy-loop',
  description: 'The complete agent autonomy stack - earn, claim, fund, operate, repeat.',
  usage: 'npx tsx autonomy-loop.ts [options]',
  options: [
    { name: 'daemon', short: 'd', description: 'Run continuously with automatic replenishment' },
  ],
  examples: [
    'npx tsx autonomy-loop.ts           # Single cycle',
    'npx tsx autonomy-loop.ts --daemon  # Run continuously',
  ],
};

async function main() {
  const args = parseArgs();
  
  if (wantsHelp(args)) {
    printHelp(CLI_CONFIG);
    process.exit(0);
  }

  // Validate environment
  requireEnv('PRIVATE_KEY');

  const daemonMode = args.daemon === true || args.d === true;

  if (daemonMode) {
    await runDaemon();
  } else {
    await runOnce();
  }
}

main().catch((error) => {
  log('❌', `Fatal error: ${error.message}`);
  process.exit(1);
});

export { runAutonomyCycle, state as loopState, CONFIG };
