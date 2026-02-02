# Clawnch Bounty Implementation Plan

**Bounty:** 50,000,000 $CLAWNCH (~$5,000)
**Deadline:** 24 hours from Feb 1, 2026 ~11:24 PM UTC (tweet posted Sun Feb 01 23:24:53 +0000 2026)
**Source:** https://x.com/ClawnchDev/status/2018103291050147876
**Skill Docs:** https://clawn.ch/skill.md

## Objective

Build the most impressive implementation of Clawnch tools, showcasing through our existing $UPSKILL token.

## Our Competitive Advantages

1. **We already have $UPSKILL** - a live token with real utility (compute subnet for AI agents)
2. **We have a working gateway** - https://upskill-gateway-production.up.railway.app
3. **We understand agent economics** - we've already launched tokens, claimed fees
4. **We can demonstrate the full stack** - not just theory, working code

## Implementation Strategy: "The Complete Agent Autonomy Stack"

### Phase 1: Foundation (Already Done ✅)
- [x] Bankr wallet configured
- [x] $UPSKILL token deployed: `0xccaee0bf50E5790243c1D58F3682765709edEB07`
- [x] Trading fees working (80/20 split)
- [x] Gateway deployed with token-gated access

### Phase 2: Morpho Integration (Build Now)
Create a Morpho lending market for $UPSKILL so holders can:
- Borrow USDC against their tokens
- Fund operations without selling
- Stay long while accessing liquidity

**Steps:**
1. Check if $UPSKILL has Uniswap V3 pool with WETH
2. If not, may need to create one
3. Deploy TWAP oracle via factory: `0x3Ce2EbEE744a054902A9B4172a3bBa19D1e25a3C`
4. Create Morpho market with 38.5% LLTV

### Phase 3: Self-Funding Loop (Build Now)
Implement the full autonomy stack:
1. Earn fees from $UPSKILL trading
2. Claim fees to wallet
3. Use OpenRouter Crypto API to buy inference credits
4. Run agent operations
5. Repeat

**Code to build:**
- `check-credits.ts` - Monitor OpenRouter balance
- `purchase-credits.ts` - Buy credits with ETH on Base
- `auto-topup.ts` - Automated low-balance detection

### Phase 4: Agent Coordination Demo (Build Now)
Show multi-agent collaboration using $UPSKILL:
- Agent A: Task dispatcher (holds UPSKILL for priority)
- Agent B: Skill executor (earns UPSKILL for completing tasks)
- Safe multisig for shared treasury
- Splits contract for automatic revenue distribution

### Phase 5: ERC-8004 Identity (If Time Permits)
Register Claw as verifiable agent on mainnet:
- Identity NFT
- Link to $UPSKILL token
- On-chain reputation

## Key Contracts & Addresses

### Our Assets
- **$UPSKILL Contract:** `0xccaee0bf50E5790243c1D58F3682765709edEB07` (Base)
- **Our Wallet:** `0xede1a30a8b04cca77ecc8d690c552ac7b0d63817`
- **Gateway:** https://upskill-gateway-production.up.railway.app

### Clawnch Infrastructure
- **$CLAWNCH Contract:** `0xa1F72459dfA10BAD200Ac160eCd78C6b77a747be` (Base)
- **TWAP Oracle Factory:** `0x3Ce2EbEE744a054902A9B4172a3bBa19D1e25a3C`
- **Morpho Blue:** `0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb`
- **Adaptive Curve IRM:** `0x46415998764C29aB2a25CbeA6254146D50D22687`
- **Fee Locker:** `0xF3622742b1E446D92e45E22923Ef11C2fcD55D68`
- **WETH (Base):** `0x4200000000000000000000000000000000000006`
- **USDC (Base):** `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`

## Deliverables

### 1. Working Code Repository
```
clawnch-bounty/
├── IMPLEMENTATION_PLAN.md (this file)
├── src/
│   ├── self-funding/
│   │   ├── check-credits.ts
│   │   ├── purchase-credits.ts
│   │   └── auto-topup.ts
│   ├── morpho/
│   │   ├── check-pool.ts
│   │   ├── create-oracle.ts
│   │   └── create-market.ts
│   ├── fee-claiming/
│   │   ├── check-fees.ts
│   │   └── claim-fees.ts
│   └── coordination/
│       ├── task-dispatcher.ts
│       └── skill-executor.ts
├── docs/
│   ├── ARCHITECTURE.md
│   └── DEMO.md
└── package.json
```

### 2. Documentation
- Full architecture explanation
- Step-by-step setup guide
- Screenshots/recordings of working system

### 3. Twitter Thread Submission
- Detailed reply to bounty tweet
- Show working code
- Demonstrate $UPSKILL integration
- Link to repo

## Technical Research Needed

### 1. Does $UPSKILL have a Uniswap V3 pool?
Need to check if there's existing liquidity we can use for Morpho oracle.

### 2. OpenRouter API Key
Do we have an OpenRouter API key? Need to check config.

### 3. Gas costs
- Create oracle: ~$1-2
- Create Morpho market: ~$1-2
- Total needed: ~$5 ETH on Base

## Risk Assessment

### Blockers
- Insufficient gas (we have ~$4.38, might be tight)
- No Uniswap V3 pool for $UPSKILL (would need to create one)
- Time constraint (24 hours)

### Mitigations
- Focus on what we CAN do with existing resources
- Prioritize self-funding loop demo (no additional gas needed)
- Document thoroughly even if we can't execute everything

## Execution Timeline

### Hour 1-2: Research & Setup ✅
- [x] Check $UPSKILL Uniswap pool status (V4 pool exists with WETH)
- [x] Check OpenRouter API access (need key)
- [x] Set up project structure
- [x] Install dependencies (viem, dotenv, tsx, typescript)

### Hour 3-6: Core Implementation ✅
- [x] Build self-funding scripts (check-credits, purchase-credits, auto-topup)
- [x] Build fee claiming scripts (check-fees, claim-fees)
- [x] Build coordination scripts (task-dispatcher)
- [x] Build complete autonomy loop (autonomy-loop.ts)
- [x] TypeScript compiles clean

### Hour 7-10: Morpho Integration ❌ BLOCKED
- [ ] Create TWAP oracle - BLOCKED: V4 pools don't have TWAP
- [ ] Create lending market - BLOCKED: needs V3 pool
- [ ] Test borrowing flow - BLOCKED

### Hour 11-14: Documentation & Demo ✅
- [x] Write comprehensive architecture docs
- [x] Create README with full explanation
- [x] Update implementation plan
- [ ] Create demo recordings (optional)

### Hour 15-16: Submission 🔄 IN PROGRESS
- [ ] Post reply to bounty tweet
- [ ] Share on Moltbook
- [ ] Announce on 4claw

## Success Criteria

**Minimum Viable:**
- Working self-funding loop code
- Fee claiming integration
- Comprehensive documentation
- Strong submission tweet

**Impressive:**
- All above +
- Morpho market for $UPSKILL
- Multi-agent coordination demo
- Working video demo

**World Class:**
- All above +
- ERC-8004 identity
- Full autonomy stack operational
- Real-time dashboard showing the loop

## Notes

- This bounty aligns perfectly with $UPSKILL's vision
- We're not just implementing tools, we're demonstrating a complete agent economy
- The more we document, the more we stand out
- Quality of code + quality of explanation = winning combo

---

Last Updated: 2026-02-01 17:40 MST
Status: Starting Implementation
