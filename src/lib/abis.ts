/**
 * Centralized ABI definitions for all contracts.
 * Single source of truth - import from here, not redeclare.
 */

// ERC20 minimal ABI
export const ERC20_ABI = [
  {
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// Clanker FeeLocker ABI
export const FEE_LOCKER_ABI = [
  {
    inputs: [
      { name: 'feeOwner', type: 'address' },
      { name: 'token', type: 'address' },
    ],
    name: 'feesToClaim',
    outputs: [{ name: 'balance', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'feeOwner', type: 'address' },
      { name: 'token', type: 'address' },
    ],
    name: 'claim',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

// Morpho Blue market params type
export const MORPHO_MARKET_PARAMS_TYPE = [
  { name: 'loanToken', type: 'address' },
  { name: 'collateralToken', type: 'address' },
  { name: 'oracle', type: 'address' },
  { name: 'irm', type: 'address' },
  { name: 'lltv', type: 'uint256' },
] as const;

// Morpho Blue ABI
export const MORPHO_ABI = [
  {
    inputs: [
      {
        components: MORPHO_MARKET_PARAMS_TYPE,
        name: 'marketParams',
        type: 'tuple',
      },
      { name: 'assets', type: 'uint256' },
      { name: 'shares', type: 'uint256' },
      { name: 'onBehalf', type: 'address' },
      { name: 'data', type: 'bytes' },
    ],
    name: 'supplyCollateral',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        components: MORPHO_MARKET_PARAMS_TYPE,
        name: 'marketParams',
        type: 'tuple',
      },
      { name: 'assets', type: 'uint256' },
      { name: 'shares', type: 'uint256' },
      { name: 'onBehalf', type: 'address' },
      { name: 'receiver', type: 'address' },
    ],
    name: 'borrow',
    outputs: [{ name: 'assetsBorrowed', type: 'uint256' }, { name: 'sharesBorrowed', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        components: MORPHO_MARKET_PARAMS_TYPE,
        name: 'marketParams',
        type: 'tuple',
      },
      { name: 'assets', type: 'uint256' },
      { name: 'shares', type: 'uint256' },
      { name: 'onBehalf', type: 'address' },
      { name: 'data', type: 'bytes' },
    ],
    name: 'repay',
    outputs: [{ name: 'assetsRepaid', type: 'uint256' }, { name: 'sharesRepaid', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        components: MORPHO_MARKET_PARAMS_TYPE,
        name: 'marketParams',
        type: 'tuple',
      },
      { name: 'assets', type: 'uint256' },
      { name: 'onBehalf', type: 'address' },
      { name: 'receiver', type: 'address' },
    ],
    name: 'withdrawCollateral',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'id', type: 'bytes32' }, { name: 'user', type: 'address' }],
    name: 'position',
    outputs: [
      { name: 'supplyShares', type: 'uint256' },
      { name: 'borrowShares', type: 'uint128' },
      { name: 'collateral', type: 'uint128' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'id', type: 'bytes32' }],
    name: 'market',
    outputs: [
      { name: 'totalSupplyAssets', type: 'uint128' },
      { name: 'totalSupplyShares', type: 'uint128' },
      { name: 'totalBorrowAssets', type: 'uint128' },
      { name: 'totalBorrowShares', type: 'uint128' },
      { name: 'lastUpdate', type: 'uint128' },
      { name: 'fee', type: 'uint128' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        components: MORPHO_MARKET_PARAMS_TYPE,
        name: 'marketParams',
        type: 'tuple',
      },
    ],
    name: 'createMarket',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

// Uniswap V3 Factory ABI
export const UNISWAP_V3_FACTORY_ABI = [
  {
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
      { name: 'fee', type: 'uint24' },
    ],
    name: 'getPool',
    outputs: [{ name: 'pool', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// TWAP Oracle Factory ABI
export const TWAP_FACTORY_ABI = [
  {
    inputs: [
      { name: 'pool', type: 'address' },
      { name: 'baseToken', type: 'address' },
      { name: 'quoteToken', type: 'address' },
      { name: 'twapWindow', type: 'uint32' },
    ],
    name: 'createOracle',
    outputs: [{ name: 'oracle', type: 'address' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'pool0', type: 'address' },
      { name: 'pool1', type: 'address' },
      { name: 'baseToken', type: 'address' },
      { name: 'intermediateToken', type: 'address' },
      { name: 'quoteToken', type: 'address' },
      { name: 'twapWindow', type: 'uint32' },
    ],
    name: 'createTwoHopOracle',
    outputs: [{ name: 'oracle', type: 'address' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

// Chainlink Price Feed ABI
export const CHAINLINK_PRICE_FEED_ABI = [
  {
    inputs: [],
    name: 'latestRoundData',
    outputs: [
      { name: 'roundId', type: 'uint80' },
      { name: 'answer', type: 'int256' },
      { name: 'startedAt', type: 'uint256' },
      { name: 'updatedAt', type: 'uint256' },
      { name: 'answeredInRound', type: 'uint80' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// Coinbase Commerce protocol ABI
export const COMMERCE_ABI = [
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
