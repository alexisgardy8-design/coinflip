## Foundry

**Foundry is a blazing fast, portable and modular toolkit for Ethereum application development written in Rust.**

Foundry consists of:

- **Forge**: Ethereum testing framework (like Truffle, Hardhat and DappTools).
- **Cast**: Swiss army knife for interacting with EVM smart contracts, sending transactions and getting chain data.
- **Anvil**: Local Ethereum node, akin to Ganache, Hardhat Network.
- **Chisel**: Fast, utilitarian, and verbose solidity REPL.

## Documentation

https://book.getfoundry.sh/

## Usage

### Build

```shell
$ forge build
```

### Test

```shell
$ forge test
```

### Format

```shell
$ forge fmt
```

### Gas Snapshots

```shell
$ forge snapshot
```

### Anvil

```shell
$ anvil
```

### Deploy (Base Sepolia)

1) Copy `.env.example` to `.env` and fill:

```
PRIVATE_KEY=0x...
VRF_SUBSCRIPTION_ID=...
FEE_RECIPIENT=0x...
BASE_SEPOLIA_RPC_URL=https://...
# Optional for verify (Etherscan V2 multi-chain key):
# ETHERSCAN_API_KEY=...
```

2) Build contracts

```bash
forge build --skip test
```

3) Deploy with Foundry script (Etherscan verifier)

```bash
# uses rpc_endpoints.baseSepolia from foundry.toml and env vars
forge script script/Counter.s.sol:CounterScript \
	--rpc-url baseSepolia \
	--broadcast \
	--verify --verifier etherscan
```

Notes:
- The script requires env: `PRIVATE_KEY`, `VRF_SUBSCRIPTION_ID`, `FEE_RECIPIENT`.
- VRF Coordinator is set for Base Sepolia in the contract.
- Etherscan V2 API key works across supported chains (Base/Base Sepolia). If verification fails, re-run once ETHERSCAN_API_KEY is set.

### Cast

```shell
$ cast <subcommand>
```

### Help

```shell
$ forge --help
$ anvil --help
$ cast --help
```
