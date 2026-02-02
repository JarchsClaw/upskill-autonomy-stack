/**
 * purchase-credits.ts
 * 
 * Purchase OpenRouter API credits using ETH on Base.
 * Core of agent autonomy - using earned trading fees to pay for inference.
 * 
 * Usage:
 *   OPENROUTER_API_KEY=sk-... PRIVATE_KEY=0x... npx tsx purchase-credits.ts --amount 10
 */

import 'dotenv/config';
import { parseEther, formatEther, type Address } from 'viem';
import {
  getPublicClient,
  getWalletClient,
  getAccount,
  COMMERCE_ABI,
  requireEnv,
  validateAmount,
  validateDate,
  withRetry,
  calculateEthForUsd,
  getEthPriceUsd,
  MAX_GAS_PRICE_GWEI,
  RecoverableError,
  parseArgs,
  wantsHelp,
  printHelp,
  type CliConfig,
} from '../lib/index.js';

// ============ Constants ============

/** Uniswap V3 pool fee tier for ETH/USDC swap (0.05% = 500 bps) */
const UNISWAP_POOL_FEE_TIER = 500;

/** Buffer percentage added to ETH estimate to ensure sufficient value */
const ETH_PRICE_BUFFER_PERCENT = 20;

/** Polling interval for transaction confirmation (ms) */
const TX_POLLING_INTERVAL_MS = 2000;

// ============ Types ============

interface PurchaseCalldataResponse {
  data: {
    web3_data: {
      transfer_intent: {
        metadata: {
          contract_address: Address;
        };
        call_data: {
          recipient_amount: string;
          deadline: string;
          recipient: Address;
          recipient_currency: Address;
          refund_destination: Address;
          fee_amount: string;
          id: `0x${string}`;
          operator: Address;
          signature: `0x${string}`;
          prefix: `0x${string}`;
        };
      };
    };
  };
}

/**
 * Get purchase calldata from OpenRouter API.
 */
async function getPurchaseCalldata(
  amount: number,
  senderAddress: Address
): Promise<PurchaseCalldataResponse['data']> {
  const apiKey = requireEnv('OPENROUTER_API_KEY');

  console.log(`📝 Requesting purchase calldata for $${amount}...`);

  const response = await fetch('https://openrouter.ai/api/v1/credits/coinbase', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount,
      sender: senderAddress,
      chain_id: 8453, // Base
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get purchase calldata: ${error}`);
  }

  const { data } = await response.json() as PurchaseCalldataResponse;
  return data;
}

/**
 * Estimate ETH required for a purchase (with buffer).
 * Uses live Chainlink oracle price instead of hardcoded estimate.
 * 
 * @param usdAmount - Amount in USD to purchase
 * @returns ETH needed in wei (includes 20% buffer)
 */
async function estimateEthRequired(usdAmount: number): Promise<bigint> {
  return calculateEthForUsd(usdAmount, ETH_PRICE_BUFFER_PERCENT);
}

/**
 * Purchase OpenRouter API credits using ETH on Base.
 * 
 * Core of agent autonomy - converts earned trading fees (WETH) into
 * inference credits, enabling agents to pay for their own compute.
 * 
 * Flow:
 * 1. Get purchase calldata from OpenRouter API
 * 2. Query Chainlink for live ETH/USD price
 * 3. Check gas price against ceiling
 * 4. Execute swap via Coinbase Commerce protocol
 * 
 * @param amount - USD amount of credits to purchase
 * @param options.dryRun - If true, simulate without executing
 * @param options.knownBalance - Skip balance check if already known
 * @returns Transaction hash on success, null on dry run
 * @throws {Error} If insufficient ETH balance
 * @throws {RecoverableError} If gas price exceeds ceiling
 * 
 * @example
 * // Purchase $10 in credits
 * const txHash = await purchaseCredits(10);
 * console.log(`Credits purchased: ${txHash}`);
 * 
 * @example
 * // Dry run to check pricing
 * await purchaseCredits(25, { dryRun: true });
 */
export async function purchaseCredits(
  amount: number,
  options: { dryRun?: boolean; knownBalance?: bigint } = {}
): Promise<string | null> {
  const { dryRun = false } = options;

  const account = getAccount();
  const publicClient = getPublicClient();
  const walletClient = getWalletClient();

  console.log('🔐 Wallet:', account.address);
  console.log(`💰 Purchasing $${amount} in OpenRouter credits on Base\n`);

  // Check ETH balance
  const balance = options.knownBalance ?? await publicClient.getBalance({ address: account.address });
  console.log(`📊 Current ETH balance: ${formatEther(balance)} ETH`);

  // Get purchase calldata
  const calldataResponse = await getPurchaseCalldata(amount, account.address);
  const { contract_address } = calldataResponse.web3_data.transfer_intent.metadata;
  const callData = calldataResponse.web3_data.transfer_intent.call_data;

  // Validate deadline
  const deadline = validateDate(callData.deadline, 'deadline');
  const deadlineUnix = BigInt(Math.floor(deadline.getTime() / 1000));

  console.log(`📋 Contract: ${contract_address}`);
  console.log(`🎯 Recipient: ${callData.recipient}`);
  console.log(`⏰ Deadline: ${callData.deadline}`);

  if (dryRun) {
    console.log('\n🔍 DRY RUN - Not executing transaction');
    console.log('   Call data prepared successfully');
    return null;
  }

  // Calculate ETH value with buffer using live Chainlink price
  const priceData = await getEthPriceUsd();
  console.log(`\n📊 Current ETH price: $${priceData.price.toFixed(2)} (via Chainlink)`);
  
  const ethValue = await estimateEthRequired(amount);
  console.log(`⛽ Estimated ETH needed: ${formatEther(ethValue)} ETH (includes ${ETH_PRICE_BUFFER_PERCENT}% buffer)`);

  if (balance < ethValue) {
    throw new Error(
      `Insufficient ETH balance. Need ~${formatEther(ethValue)} ETH but have ${formatEther(balance)} ETH`
    );
  }

  // Check gas price to avoid overpaying during congestion
  const gasPrice = await publicClient.getGasPrice();
  const gasPriceGwei = gasPrice / 1_000_000_000n;
  console.log(`⛽ Current gas price: ${gasPriceGwei} gwei`);
  
  if (gasPriceGwei > MAX_GAS_PRICE_GWEI) {
    throw new RecoverableError(
      `Gas price too high: ${gasPriceGwei} gwei (max: ${MAX_GAS_PRICE_GWEI} gwei). Try again later.`
    );
  }

  // Prepare transaction intent
  const intent = {
    recipientAmount: BigInt(callData.recipient_amount),
    deadline: deadlineUnix,
    recipient: callData.recipient,
    recipientCurrency: callData.recipient_currency,
    refundDestination: callData.refund_destination,
    feeAmount: BigInt(callData.fee_amount),
    id: callData.id,
    operator: callData.operator,
    signature: callData.signature,
    prefix: callData.prefix,
  };

  // Execute with retry
  console.log('\n🔄 Simulating transaction...');

  const txHash = await withRetry(async () => {
    const { request } = await publicClient.simulateContract({
      abi: COMMERCE_ABI,
      account: account.address,
      address: contract_address,
      functionName: 'swapAndTransferUniswapV3Native',
      args: [intent, UNISWAP_POOL_FEE_TIER],
      value: ethValue,
    });

    console.log('✅ Simulation successful!');
    console.log('\n📤 Executing purchase transaction...');

    return walletClient.writeContract(request);
  }, { retries: 2 });

  console.log(`📝 Transaction submitted: https://basescan.org/tx/${txHash}`);

  // Wait for confirmation
  console.log('⏳ Waiting for confirmation...');
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
    confirmations: 1,
    pollingInterval: TX_POLLING_INTERVAL_MS,
  });

  if (receipt.status === 'success') {
    console.log(`\n✅ SUCCESS! $${amount} credits purchased`);
    console.log('   Credits should appear instantly (under $500)');
    console.log('   Verify at: https://openrouter.ai/keys');
  } else {
    console.log('\n❌ Transaction reverted');
    throw new Error('Transaction reverted');
  }

  return txHash;
}

const CLI_CONFIG: CliConfig = {
  name: 'purchase-credits',
  description: 'Purchase OpenRouter API credits using ETH on Base via Coinbase Commerce.',
  usage: 'npx tsx purchase-credits.ts [options]',
  options: [
    { name: 'amount', short: 'a', description: 'USD amount to purchase', default: '10' },
    { name: 'dry-run', description: 'Simulate without executing transaction' },
  ],
  examples: [
    'npx tsx purchase-credits.ts --amount 10',
    'npx tsx purchase-credits.ts -a 25 --dry-run',
  ],
};

async function main() {
  const args = parseArgs();
  
  if (wantsHelp(args)) {
    printHelp(CLI_CONFIG);
    process.exit(0);
  }

  const amountStr = (args.amount as string) || (args.a as string) || '10';
  const amount = validateAmount(amountStr, 'amount');
  const dryRun = args['dry-run'] === true;

  await purchaseCredits(amount, { dryRun });
}

const isMainModule = process.argv[1]?.endsWith('purchase-credits.ts');
if (isMainModule) {
  main().catch((error) => {
    console.error('❌ Error:', error.message);
    process.exit(1);
  });
}

// purchaseCredits already exported at definition
