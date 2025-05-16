# tBTC Cross-Chain Sequence Diagram: Ethereum to Sui VAA Relay (using BTCDepositorWormhole)

The following sequence diagram illustrates the complete flow of a deposit from Bitcoin to Sui through the cross-chain relayer, using the `BTCDepositorWormhole` L1 contract.

```mermaid
sequenceDiagram
    participant User
    participant BTC as Bitcoin Network
    participant SDK as tBTC SDK/UI
    participant SuiBD as SUI BitcoinDepositor
    participant Relayer
    participant L1BTCDeptWH as L1 BTCDepositorWormhole
    participant Bridge as tBTC Bridge (L1)
    participant WHTB as Wormhole Token Bridge (L1)
    participant Guardians as Wormhole Guardians API
    participant SWHC as SUI Wormhole Core
    participant SWTB as SUI Token Bridge
    participant Gateway as SUI Gateway
    participant TBTC as SUI TBTC Token

    %% Phase 1: User initiates deposit
    User->>SDK: Connect SUI wallet & Initiate Mint
    SDK->>SDK: Create Deposit object (off-chain)
    SDK->>SDK: Calculate deposit address (using Deposit obj parameters)
    SDK-->>User: P2(W)SH deposit address
    User->>BTC: Send BTC to deposit address
    BTC-->>User: Confirms transaction

    %% Phase 2: Reveal deposit on SUI
    User->>SDK: Trigger reveal (after BTC confirmations)
    SDK->>SuiBD: initialize_deposit(funding_tx, deposit_reveal, deposit_owner)
    SuiBD->>SuiBD: Emit DepositInitialized event

    %% Phase 3: Relayer detects SUI event and initializes L1 deposit
    SuiBD-->>Relayer: DepositInitialized event detected
    Relayer->>L1BTCDeptWH: initializeDeposit(fundingTx, reveal, l2DepositOwner)
    L1BTCDeptWH->>Bridge: revealDepositWithExtraData(...)
    Bridge->>Bridge: Verify deposit & start minting process

    %% Phase 4: Minting completed on L1, relayer finalizes L1 part
    Bridge-->>L1BTCDeptWH: tBTC minted to BTCDepositorWormhole
    Bridge-->>Relayer: OptimisticMintingFinalized event
    Relayer->>L1BTCDeptWH: quoteFinalizeDeposit() # Gets only base Wormhole message fee
    L1BTCDeptWH-->>Relayer: wormhole message fee required
    Relayer->>L1BTCDeptWH: finalizeDeposit(depositKey) {value: wormholeMsgFee}
    Note over Relayer, L1BTCDeptWH: finalizeDeposit TX executes & completes

    %% Phase 5: L1 initiates Wormhole transfer (within finalizeDeposit)
    L1BTCDeptWH->>WHTB: approve(amount)
    L1BTCDeptWH->>WHTB: transferTokensWithPayload(tbtcToken, amount, l2ChainId, l2WormholeGateway, payload)
    Note over L1BTCDeptWH, WHTB: Sequence number returned internally
    L1BTCDeptWH->>L1BTCDeptWH: Emit TokensTransferredWithPayload(amount, receiver, sequence)

    %% Phase 6: Relayer detects L1 event, fetches VAA
    L1BTCDeptWH-->>Relayer: TokensTransferredWithPayload event detected (contains sequence)
    loop Poll Guardian API
        Relayer->>Guardians: GET /v1/signed_vaa/{l1ChainId}/{tokenBridgeEmitter}/{sequence}
        alt VAA Ready
            Guardians-->>Relayer: Return signed VAA bytes
        else VAA Not Ready
            Guardians-->>Relayer: 404 Not Found (or similar)
            Relayer->>Relayer: Wait and retry
        end
    end

    %% Phase 7: Relayer submits VAA to SUI
    Relayer->>SuiBD: receiveWormholeMessages(vaa_bytes) # Sui Transaction (paid by Relayer SUI)

    %% Phase 8: VAA processed on SUI
    SuiBD->>SWHC: parse_and_verify(vaa_bytes)
    SWHC-->>SuiBD: verified parsed_vaa
    SuiBD->>SuiBD: Check against processed_vaas & verify emitter (L1 WHTB)
    SuiBD->>Gateway: redeem_tokens(vaa_bytes)

    %% Phase 9: Token redemption and minting on SUI
    Gateway->>SWTB: complete_transfer_with_payload(vaa)
    SWTB-->>Gateway: Wrapped tokens
    Gateway->>TBTC: mint_from_gateway(amount, recipient)
    TBTC-->>User: tBTC tokens received on SUI
```

## Key VAA Message Flow (using BTCDepositorWormhole)

The Wormhole VAA relay process, driven by the off-chain relayer listening to L1 events:

```mermaid
flowchart TD
    A[Relayer calls L1BTCDepositorWormhole.finalizeDeposit] --> B{finalizeDeposit TX Confirmed?}
    B -->|Yes| C[Relayer waits for TokensTransferredWithPayload event]
    C --> D[Extract Sequence from event]
    D --> E[Relayer polls Guardian API with sequence]
    E --> F{VAA Available?}
    F -->|Yes| G[Relayer receives signed VAA bytes]
    F -->|No| E
    G --> H[Relayer submits Sui TX: BitcoinDepositor.receiveWormholeMessages(VAA)]
    H --> I[SUI Wormhole Core verifies VAA]
    I --> J[BitcoinDepositor checks replay & emitter]
    J --> K[Gateway.redeem_tokens called with VAA]
    K --> L[SUI Token Bridge processes transfer]
    L --> M[Canonical tBTC minted to user]

    B -->|No/Error| N[Relayer handles L1 TX error]
```

## Implementation Notes (Final)

1.  **L1 Contract:** `BTCDepositorWormhole.sol` is used on L1.
2.  **VAA Payload Format**: The payload contains the `l2DepositOwner` address (Sui address) in Wormhole `bytes32` format, encoded using `abi.encodePacked`. The Sui Gateway must decode this.
3.  **Trusted Emitter**: The Sui `BitcoinDepositor.ReceiverState.trusted_emitter` must be set to the **L1 Wormhole Token Bridge address**.
4.  **Sequence Numbers**: The `TokensTransferredWithPayload` event emitted by `BTCDepositorWormhole` provides the sequence number needed by the relayer to fetch the VAA.
5.  **VAA Fetch & Submit**: This is an **off-chain relayer responsibility**. The relayer listens for the L1 event, polls the Guardian API, and submits the VAA via a Sui transaction (paying SUI gas).
6.  **Fee Structure:**
    - The caller of `finalizeDeposit` on L1 pays the base `wormhole.messageFee()`.
    - The Relayer pays the gas fee in SUI for the `receiveWormholeMessages` transaction.
7.  **Verification Flow**: Similar to before, but emphasizes the event-driven trigger:
    - Relayer verifies L1 `finalizeDeposit` success.
    - Relayer receives `TokensTransferredWithPayload` event.
    - Relayer fetches VAA using correct sequence/emitter from event.
    - Sui Wormhole Core verifies VAA signatures.
    - Sui BitcoinDepositor verifies the emitter chain/address and checks for replay.
    - Sui Gateway handles final token bridge payload parsing and redemption.
