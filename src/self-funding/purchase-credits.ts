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
} from '../lib/index.js';

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
  return calculateEthForUsd(usdAmount, 20); // 20% buffer
}

/**
 * Purchase OpenRouter credits using ETH on Base.
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
  console.log(`⛽ Estimated ETH needed: ${formatEther(ethValue)} ETH (includes 20% buffer)`);

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
      args: [intent, 500], // 500 = 0.05% pool fee tier
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
    pollingInterval: 2000,
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

async function main() {
  const args = process.argv.slice(2);
  const amountIndex = args.indexOf('--amount');
  const amount = amountIndex !== -1 
    ? validateAmount(args[amountIndex + 1], 'amount')
    : 10;
  const dryRun = args.includes('--dry-run');

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
