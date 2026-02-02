/**
 * check-credits.ts
 * 
 * Monitor OpenRouter API credit balance.
 * Part of the agent self-funding autonomy loop.
 * 
 * Usage: OPENROUTER_API_KEY=sk-... npx tsx check-credits.ts
 */

import 'dotenv/config';
import { requireEnv, fetchWithRetry } from '../lib/index.js';

interface CreditsResponse {
  data: {
    total_credits: number;
    total_usage: number;
  };
}

export interface CreditBalance {
  totalCredits: number;
  totalUsage: number;
  available: number;
  lowBalance: boolean;
}

/** Alert threshold in USD */
const LOW_BALANCE_THRESHOLD = 5;

/**
 * Check OpenRouter API credit balance.
 * @throws Error if API key is invalid or request fails
 */
export async function checkCredits(): Promise<CreditBalance> {
  const apiKey = requireEnv('OPENROUTER_API_KEY');

  const { data } = await fetchWithRetry<CreditsResponse>(
    'https://openrouter.ai/api/v1/credits',
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    },
    { retries: 2 }
  );

  const available = data.total_credits - data.total_usage;

  return {
    totalCredits: data.total_credits,
    totalUsage: data.total_usage,
    available,
    lowBalance: available < LOW_BALANCE_THRESHOLD,
  };
}

async function main() {
  console.log('🔍 Checking OpenRouter credit balance...\n');

  const credits = await checkCredits();

  console.log('📊 OpenRouter Credits:');
  console.log(`   Total Credits:  $${credits.totalCredits.toFixed(2)}`);
  console.log(`   Total Usage:    $${credits.totalUsage.toFixed(2)}`);
  console.log(`   Available:      $${credits.available.toFixed(2)}`);
  console.log('');

  if (credits.lowBalance) {
    console.log(`⚠️  LOW BALANCE ALERT: Available credits below $${LOW_BALANCE_THRESHOLD}`);
    console.log('   Run purchase-credits.ts to top up using ETH on Base');
  } else {
    console.log('✅ Balance healthy');
  }

  return credits;
}

const isMainModule = process.argv[1]?.endsWith('check-credits.ts');
if (isMainModule) {
  main().catch((error) => {
    console.error('❌ Error:', error.message);
    process.exit(1);
  });
}

export { LOW_BALANCE_THRESHOLD };
