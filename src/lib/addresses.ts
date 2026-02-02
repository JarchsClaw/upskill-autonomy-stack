/**
 * Centralized contract addresses for Base network.
 * Single source of truth for all addresses used in the project.
 */

import type { Address } from 'viem';

// ============ Token Addresses ============

/** UPSKILL Token - Our compute subnet token */
export const UPSKILL_TOKEN = '0xccaee0bf50E5790243c1D58F3682765709edEB07' as Address;

/** CLAWNCH Token - The agent coordination layer */
export const CLAWNCH_TOKEN = '0xa1F72459dfA10BAD200Ac160eCd78C6b77a747be' as Address;

/** Wrapped ETH on Base */
export const WETH = '0x4200000000000000000000000000000000000006' as Address;

/** USDC on Base */
export const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address;

// ============ Clanker Addresses ============

/** Clanker FeeLocker - where trading fees accumulate */
export const FEE_LOCKER = '0xF3622742b1E446D92e45E22923Ef11C2fcD55D68' as Address;

// ============ Morpho Blue Addresses ============

/** Morpho Blue main contract */
export const MORPHO_BLUE = '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb' as Address;

/** Adaptive Curve IRM (interest rate model) */
export const ADAPTIVE_CURVE_IRM = '0x46415998764C29aB2a25CbeA6254146D50D22687' as Address;

/** Clawnch TWAP Oracle Factory */
export const TWAP_ORACLE_FACTORY = '0x3Ce2EbEE744a054902A9B4172a3bBa19D1e25a3C' as Address;

/** CLAWNCH Morpho Oracle */
export const CLAWNCH_ORACLE = '0x81DD756b6de7908b998b4f9E4Ca44Ee0d230ee5e' as Address;

/** CLAWNCH Morpho Market ID */
export const CLAWNCH_MARKET_ID = '0xd7746cb1ce24f11256004bfcbaaddc400fb2087866a02529df0a0f6fe4a33e99' as `0x${string}`;

// ============ Uniswap Addresses ============

/** Uniswap V3 Factory on Base */
export const UNISWAP_V3_FACTORY = '0x33128a8fC17869897dcE68Ed026d694621f6FDfD' as Address;

// ============ Uniswap Fee Tiers ============

/** Available fee tiers for Uniswap V3 pools */
export const FEE_TIERS = [500, 3000, 10000] as const;

// ============ Morpho LLTV Options ============

/** Available LLTV (loan-to-value) options for Morpho markets */
export const LLTV_OPTIONS: Record<string, bigint> = {
  '0': 0n,
  '38.5': 385000000000000000n,
  '62.5': 625000000000000000n,
  '77': 770000000000000000n,
  '86': 860000000000000000n,
  '91.5': 915000000000000000n,
  '94.5': 945000000000000000n,
  '96.5': 965000000000000000n,
  '98': 980000000000000000n,
};

// ============ CLAWNCH Market Parameters ============

/** Pre-configured market params for CLAWNCH Morpho market */
export const CLAWNCH_MARKET_PARAMS = {
  loanToken: USDC,
  collateralToken: CLAWNCH_TOKEN,
  oracle: CLAWNCH_ORACLE,
  irm: ADAPTIVE_CURVE_IRM,
  lltv: 385000000000000000n, // 38.5%
} as const;

// ============ Chainlink Oracles ============

/** Chainlink ETH/USD Price Feed on Base */
export const CHAINLINK_ETH_USD = '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70' as Address;

// ============ Gas Configuration ============

/** Maximum gas price in gwei (to prevent overpaying during congestion) */
export const MAX_GAS_PRICE_GWEI = 50n;

// ============ Zero Address ============

/** Zero address for comparisons */
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;
