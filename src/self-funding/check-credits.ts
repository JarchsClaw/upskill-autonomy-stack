/**
 * check-credits.ts
 * 
 * Monitor OpenRouter API credit balance.
 * Part of the agent self-funding autonomy loop.
 * 
 * Usage: OPENROUTER_API_KEY=sk-... npx tsx check-credits.ts
 */

import 'dotenv/config';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!OPENROUTER_API_KEY) {
  console.error('Error: OPENROUTER_API_KEY not set');
  console.error('Get your key from: https://openrouter.ai/keys');
  process.exit(1);
}

interface CreditsResponse {
  data: {
    total_credits: number;
    total_usage: number;
  };
}

async function checkCredits(): Promise<{
  totalCredits: number;
  totalUsage: number;
  available: number;
  lowBalance: boolean;
}> {
  const response = await fetch('https://openrouter.ai/api/v1/credits', {
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch credits: ${response.status} ${response.statusText}`);
  }

  const { data } = await response.json() as CreditsResponse;
  const available = data.total_credits - data.total_usage;
  
  return {
    totalCredits: data.total_credits,
    totalUsage: data.total_usage,
    available,
    lowBalance: available < 5, // Alert threshold: $5
  };
}

async function main() {
  console.log('🔍 Checking OpenRouter credit balance...\n');
  
  try {
    const credits = await checkCredits();
    
    console.log('📊 OpenRouter Credits:');
    console.log(`   Total Credits:  $${credits.totalCredits.toFixed(2)}`);
    console.log(`   Total Usage:    $${credits.totalUsage.toFixed(2)}`);
    console.log(`   Available:      $${credits.available.toFixed(2)}`);
    console.log('');
    
    if (credits.lowBalance) {
      console.log('⚠️  LOW BALANCE ALERT: Available credits below $5');
      console.log('   Run purchase-credits.ts to top up using ETH on Base');
    } else {
      console.log('✅ Balance healthy');
    }
    
    return credits;
  } catch (error) {
    console.error('❌ Error checking credits:', error);
    throw error;
  }
}

export { checkCredits };

// Run if called directly
main().catch(console.error);
