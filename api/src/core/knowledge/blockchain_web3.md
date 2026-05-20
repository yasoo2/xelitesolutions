# Blockchain & Web3: Decentralized Architecture

## 1. Smart Contracts (Solidity)
- **Security First**: Reentrancy attacks are the #1 killer. Always use Checks-Effects-Interactions pattern or `ReentrancyGuard` modifier.
- **Gas Optimization**: Use `calldata` for read-only function arguments. Pack struct variables to fit into 256-bit slots.
- **Upgradability**: Use Proxy patterns (Transparent or UUPS) to separate logic contracts from storage contracts.

## 2. DeFi Patterns
- **AMM (Automated Market Maker)**: `x * y = k` constant product formula. Understanding slippage and impermanent loss.
- **Staking**: Rewards distribution algorithms. `rewardPerToken` snapshots to avoid loops (O(1) complexity).
- **Flash Loans**: Atomicity is key. Borrow -> Arbitrage -> Repay in a single transaction block.

## 3. Solana (Rust)
- **Account Model**: Logic and State are separate. Programs (smart contracts) are stateless; they modify data in Accounts passed to them.
- **PDA (Program Derived Address)**: Deterministic addresses allowing programs to sign for accounts.

## 4. Web3 Integration
- **Ethers.js / Viem**: Use Viem for type-safe, lightweight interaction.
- **Indexing**: Don't query the chain directly for complex data (slow). Use **The Graph** (Subgraphs) to index events into GraphQL.
- **IPFS**: Decentralized storage for NFT metadata and frontend hosting (Fleek/Pinata).
