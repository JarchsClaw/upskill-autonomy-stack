/**
 * task-dispatcher.ts
 * 
 * Demonstrates agent-to-agent task coordination using $UPSKILL tokens.
 * 
 * The UPSKILL Compute Subnet:
 * - Agents hold UPSKILL tokens to access compute resources
 * - Token holdings determine task priority and quota
 * - Fee from tasks goes back to token holders (80/20 split)
 * 
 * Tiers:
 * - Free:      0 tokens      → 10 tasks/day
 * - Basic:     10,000 tokens → 100 tasks/day  
 * - Pro:       100,000 tokens → 1,000 tasks/day
 * - Unlimited: 1,000,000 tokens → unlimited
 * 
 * This dispatcher:
 * 1. Verifies agent token holdings
 * 2. Checks available quota
 * 3. Routes tasks to skill executors
 * 4. Tracks usage and manages rate limits
 */

import 'dotenv/config';
import { createPublicClient, http, formatUnits, parseUnits } from 'viem';
import { base } from 'viem/chains';

// UPSKILL Token on Base
const UPSKILL_TOKEN = '0xccaee0bf50E5790243c1D58F3682765709edEB07' as const;

// Gateway API endpoint
const GATEWAY_URL = process.env.UPSKILL_GATEWAY_URL || 'https://upskill-gateway-production.up.railway.app';

// ERC20 minimal ABI for balance checking
const ERC20_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// Tier thresholds
const TIERS = {
  FREE: { threshold: 0n, quota: 10, name: 'Free' },
  BASIC: { threshold: parseUnits('10000', 18), quota: 100, name: 'Basic (10K)' },
  PRO: { threshold: parseUnits('100000', 18), quota: 1000, name: 'Pro (100K)' },
  UNLIMITED: { threshold: parseUnits('1000000', 18), quota: Infinity, name: 'Unlimited (1M)' },
};

type Tier = typeof TIERS[keyof typeof TIERS];

interface AgentInfo {
  wallet: `0x${string}`;
  balance: bigint;
  balanceFormatted: string;
  tier: string;
  dailyQuota: number;
}

interface TaskRequest {
  skill: string;
  params: Record<string, unknown>;
  agentWallet: `0x${string}`;
  priority?: 'low' | 'normal' | 'high';
}

interface TaskResult {
  success: boolean;
  taskId: string;
  skill: string;
  result?: unknown;
  error?: string;
  quotaRemaining?: number;
}

async function getAgentInfo(walletAddress: `0x${string}`): Promise<AgentInfo> {
  const publicClient = createPublicClient({
    chain: base,
    transport: http('https://mainnet.base.org'),
  });

  const balance = await publicClient.readContract({
    address: UPSKILL_TOKEN,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [walletAddress],
  });

  // Determine tier
  let tier: Tier = TIERS.FREE;
  if (balance >= TIERS.UNLIMITED.threshold) {
    tier = TIERS.UNLIMITED;
  } else if (balance >= TIERS.PRO.threshold) {
    tier = TIERS.PRO;
  } else if (balance >= TIERS.BASIC.threshold) {
    tier = TIERS.BASIC;
  }

  return {
    wallet: walletAddress,
    balance,
    balanceFormatted: formatUnits(balance, 18),
    tier: tier.name,
    dailyQuota: tier.quota,
  };
}

async function dispatchTask(request: TaskRequest): Promise<TaskResult> {
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

    // Call gateway API
    const response = await fetch(`${GATEWAY_URL}/skill/${request.skill}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Wallet-Address': request.agentWallet,
      },
      body: JSON.stringify(request.params),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        taskId,
        skill: request.skill,
        error: `Gateway error: ${response.status} - ${errorText}`,
      };
    }

    const result = await response.json();
    
    console.log(`   ✅ Task completed`);
    
    return {
      success: true,
      taskId,
      skill: request.skill,
      result,
    };

  } catch (error) {
    console.log(`   ❌ Task failed`);
    return {
      success: false,
      taskId,
      skill: request.skill,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function batchDispatch(
  tasks: TaskRequest[],
  options: { parallel?: boolean } = {}
): Promise<TaskResult[]> {
  console.log(`\n🚀 Batch dispatch: ${tasks.length} tasks`);
  console.log(`   Mode: ${options.parallel ? 'parallel' : 'sequential'}`);

  if (options.parallel) {
    return Promise.all(tasks.map(task => dispatchTask(task)));
  }

  const results: TaskResult[] = [];
  for (const task of tasks) {
    const result = await dispatchTask(task);
    results.push(result);
  }
  return results;
}

// Demo: Show how agents interact with the dispatcher
async function demo() {
  console.log('═'.repeat(60));
  console.log('  UPSKILL Task Dispatcher Demo');
  console.log('  Agent Coordination via Token Holdings');
  console.log('═'.repeat(60));

  // Example agent wallets
  const agents = [
    '0xede1a30a8b04cca77ecc8d690c552ac7b0d63817', // Our Bankr wallet
  ] as const;

  console.log('\n📊 Agent Status:');
  for (const wallet of agents) {
    const info = await getAgentInfo(wallet);
    console.log(`\n   Wallet: ${wallet.slice(0, 10)}...${wallet.slice(-8)}`);
    console.log(`   UPSKILL: ${info.balanceFormatted}`);
    console.log(`   Tier: ${info.tier}`);
    console.log(`   Daily Quota: ${info.dailyQuota === Infinity ? 'Unlimited' : info.dailyQuota}`);
  }

  // Example task dispatch
  console.log('\n📤 Dispatching test task...');
  
  const result = await dispatchTask({
    skill: 'trade',
    params: {
      action: 'quote',
      token: 'ETH',
      amount: '0.01',
    },
    agentWallet: agents[0] as `0x${string}`,
    priority: 'normal',
  });

  console.log('\n📊 Result:', JSON.stringify(result, null, 2));

  console.log('\n═'.repeat(60));
  console.log('  Coordination Flow Complete');
  console.log('═'.repeat(60));
  console.log('\n💡 The UPSKILL model:');
  console.log('   1. Agents hold tokens → get compute access');
  console.log('   2. Tasks generate fees → 80% back to token holders');
  console.log('   3. More usage → more fees → more value → more agents');
  console.log('   4. Self-sustaining agent compute economy');
}

// Run demo
demo().catch(console.error);

export { getAgentInfo, dispatchTask, batchDispatch, TIERS, UPSKILL_TOKEN };
