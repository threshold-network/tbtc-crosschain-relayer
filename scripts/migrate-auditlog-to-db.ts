import { prisma } from '../utils/prisma.js';
import * as fs from 'fs';
import * as readline from 'readline';
import path from 'path';
import { chainConfigs, type AnyChainConfig } from '../config/index.js';

const LOG_FILE = path.resolve('logs/deposit_audit.log');

async function getDefaultChainIdForBackfill(): Promise<string> {
  console.log('Attempting to determine default chainId for backfilling existing records...');
  // Convert chainConfigs object to an array of configs
  const configsArray: AnyChainConfig[] = Object.values(chainConfigs).filter(
    (config): config is AnyChainConfig => !!config,
  );

  if (configsArray.length === 0) {
    console.error('CRITICAL: No chain configurations found in the loaded chainConfigs object.');
    throw new Error(
      'Cannot determine defaultChainId: No chain configurations loaded. Ensure your environment is configured for at least one chain.',
    );
  }

  // If a multi-chain config file/JSON *is* explicitly set and yields multiple configs, backfilling is ambiguous.
  // This check might need adjustment based on how multi-chain is determined now.
  // For now, assuming if more than one config is present, it's a multi-chain setup.
  if (configsArray.length > 1) {
    console.error('CRITICAL: Multiple chain configurations were loaded.');
    console.error(`Loaded chains: ${configsArray.map((c) => c.chainName).join(', ')}`);
    console.error(
      'Backfilling with a single default chainId is ambiguous in this multi-chain setup.',
    );
    console.error(
      'To proceed with this migration script for backfilling legacy data, you must ensure that only one chain configuration is active (e.g., by temporarily commenting out others in your config file or setup).',
    );
    throw new Error(
      'Multiple configurations loaded; cannot determine a single default chainId for backfill.',
    );
  }

  const primaryConfig = configsArray[0];
  const defaultChainId = primaryConfig.chainName;

  if (!defaultChainId || typeof defaultChainId !== 'string' || defaultChainId.trim() === '') {
    console.error(
      `CRITICAL: Invalid chainName ('${defaultChainId}') obtained from the primary configuration: ${JSON.stringify(primaryConfig)}`,
    );
    throw new Error(
      `Invalid defaultChainId determined. Check your chain configuration's chainName.`,
    );
  }

  console.log(
    `Using defaultChainId: '${defaultChainId}' (from chainName: '${primaryConfig.chainName}') for backfilling.`,
  );
  return defaultChainId;
}

async function backfillChainIdInDbTables(defaultChainId: string, dry: boolean) {
  console.log(`\nStarting backfill of chainId ('${defaultChainId}') for existing records...`);

  const tablesToBackfill = [
    { name: 'Deposit', model: prisma.deposit },
    { name: 'AuditLog', model: prisma.auditLog },
    { name: 'Redemption', model: prisma.redemption },
  ];

  for (const { name, model } of tablesToBackfill) {
    console.log(`Checking table: ${name} for records with null chainId.`);
    if (dry) {
      const count = await model.count({ where: { chainId: null } });
      console.log(
        `[DRY RUN] Would update ${count} records in ${name} to set chainId = '${defaultChainId}'.`,
      );
    } else {
      try {
        const result = await model.updateMany({
          where: { chainId: null },
          data: { chainId: defaultChainId },
        });
        console.log(
          `Updated ${result.count} records in ${name} with chainId = '${defaultChainId}'.`,
        );
      } catch (error) {
        console.error(`Error backfilling chainId for table ${name}:`, error);
        throw error;
      }
    }
  }
  console.log('Backfill of chainId in database tables complete.');
}

async function migrateAuditLog({ dry }: { dry: boolean }) {
  const defaultChainId = await getDefaultChainIdForBackfill();

  await backfillChainIdInDbTables(defaultChainId, dry);

  console.log(`\nStarting migration of audit logs from file: ${LOG_FILE}`);
  console.log(`New entries will be assigned chainId: '${defaultChainId}'`);

  if (!fs.existsSync(LOG_FILE)) {
    console.error(`Log file not found: ${LOG_FILE}`);
    process.exit(1);
  }

  const fileStream = fs.createReadStream(LOG_FILE);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
  let count = 0;
  let errors = 0;
  let fileEntriesProcessed = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    fileEntriesProcessed++;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch (err) {
      console.error(`Invalid JSON at line ${fileEntriesProcessed}:`, err);
      errors++;
      continue;
    }
    const { timestamp, eventType, depositId, data } = entry;
    if (dry) {
      console.log(`[DRY RUN] Would insert:`, {
        timestamp,
        eventType,
        depositId,
        data,
        chainId: defaultChainId,
      });
    } else {
      try {
        await prisma.auditLog.create({
          data: {
            timestamp: timestamp ? new Date(timestamp) : undefined,
            eventType,
            depositId,
            data,
            chainId: defaultChainId,
          },
        });
      } catch (err) {
        console.error(`Failed to insert log at line ${fileEntriesProcessed}:`, err);
        errors++;
        continue;
      }
    }
    count++;
    if (count % 100 === 0) console.log(`Processed ${count} lines from log file...`);
  }
  console.log(
    `\nLog file migration complete. Processed: ${count} entries from file. Errors: ${errors}`,
  );
  await prisma.$disconnect();
}

const dry = process.argv.includes('--dry');

migrateAuditLog({ dry }).catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
