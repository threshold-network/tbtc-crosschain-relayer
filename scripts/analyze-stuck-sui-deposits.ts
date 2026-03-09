#!/usr/bin/env ts-node

/**
 * Analysis Script for Stuck SUI Deposits
 *
 * This script searches for on-chain data for stuck deposits without updating the database.
 * It outputs the results to a JSON file for manual review or SQL generation.
 *
 * Purpose:
 *   When SUI deposits get stuck at FINALIZED status due to the bug in SuiChainHandler line 281,
 *   this script finds the missing TokensTransferredWithPayload events that were emitted but not
 *   parsed. It searches in subsequent blocks after finalization to find the bridging transactions.
 *
 * Usage:
 *   export L1_RPC_URL=https://mainnet.infura.io/v3/YOUR_KEY
 *   npx tsx analyze-stuck-sui-deposits.ts
 *
 * Output:
 *   - Creates stuck-deposits-analysis.json with:
 *     - finalizeTxHash: The transaction where OptimisticMintingFinalized was emitted
 *     - eventDetails.transactionHash: The transaction where TokensTransferredWithPayload was emitted
 *     - transferSequence: The Wormhole sequence number needed for bridging
 *     - sqlQuery: Ready-to-use SQL to update the database
 *
 * Important: The generated SQL uses eventDetails.transactionHash for wormholeInfo.txHash,
 * NOT the finalizeTxHash, as the bridging event may occur in a different transaction.
 */

import { ethers } from 'ethers';
import { writeFileSync } from 'fs';
import { L1BitcoinDepositorABI } from '../interfaces/L1BitcoinDepositor.js';
import logger from '../utils/Logger.js';

// Constants
const TOKENS_TRANSFERRED_SIG = ethers.utils.id(
  'TokensTransferredWithPayload(uint256,bytes32,uint64)',
);

// Properly formed deposits stuck at FINALIZED (finalizeTxHash: null)
const STUCK_DEPOSITS = [
  {
    id: '42325933540219796465723565385385761189597086032936836552159044303576256984712',
    fundingTxHash: '0x62991f738b38cdb4708ec507850b2e4f224d7e3bb9c537608304ef8338f3208d',
    finalizationAt: 1752026321505,
  },
  {
    id: '88792792259779513503100670664758251890525032976044653250247310878831247262577',
    fundingTxHash: '0x53239d9484cd9a15b66f6acf1d3b56594f5608fdadc98081a84b40b3bca93a28',
    finalizationAt: 1752050882156,
  },
  {
    id: '31022509137923903033077930255006009924958543410544690861794806772687396463515',
    fundingTxHash: '0x9c91917e5a9c98b9f42232e5ac50654cf083fd91256da9eed56ce1102e256910',
    finalizationAt: 1752016335503,
  },
  {
    id: '91196437094864865312666930921039917604124891491712695595444269776339724709022',
    fundingTxHash: '0x8da834a9dcb376718e784d6a3ba984961f6f594ea3ee13565fdf960f50dc2705',
    finalizationAt: 1752023957066,
  },
];

interface DepositAnalysis {
  id: string;
  fundingTxHash: string;
  finalizationAt: number;
  finalizeTxHash: string | null;
  transferSequence: string | null;
  eventDetails: any | null;
  searchDetails: {
    searchedBlocks: { from: number; to: number };
    foundInBlock?: number;
    foundInTxIndex?: number;
  } | null;
  error?: string;
}

async function searchForFinalizationTx(
  provider: ethers.providers.JsonRpcProvider,
  depositId: string,
  approximateTimestamp: number,
): Promise<{ txHash: string | null; searchDetails: any }> {
  try {
    // Convert timestamp to block number (approximate)
    // Ethereum mainnet has ~12 second block time
    const currentBlock = await provider.getBlockNumber();
    const currentTimestamp = (await provider.getBlock(currentBlock)).timestamp;
    const secondsAgo = currentTimestamp - Math.floor(approximateTimestamp / 1000);
    const blocksAgo = Math.floor(secondsAgo / 12);
    const targetBlock = Math.max(1, currentBlock - blocksAgo);

    logger.info(
      `  Searching around block ${targetBlock} (timestamp: ${new Date(approximateTimestamp).toISOString()})`,
    );

    // Search in a range of blocks
    const searchRange = 50; // +/- 50 blocks (~10 minutes)
    const fromBlock = Math.max(1, targetBlock - searchRange);
    const toBlock = Math.min(currentBlock, targetBlock + searchRange);

    const searchDetails = {
      searchedBlocks: { from: fromBlock, to: toBlock },
      targetBlock,
      approximateTimestamp: new Date(approximateTimestamp).toISOString(),
    };

    // Look for OptimisticMintingFinalized events with our depositKey
    const depositKey = ethers.BigNumber.from(depositId);

    // Query for OptimisticMintingFinalized events
    const vaultAddress = '0x9C070027cdC9dc8F82416B2e5314E11DFb4FE3CD'; // TBTC Vault on mainnet
    const vaultContract = new ethers.Contract(
      vaultAddress,
      [
        'event OptimisticMintingFinalized(address indexed minter, uint256 indexed depositKey, address indexed depositor, uint256 optimisticMintingDebt)',
      ],
      provider,
    );

    const filter = vaultContract.filters.OptimisticMintingFinalized(null, depositKey);
    const events = await vaultContract.queryFilter(filter, fromBlock, toBlock);

    if (events.length > 0) {
      const event = events[0];
      logger.info(`  ✓ Found OptimisticMintingFinalized event in tx: ${event.transactionHash}`);
      return {
        txHash: event.transactionHash,
        searchDetails: {
          ...searchDetails,
          foundInBlock: event.blockNumber,
          foundInTxIndex: event.transactionIndex,
        },
      };
    }

    logger.warn(`  No OptimisticMintingFinalized event found in blocks ${fromBlock}-${toBlock}`);
    return { txHash: null, searchDetails };
  } catch (error: any) {
    logger.error(`  Error searching for finalization tx: ${error.message}`);
    return {
      txHash: null,
      searchDetails: { error: error.message },
    };
  }
}

async function analyzeStuckDeposits(): Promise<void> {
  const results: DepositAnalysis[] = [];

  try {
    // Validate environment
    const l1RpcUrl = process.env.L1_RPC_URL;
    if (!l1RpcUrl) {
      throw new Error('Please set L1_RPC_URL environment variable');
    }

    logger.info('========================================');
    logger.info('SUI Deposit Analysis Script');
    logger.info('========================================');
    logger.info(`Using L1 RPC: ${l1RpcUrl}`);
    logger.info(`Timestamp: ${new Date().toISOString()}`);
    logger.info('');

    // Initialize provider and contract interface
    const provider = new ethers.providers.JsonRpcProvider(l1RpcUrl);
    const contractInterface = new ethers.utils.Interface(L1BitcoinDepositorABI);

    // Test connection
    try {
      const blockNumber = await provider.getBlockNumber();
      logger.info(`Connected to Ethereum - Block height: ${blockNumber}`);
    } catch (error: any) {
      throw new Error(`Failed to connect to Ethereum RPC: ${error.message}`);
    }

    logger.info('');
    logger.info(`Analyzing ${STUCK_DEPOSITS.length} stuck deposits...`);
    logger.info('----------------------------------------');

    // Process each stuck deposit
    for (const depositMeta of STUCK_DEPOSITS) {
      logger.info(`\nAnalyzing deposit ${depositMeta.id}`);
      logger.info(`  Funding TX: ${depositMeta.fundingTxHash}`);

      const analysis: DepositAnalysis = {
        id: depositMeta.id,
        fundingTxHash: depositMeta.fundingTxHash,
        finalizationAt: depositMeta.finalizationAt,
        finalizeTxHash: null,
        transferSequence: null,
        eventDetails: null,
        searchDetails: null,
      };

      try {
        // Search for the finalization transaction
        logger.info(`  Searching for finalization transaction...`);
        const { txHash, searchDetails } = await searchForFinalizationTx(
          provider,
          depositMeta.id,
          depositMeta.finalizationAt,
        );

        analysis.searchDetails = searchDetails;

        if (!txHash) {
          analysis.error = 'Could not find finalization transaction';
          logger.error(`  ❌ ${analysis.error}`);
          results.push(analysis);
          continue;
        }

        analysis.finalizeTxHash = txHash;

        // Fetch transaction receipt
        logger.info(`  Fetching transaction receipt...`);
        const receipt = await provider.getTransactionReceipt(txHash);

        if (!receipt) {
          analysis.error = `No receipt found for transaction ${txHash}`;
          logger.error(`  ❌ ${analysis.error}`);
          results.push(analysis);
          continue;
        }

        logger.info(
          `  ✓ Receipt found - Block ${receipt.blockNumber}, ${receipt.logs.length} logs`,
        );

        // Find and parse TokensTransferredWithPayload event
        let transferSequence: string | null = null;
        let eventDetails: any = null;

        // Log all events in the transaction for debugging
        logger.info(`  Transaction contains ${receipt.logs.length} logs:`);
        for (let i = 0; i < receipt.logs.length; i++) {
          const log = receipt.logs[i];
          logger.info(`    Log ${i}: ${log.topics[0]} from ${log.address}`);
        }

        // Now look for TokensTransferredWithPayload event - it might be in a subsequent transaction or block
        // Let's search in a wider range of blocks (finalization might trigger bridging in next blocks)
        const searchRangeBlocks = 10; // Search up to 10 blocks after finalization
        logger.info(
          `  Searching for TokensTransferredWithPayload events in blocks ${receipt.blockNumber} to ${receipt.blockNumber + searchRangeBlocks}...`,
        );

        const l1BitcoinDepositorAddress = '0xb810AbD43d8FCFD812d6FEB14fefc236E92a341A'; // Mainnet address
        const tokenBridgeAddress = '0x3ee18B2214AFF97000D974cf647E7C347E8fa585'; // Wormhole Token Bridge mainnet

        // Get all logs in the block range that match our event signature
        const blockLogs = await provider.getLogs({
          fromBlock: receipt.blockNumber,
          toBlock: receipt.blockNumber + searchRangeBlocks,
          topics: [TOKENS_TRANSFERRED_SIG],
        });

        logger.info(
          `  Found ${blockLogs.length} TokensTransferredWithPayload events in blocks ${receipt.blockNumber}-${receipt.blockNumber + searchRangeBlocks}`,
        );

        // Check if any of these logs are from our contracts and relate to our deposit
        for (const log of blockLogs) {
          try {
            const parsedLog = contractInterface.parseLog(log);
            // Check if this event might be related to our deposit by checking the amount or timing
            logger.info(
              `    Event from ${log.address} with sequence ${parsedLog.args.transferSequence}`,
            );

            // If this is from L1BitcoinDepositor, it's likely ours
            if (log.address.toLowerCase() === l1BitcoinDepositorAddress.toLowerCase()) {
              transferSequence = parsedLog.args.transferSequence.toString();
              eventDetails = {
                amount: parsedLog.args.amount.toString(),
                destinationChainReceiver: parsedLog.args.destinationChainReceiver,
                emittingContract: log.address,
                logIndex: log.logIndex,
                transactionHash: log.transactionHash,
                transactionIndex: log.transactionIndex,
              };
              logger.info(`    ✓ Found matching event from L1BitcoinDepositor!`);
              break;
            }
          } catch (parseError: any) {
            logger.debug(`    Failed to parse log: ${parseError.message}`);
          }
        }

        if (!transferSequence) {
          analysis.error = 'No TokensTransferredWithPayload event found in transaction';
          logger.error(`  ❌ ${analysis.error}`);
        } else {
          analysis.transferSequence = transferSequence;
          analysis.eventDetails = eventDetails;

          // Log event details
          logger.info(`  ✓ Found TokensTransferredWithPayload event:`);
          logger.info(`    - Transfer Sequence: ${transferSequence}`);
          logger.info(`    - Amount: ${eventDetails.amount}`);
          logger.info(`    - Destination: ${eventDetails.destinationChainReceiver}`);
          logger.info(`    - Emitted by: ${eventDetails.emittingContract}`);
        }
      } catch (error: any) {
        analysis.error = `Error processing deposit: ${error.message}`;
        logger.error(`  ❌ ${analysis.error}`);
      }

      results.push(analysis);
    }

    // Generate output
    const output = {
      timestamp: new Date().toISOString(),
      rpcUrl: l1RpcUrl,
      totalDeposits: STUCK_DEPOSITS.length,
      successfulAnalysis: results.filter((r) => r.transferSequence !== null).length,
      failedAnalysis: results.filter((r) => r.transferSequence === null).length,
      deposits: results,
      sqlQuery: generateSQLQuery(results),
    };

    // Save to JSON file
    const outputPath = './stuck-deposits-analysis.json';
    writeFileSync(outputPath, JSON.stringify(output, null, 2));

    // Print summary
    logger.info('');
    logger.info('========================================');
    logger.info('Analysis Summary');
    logger.info('========================================');
    logger.info(`Total deposits analyzed: ${output.totalDeposits}`);
    logger.info(`Successfully found data: ${output.successfulAnalysis}`);
    logger.info(`Failed to find data: ${output.failedAnalysis}`);
    logger.info('');
    logger.info(`Results saved to: ${outputPath}`);
  } catch (error: any) {
    logger.error(`Fatal error: ${error.message}`);
    logger.error(error.stack);
    process.exit(1);
  }
}

function generateSQLQuery(results: DepositAnalysis[]): string {
  const successfulResults = results.filter((r) => r.transferSequence !== null);

  if (successfulResults.length === 0) {
    return '-- No deposits with valid transfer sequences found';
  }

  let sql = `-- SQL Query to update stuck SUI deposits with on-chain data
-- Generated at: ${new Date().toISOString()}

-- IMPORTANT: SQL Query Structure Notes
-- 
-- 1. The wormholeInfo.txHash should be the transaction where TokensTransferredWithPayload was emitted,
--    NOT the finalization transaction. These are found in eventDetails.transactionHash.
-- 
-- 2. Do NOT update hashes.eth.finalizeTxHash - this is set during the FINALIZED status update
--    and should remain unchanged when moving to AWAITING_WORMHOLE_VAA.
-- 
-- 3. Dates must be in milliseconds (Unix timestamp * 1000). The query uses:
--    EXTRACT(EPOCH FROM NOW()) * 1000 to get the current timestamp in milliseconds.
-- 
-- 4. Only update dates.lastActivityAt and dates.awaitingWormholeVAAMessageSince.
--    Other date fields like finalizationAt should remain unchanged.
-- 
-- 5. The chainId check is case-sensitive. Use exact match (e.g., 'SuiMainnet') not LIKE '%sui%'.
-- 
-- 6. Always check status = 2 (FINALIZED) to ensure we only update deposits in the correct state.

-- Update deposits with their finalization data
`;

  for (const deposit of successfulResults) {
    sql += `
-- Deposit ${deposit.id}
UPDATE "Deposit"
SET 
  "status" = 3, -- AWAITING_WORMHOLE_VAA
  "wormholeInfo" = jsonb_build_object(
    'txHash', '${deposit.eventDetails.transactionHash}',
    'transferSequence', '${deposit.transferSequence}',
    'bridgingAttempted', false
  ),
  "dates" = jsonb_set(
    jsonb_set(
      "dates",
      '{lastActivityAt}',
      to_jsonb(EXTRACT(EPOCH FROM NOW()) * 1000)::text::jsonb
    ),
    '{awaitingWormholeVAAMessageSince}',
    to_jsonb(EXTRACT(EPOCH FROM NOW()) * 1000)::text::jsonb
  ),
  "error" = NULL
WHERE "id" = '${deposit.id}'
AND "status" = 2 -- Only update if still FINALIZED
AND "chainId" = 'SuiMainnet'; -- Use exact match for case-sensitive chainId
`;
  }

  sql += `
-- Verify the updates
SELECT "id", "chainId", "status", "wormholeInfo", "hashes"->'eth'->'finalizeTxHash' as "finalizeTxHash"
FROM "Deposit"
WHERE "id" IN (${successfulResults.map((d) => `'${d.id}'`).join(', ')});
`;

  return sql;
}

// Run the script if called directly
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

if (process.argv[1] === __filename) {
  analyzeStuckDeposits()
    .then(() => {
      logger.info('\nAnalysis script completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Script failed:', error);
      process.exit(1);
    });
}

export { analyzeStuckDeposits };
