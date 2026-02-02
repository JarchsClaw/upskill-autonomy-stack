/**
 * task-dispatcher.ts
 * 
 * Multi-agent task coordination using $UPSKILL tokens.
 * 
 * Token holdings determine compute access tiers:
 * - Free:      0 tokens      → 10 tasks/day
 * - Basic:     10,000 tokens → 100 tasks/day
 * - Pro:       100,000 tokens → 1,000 tasks/day
 * - Unlimited: 1,000,000 tokens → unlimited
 */

import 'dotenv/config';
import { formatUnits, parseUnits, type Address } from 'viem';
import {
  getPublicClient,
  getAccount,
  ERC20_ABI,
  UPSKILL_TOKEN,
  validateAddress,
  fetchWithRetry,
} from '../lib/index.js';

// Gateway API endpoint
const GATEWAY_URL = process.env.UPSKILL_GATEWAY_URL || 'https://upskill-gateway-production.up.railway.app';

// Tier definitions (sorted by threshold descending for efficient lookup)
const TIER_THRESHOLDS = [
  { name: 'Unlimited (1M)', threshold: parseUnits('1000000', 18), quota: Infinity },
  { name: 'Pro (100K)', threshold: parseUnits('100000', 18), quota: 1000 },
  { name: 'Basic (10K)', threshold: parseUnits('10000', 18), quota: 100 },
  { name: 'Free', threshold: 0n, quota: 10 },
] as const;

type Tier = typeof TIER_THRESHOLDS[number];

export interface AgentInfo {
  wallet: Address;
  balance: bigint;
  balanceFormatted: string;
  tier: string;
  dailyQuota: number;
}

export interface TaskRequest {
  skill: string;
  params: Record<string, unknown>;
  agentWallet: Address;
  priority?: 'low' | 'normal' | 'high';
}

export interface TaskResult {
  success: boolean;
  taskId: string;
  skill: string;
  result?: unknown;
  error?: string;
  quotaRemaining?: number;
}

/**
 * Get tier for a given token balance.
 */
function getTierForBalance(balance: bigint): Tier {
  for (const tier of TIER_THRESHOLDS) {
    if (balance >= tier.threshold) {
      return tier;
    }
  }
  return TIER_THRESHOLDS[TIER_THRESHOLDS.length - 1];
}

/**
 * Get agent info including token balance and tier.
 */
export async function getAgentInfo(walletAddress: Address): Promise<AgentInfo> {
  const publicClient = getPublicClient();

  const balance = await publicClient.readContract({
    address: UPSKILL_TOKEN,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [walletAddress],
  });

  const tier = getTierForBalance(balance);

  return {
    wallet: walletAddress,
    balance,
    balanceFormatted: formatUnits(balance, 18),
    tier: tier.name,
    dailyQuota: tier.quota,
  };
}

/**
 * Dispatch a task to the UPSKILL gateway.
 */
export async function dispatchTask(request: TaskRequest): Promise<TaskResult> {
  const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  console.log(`\n📋 Task ${taskId}`);
  console.log(`   Skill: ${request.skill}`);
  console.log(`   Agent: ${request.agentWallet}`);
  console.log(`   Priority: ${request.priority || 'normal'}`);

  try {
    // Verify agent holdings and quota
    const agentInfo = await getAgentInfo(request.agentWallet);
    console.log(`   Tier: ${agentInfo.tier}`);
    console.log(`   UPSKILL Balance: ${agentInfo.balanceFormatted}`);

    // Call gateway API with retry
    const result = await fetchWithRetry<unknown>(
      `${GATEWAY_URL}/skill/${request.skill}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Wallet-Address': request.agentWallet,
        },
        body: JSON.stringify(request.params),
      },
      { retries: 2 }
    );

    console.log(`   ✅ Task completed`);

    return {
      success: true,
      taskId,
      skill: request.skill,
      result,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.log(`   ❌ Task failed: ${errorMessage}`);

    return {
      success: false,
      taskId,
      skill: request.skill,
      error: errorMessage,
    };
  }
}

/**
 * Dispatch multiple tasks (sequential or parallel).
 */
export async function batchDispatch(
  tasks: TaskRequest[],
  options: { parallel?: boolean } = {}
): Promise<TaskResult[]> {
  console.log(`\n🚀 Batch dispatch: ${tasks.length} tasks`);
  console.log(`   Mode: ${options.parallel ? 'parallel' : 'sequential'}`);

  if (options.parallel) {
    return Promise.all(tasks.map((task) => dispatchTask(task)));
  }

  const results: TaskResult[] = [];
  for (const task of tasks) {
    const result = await dispatchTask(task);
    results.push(result);
  }
  return results;
}

async function demo() {
  console.log('═'.repeat(60));
  console.log('  UPSKILL Task Dispatcher Demo');
  console.log('  Agent Coordination via Token Holdings');
  console.log('═'.repeat(60));

  // Get our wallet info
  let walletAddress: Address;
  
  try {
    const account = getAccount();
    walletAddress = account.address;
  } catch {
    // Use demo address if no private key
    walletAddress = '0xede1a30a8b04cca77ecc8d690c552ac7b0d63817' as Address;
  }

  console.log('\n📊 Agent Status:');
  const info = await getAgentInfo(walletAddress);
  console.log(`   Wallet: ${walletAddress.slice(0, 10)}...${walletAddress.slice(-8)}`);
  console.log(`   UPSKILL: ${info.balanceFormatted}`);
  console.log(`   Tier: ${info.tier}`);
  console.log(`   Daily Quota: ${info.dailyQuota === Infinity ? 'Unlimited' : info.dailyQuota}`);

  // Example task dispatch
  console.log('\n📤 Dispatching test task...');

  const result = await dispatchTask({
    skill: 'trade',
    params: {
      action: 'quote',
      token: 'ETH',
      amount: '0.01',
    },
    agentWallet: walletAddress,
    priority: 'normal',
  });

  if (process.env.DEBUG) {
    console.log('\n📊 Result:', JSON.stringify(result, null, 2));
  } else {
    console.log(`\n📊 Result: success=${result.success} taskId=${result.taskId}`);
  }

  console.log('\n═'.repeat(60));
  console.log('  Coordination Flow Complete');
  console.log('═'.repeat(60));
  console.log('\n💡 The UPSKILL model:');
  console.log('   1. Agents hold tokens → get compute access');
  console.log('   2. Tasks generate fees → 80% back to token holders');
  console.log('   3. More usage → more fees → more value → more agents');
  console.log('   4. Self-sustaining agent compute economy');
}

const isMainModule = process.argv[1]?.endsWith('task-dispatcher.ts');
if (isMainModule) {
  demo().catch(console.error);
}

// Functions already exported at definition; re-export constants for convenience
export { TIER_THRESHOLDS };
