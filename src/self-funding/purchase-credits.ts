/**
 * purchase-credits.ts
 * 
 * Purchase OpenRouter API credits using ETH on Base.
 * This is the core of agent autonomy - using earned trading fees to pay for inference.
 * 
 * Flow:
 * 1. Request purchase calldata from OpenRouter
 * 2. Execute onchain payment via Coinbase Commerce protocol
 * 3. Credits appear instantly (under $500)
 * 
 * Usage: 
 *   OPENROUTER_API_KEY=sk-... PRIVATE_KEY=0x... npx tsx purchase-credits.ts --amount 10
 */

import 'dotenv/config';
import { createPublicClient, createWalletClient, http, parseEther, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;

// Validate environment
if (!OPENROUTER_API_KEY) {
  console.error('Error: OPENROUTER_API_KEY not set');
  process.exit(1);
}

if (!PRIVATE_KEY) {
  console.error('Error: PRIVATE_KEY not set');
  process.exit(1);
}

// Coinbase Commerce protocol ABI for swapAndTransferUniswapV3Native
const COMMERCE_ABI = [
  {
    inputs: [
      {
        components: [
          { internalType: 'uint256', name: 'recipientAmount', type: 'uint256' },
          { internalType: 'uint256', name: 'deadline', type: 'uint256' },
          { internalType: 'address payable', name: 'recipient', type: 'address' },
          { internalType: 'address', name: 'recipientCurrency', type: 'address' },
          { internalType: 'address', name: 'refundDestination', type: 'address' },
          { internalType: 'uint256', name: 'feeAmount', type: 'uint256' },
          { internalType: 'bytes16', name: 'id', type: 'bytes16' },
          { internalType: 'address', name: 'operator', type: 'address' },
          { internalType: 'bytes', name: 'signature', type: 'bytes' },
          { internalType: 'bytes', name: 'prefix', type: 'bytes' },
        ],
        internalType: 'struct TransferIntent',
        name: '_intent',
        type: 'tuple',
      },
      { internalType: 'uint24', name: 'poolFeesTier', type: 'uint24' },
    ],
    name: 'swapAndTransferUniswapV3Native',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
] as const;

interface PurchaseCalldataResponse {
  data: {
    web3_data: {
      transfer_intent: {
        metadata: {
          contract_address: `0x${string}`;
        };
        call_data: {
          recipient_amount: string;
          deadline: string;
          recipient: `0x${string}`;
          recipient_currency: `0x${string}`;
          refund_destination: `0x${string}`;
          fee_amount: string;
          id: `0x${string}`;
          operator: `0x${string}`;
          signature: `0x${string}`;
          prefix: `0x${string}`;
        };
      };
    };
  };
}

async function getPurchaseCalldata(
  amount: number,
  senderAddress: `0x${string}`
): Promise<PurchaseCalldataResponse['data']> {
  console.log(`📝 Requesting purchase calldata for $${amount}...`);
  
  const response = await fetch('https://openrouter.ai/api/v1/credits/coinbase', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
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

async function purchaseCredits(amount: number, dryRun = false) {
  const account = privateKeyToAccount(PRIVATE_KEY);
  
  const publicClient = createPublicClient({
    chain: base,
    transport: http('https://mainnet.base.org'),
  });

  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http('https://mainnet.base.org'),
  });

  console.log('🔐 Wallet:', account.address);
  console.log(`💰 Purchasing $${amount} in OpenRouter credits on Base\n`);

  // Check ETH balance first
  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`📊 Current ETH balance: ${formatEther(balance)} ETH`);

  // Get purchase calldata from OpenRouter
  const calldataResponse = await getPurchaseCalldata(amount, account.address);
  const { contract_address } = calldataResponse.web3_data.transfer_intent.metadata;
  const callData = calldataResponse.web3_data.transfer_intent.call_data;

  console.log(`📋 Contract: ${contract_address}`);
  console.log(`🎯 Recipient: ${callData.recipient}`);
  console.log(`⏰ Deadline: ${callData.deadline}`);

  if (dryRun) {
    console.log('\n🔍 DRY RUN - Not executing transaction');
    console.log('   Call data prepared successfully');
    return;
  }

  // Prepare transaction arguments
  const intent = {
    recipientAmount: BigInt(callData.recipient_amount),
    deadline: BigInt(Math.floor(new Date(callData.deadline).getTime() / 1000)),
    recipient: callData.recipient,
    recipientCurrency: callData.recipient_currency,
    refundDestination: callData.refund_destination,
    feeAmount: BigInt(callData.fee_amount),
    id: callData.id,
    operator: callData.operator,
    signature: callData.signature,
    prefix: callData.prefix,
  };

  // Include buffer for ETH value - excess is refunded
  const ethValue = parseEther('0.005'); // ~$11 at current prices, adjust as needed

  console.log(`\n⛽ Estimated ETH needed: ${formatEther(ethValue)} ETH`);

  if (balance < ethValue) {
    throw new Error(`Insufficient ETH balance. Need ${formatEther(ethValue)} ETH but have ${formatEther(balance)} ETH`);
  }

  // Simulate first
  console.log('\n🔄 Simulating transaction...');
  const { request } = await publicClient.simulateContract({
    abi: COMMERCE_ABI,
    account,
    address: contract_address,
    functionName: 'swapAndTransferUniswapV3Native',
    args: [intent, 500], // 500 = 0.05% pool fee tier (lowest)
    value: ethValue,
  });

  console.log('✅ Simulation successful!');

  // Execute
  console.log('\n📤 Executing purchase transaction...');
  const txHash = await walletClient.writeContract(request);
  console.log(`📝 Transaction submitted: https://basescan.org/tx/${txHash}`);

  // Wait for confirmation
  console.log('⏳ Waiting for confirmation...');
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  
  if (receipt.status === 'success') {
    console.log(`\n✅ SUCCESS! $${amount} credits purchased`);
    console.log('   Credits should appear instantly (under $500)');
    console.log('   Verify at: https://openrouter.ai/keys');
  } else {
    console.log('\n❌ Transaction reverted');
  }

  return txHash;
}

// Parse command line arguments
const args = process.argv.slice(2);
const amountIndex = args.indexOf('--amount');
const amount = amountIndex !== -1 ? parseFloat(args[amountIndex + 1]) : 10;
const dryRun = args.includes('--dry-run');

purchaseCredits(amount, dryRun).catch((error) => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});

export { purchaseCredits, getPurchaseCalldata };
