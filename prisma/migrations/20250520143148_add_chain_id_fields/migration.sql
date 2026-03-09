-- CreateTable
CREATE TABLE "Deposit" (
    "id" TEXT NOT NULL,
    "chainId" TEXT NOT NULL,
    "fundingTxHash" TEXT NOT NULL,
    "outputIndex" INTEGER NOT NULL,
    "hashes" JSONB NOT NULL,
    "receipt" JSONB NOT NULL,
    "owner" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "L1OutputEvent" JSONB,
    "dates" JSONB NOT NULL,
    "error" TEXT,

    CONSTRAINT "Deposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventType" TEXT NOT NULL,
    "depositId" TEXT,
    "data" JSONB NOT NULL,
    "errorCode" INTEGER,
    "chainId" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Redemption" (
    "id" TEXT NOT NULL,
    "chainId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "Redemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Deposit_chainId_idx" ON "Deposit"("chainId");

-- CreateIndex
CREATE INDEX "AuditLog_chainId_idx" ON "AuditLog"("chainId");

-- CreateIndex
CREATE INDEX "Redemption_chainId_idx" ON "Redemption"("chainId");
