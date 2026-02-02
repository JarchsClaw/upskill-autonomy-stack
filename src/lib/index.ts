/**
 * Shared library exports.
 * Import from here for all common utilities.
 */

// Singleton clients
export {
  getPublicClient,
  getWalletClient,
  getAccount,
  resetClients,
  RPC_URL,
} from './clients.js';

// Contract ABIs
export {
  ERC20_ABI,
  FEE_LOCKER_ABI,
  MORPHO_ABI,
  MORPHO_MARKET_PARAMS_TYPE,
  UNISWAP_V3_FACTORY_ABI,
  TWAP_FACTORY_ABI,
  COMMERCE_ABI,
} from './abis.js';

// Contract addresses
export {
  UPSKILL_TOKEN,
  CLAWNCH_TOKEN,
  WETH,
  USDC,
  FEE_LOCKER,
  MORPHO_BLUE,
  ADAPTIVE_CURVE_IRM,
  TWAP_ORACLE_FACTORY,
  CLAWNCH_ORACLE,
  CLAWNCH_MARKET_ID,
  CLAWNCH_MARKET_PARAMS,
  UNISWAP_V3_FACTORY,
  FEE_TIERS,
  LLTV_OPTIONS,
  ZERO_ADDRESS,
} from './addresses.js';

// Validation utilities
export {
  validateAddress,
  requireEnv,
  validateAmount,
  validateBigIntAmount,
  validateDate,
  validateOption,
} from './validation.js';

// Retry utilities
export {
  withRetry,
  fetchWithRetry,
  RecoverableError,
  isRecoverable,
  type RetryOptions,
} from './retry.js';
