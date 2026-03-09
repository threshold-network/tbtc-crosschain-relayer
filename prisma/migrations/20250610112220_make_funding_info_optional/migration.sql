-- AlterTable
ALTER TABLE "Deposit" ALTER COLUMN "fundingTxHash" DROP NOT NULL,
ALTER COLUMN "outputIndex" DROP NOT NULL;
