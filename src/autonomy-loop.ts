/**
 * autonomy-loop.ts
 * 
 * THE COMPLETE AGENT AUTONOMY STACK
 * 
 * This script demonstrates the full self-sustaining agent economy:
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
 * │     └── Low credits → claim more fees → buy more credits       │
 * │                                                                 │
 * └─────────────────────────────────────────────────────────────────┘
 * 
 * Built for the Clawnch Bounty - demonstrating real agent autonomy.
 * $UPSKILL Contract: 0xccaee0bf50E5790243c1D58F3682765709edEB07
 * Gateway: https://upskill-gateway-production.up.railway.app
 */

import 'dotenv/config';
import { createPublicClient, http, formatEther, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

// Import our modules
import { checkFees, FEE_LOCKER_ADDRESS, WETH_ADDRESS } from './fee-claiming/check-fees';
import { claimFees } from './fee-claiming/claim-fees';
import { checkCredits } from './self-funding/check-credits';
import { purchaseCredits } from './self-funding/purchase-credits';
import { getAgentInfo, dispatchTask, UPSKILL_TOKEN } from './coordination/task-dispatcher';

// Configuration
const CONFIG = {
  // Token addresses
  upskillToken: UPSKILL_TOKEN,
  
  // Thresholds
  minCredits: 5,           // Minimum OpenRouter credits before top-up ($)
  creditPurchaseAmount: 10, // Amount to purchase when topping up ($)
  minWethForTopup: 0.002,   // Minimum WETH needed to justify claiming (~$5)
  
  // Gateway
  gatewayUrl: process.env.UPSKILL_GATEWAY_URL || 'https://upskill-gateway-production.up.railway.app',
  
  // Intervals (in ms)
  checkInterval: 5 * 60 * 1000, // 5 minutes
};

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
  const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
  
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
  
  try {
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
  } catch (error) {
    log('❌', `Credit check failed: ${error}`);
    return false;
  }
}

async function executeTask(skill: string, params: Record<string, unknown>): Promise<unknown> {
  const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
  
  log('📤', `Executing task: ${skill}`);
  
  const result = await dispatchTask({
    skill,
    params,
    agentWallet: account.address,
  });
  
  if (result.success) {
    state.tasksExecuted++;
    log('✅', `Task completed: ${result.taskId}`);
  } else {
    log('❌', `Task failed: ${result.error}`);
  }
  
  return result;
}

async function runAutonomyCycle() {
  state.cycleCount++;
  
  console.log('\n' + '═'.repeat(60));
  log('🔄', `AUTONOMY CYCLE ${state.cycleCount}`);
  console.log('═'.repeat(60));
  
  // Step 1: Check and claim fees
  console.log('\n📌 Step 1: Fee Collection');
  await checkAndClaimFees();
  
  // Step 2: Check and top-up credits
  console.log('\n📌 Step 2: Credit Management');
  await checkAndTopupCredits();
  
  // Step 3: Report agent status
  console.log('\n📌 Step 3: Agent Status');
  const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
  const agentInfo = await getAgentInfo(account.address);
  log('📊', `UPSKILL Balance: ${agentInfo.balanceFormatted}`);
  log('📊', `Tier: ${agentInfo.tier}`);
  log('📊', `Daily Quota: ${agentInfo.dailyQuota === Infinity ? 'Unlimited' : agentInfo.dailyQuota}`);
  
  // Summary
  console.log('\n' + '─'.repeat(60));
  log('📈', 'CYCLE SUMMARY');
  console.log(`   Total WETH claimed: ${formatEther(state.totalWethClaimed)} WETH`);
  console.log(`   Total credits purchased: $${state.totalCreditsPurchased}`);
  console.log(`   Tasks executed: ${state.tasksExecuted}`);
  console.log(`   Cycles completed: ${state.cycleCount}`);
  console.log('─'.repeat(60));
}

async function runDaemon() {
  console.log('\n' + '═'.repeat(60));
  console.log('  UPSKILL AUTONOMY DAEMON');
  console.log('  Self-Sustaining Agent Economy');
  console.log('═'.repeat(60));
  console.log(`\n🤖 Token: ${CONFIG.upskillToken}`);
  console.log(`🌐 Gateway: ${CONFIG.gatewayUrl}`);
  console.log(`⏰ Check Interval: ${CONFIG.checkInterval / 1000}s`);
  console.log('\nPress Ctrl+C to stop\n');
  
  // Run initial cycle
  await runAutonomyCycle();
  
  // Continue running
  while (true) {
    log('⏰', `Next cycle in ${CONFIG.checkInterval / 1000}s...`);
    await new Promise(resolve => setTimeout(resolve, CONFIG.checkInterval));
    await runAutonomyCycle();
  }
}

async function runOnce() {
  console.log('\n' + '═'.repeat(60));
  console.log('  UPSKILL AUTONOMY LOOP - SINGLE RUN');
  console.log('═'.repeat(60));
  
  await runAutonomyCycle();
  
  console.log('\n✅ Single cycle complete');
  console.log('   Run with --daemon for continuous operation');
}

// Main entry point
async function main() {
  // Validate environment
  if (!process.env.PRIVATE_KEY) {
    console.error('Error: PRIVATE_KEY not set');
    console.error('Set your wallet private key to participate in the autonomy loop');
    process.exit(1);
  }
  
  const args = process.argv.slice(2);
  const daemonMode = args.includes('--daemon');
  
  if (daemonMode) {
    await runDaemon();
  } else {
    await runOnce();
  }
}

main().catch(console.error);

export { runAutonomyCycle, state as loopState, CONFIG };
