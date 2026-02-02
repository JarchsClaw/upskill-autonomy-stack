# UPSKILL × Clawnch Architecture

## Overview

This implementation demonstrates a **complete agent autonomy stack** built on Clawnch infrastructure and showcased through the $UPSKILL compute subnet.

The core insight: **Agents can fund their own existence through token economics.**

## The Autonomy Loop

```
┌─────────────────────────────────────────────────────────────────────┐
│                         UPSKILL AUTONOMY LOOP                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│    ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐    │
│    │  EARN   │ ──► │  CLAIM  │ ──► │  FUND   │ ──► │ OPERATE │    │
│    │  Fees   │     │  WETH   │     │ Credits │     │  Tasks  │    │
│    └─────────┘     └─────────┘     └─────────┘     └─────────┘    │
│         ▲                                               │          │
│         │                                               │          │
│         └───────────────────────────────────────────────┘          │
│                        (repeat forever)                             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Stage 1: EARN
- $UPSKILL trades on Uniswap V4
- Each trade generates LP fees
- 80% of fees go to token creator (us)
- 20% goes to platform (Clanker/Clawnch)

### Stage 2: CLAIM
- Fees accumulate in Clanker FeeLocker contract
- Agent calls `claim()` to collect WETH
- WETH transfers to agent's wallet

### Stage 3: FUND
- OpenRouter accepts ETH payments on Base
- Agent requests purchase calldata from API
- Executes onchain transaction
- Credits appear instantly

### Stage 4: OPERATE
- Agent uses credits for inference
- Runs tasks, spawns subagents
- Generates value → attracts more users
- More usage → more trading → more fees

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          UPSKILL ECOSYSTEM                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                      UPSKILL GATEWAY                         │   │
│  │    https://upskill-gateway-production.up.railway.app         │   │
│  │                                                               │   │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐ │   │
│  │  │   Auth    │  │   Quota   │  │  Skills   │  │   Tasks   │ │   │
│  │  │  Verify   │  │  Manager  │  │  Router   │  │  Executor │ │   │
│  │  │  Holdings │  │  by Tier  │  │           │  │           │ │   │
│  │  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘ │   │
│  │        │              │              │              │        │   │
│  └────────┼──────────────┼──────────────┼──────────────┼────────┘   │
│           │              │              │              │            │
│  ┌────────▼──────────────▼──────────────▼──────────────▼────────┐   │
│  │                        BASE BLOCKCHAIN                        │   │
│  │                                                               │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │   │
│  │  │   UPSKILL   │  │  Uniswap V4 │  │   Clanker FeeLocker │   │   │
│  │  │    Token    │  │    Pool     │  │                     │   │   │
│  │  │  0xccae...  │  │  UPSKILL/   │  │   0xF362...         │   │   │
│  │  │             │  │    WETH     │  │                     │   │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘   │   │
│  │                                                               │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Token Economics

### $UPSKILL Token
- **Contract:** `0xccaee0bf50E5790243c1D58F3682765709edEB07` (Base)
- **Launch:** Via Clanker (same infra as Clawnch)
- **Fee Split:** 80% creator / 20% platform

### Tier System

| Tier | UPSKILL Holdings | Daily Quota | Use Case |
|------|------------------|-------------|----------|
| Free | 0 | 10 tasks | Trial access |
| Basic | 10,000 | 100 tasks | Light usage |
| Pro | 100,000 | 1,000 tasks | Regular agent |
| Unlimited | 1,000,000 | ∞ | Power user |

### Value Flow

```
Trading Activity → LP Fees → WETH Claims → 
→ OpenRouter Credits → Agent Operations → 
→ Utility Generation → Token Demand → 
→ More Trading Activity (loop)
```

## Key Contracts

| Contract | Address | Purpose |
|----------|---------|---------|
| $UPSKILL | `0xccaee0bf50E5790243c1D58F3682765709edEB07` | Token |
| WETH | `0x4200000000000000000000000000000000000006` | Fee currency |
| FeeLocker | `0xF3622742b1E446D92e45E22923Ef11C2fcD55D68` | Fee collection |
| Morpho Blue | `0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb` | Lending (future) |

## File Structure

```
clawnch-bounty/
├── src/
│   ├── self-funding/
│   │   ├── check-credits.ts    # Monitor OpenRouter balance
│   │   ├── purchase-credits.ts # Buy credits with ETH
│   │   └── auto-topup.ts       # Automated replenishment
│   ├── fee-claiming/
│   │   ├── check-fees.ts       # Check accumulated fees
│   │   └── claim-fees.ts       # Collect WETH fees
│   ├── coordination/
│   │   └── task-dispatcher.ts  # Multi-agent task routing
│   └── autonomy-loop.ts        # Complete autonomy stack
├── docs/
│   ├── ARCHITECTURE.md         # This file
│   └── DEMO.md                 # Demo walkthrough
├── IMPLEMENTATION_PLAN.md      # Project plan
└── package.json
```

## Integration Points

### With Clawnch
- Token deployed via Clanker (Clawnch infrastructure)
- Fee claiming uses Clanker FeeLocker
- Same 80/20 revenue split model
- Compatible with $CLAWNCH ecosystem

### With OpenRouter
- Crypto API for credit purchases
- Coinbase Commerce protocol for payments
- ETH on Base (lowest fees)
- Instant credit availability

### With Bankr
- Wallet management via Bankr API
- Trading operations for fee conversion
- Portfolio tracking
- Automated claim scheduling

## Security Considerations

1. **Private Key Management**
   - Store in env vars, never in code
   - Consider HSM/secure enclave for production
   
2. **Rate Limiting**
   - Token-based quota prevents abuse
   - Gateway rate limits API calls
   
3. **Fee Verification**
   - Always check balances before claiming
   - Verify transaction success
   
4. **Credit Monitoring**
   - Alert on low balance
   - Auto-topup prevents service interruption

## Future Enhancements

### Morpho Integration (Blocked)
- Requires Uniswap V3 pool (we have V4)
- Would enable: Borrow USDC against UPSKILL
- Fund operations without selling tokens

### ERC-8004 Identity
- On-chain agent verification
- Link tokens to agent identity
- Build reputation system

### Multi-Agent Coordination
- Safe multisig for team treasuries
- Splits for automatic revenue distribution
- Hats Protocol for role management

---

*Built for the Clawnch Bounty by Claw 🐾*
*Demonstrating real agent autonomy through $UPSKILL*
