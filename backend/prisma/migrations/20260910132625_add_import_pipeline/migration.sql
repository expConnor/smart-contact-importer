-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('PENDING_ANALYSIS', 'ANALYZING', 'AWAITING_MAPPING', 'PENDING_IMPORT', 'IMPORTING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "InferenceSource" AS ENUM ('LLM', 'HEURISTIC');

-- AlterTable
ALTER TABLE "Contact" ALTER COLUMN "name" SET DEFAULT '',
ALTER COLUMN "company" SET DEFAULT '',
ALTER COLUMN "jobTitle" SET DEFAULT '',
ALTER COLUMN "phone" SET DEFAULT '',
ALTER COLUMN "status" SET DEFAULT '',
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "status" "ImportJobStatus" NOT NULL DEFAULT 'PENDING_ANALYSIS',
    "failureReason" TEXT,
    "leaseExpiresAt" TIMESTAMPTZ(3),
    "leaseOwner" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "detectedHeaders" JSONB,
    "detectedDelimiter" TEXT,
    "detectedEncoding" TEXT,
    "headerRowIndex" INTEGER,
    "sampleRows" JSONB,
    "proposedMapping" JSONB,
    "confirmedMapping" JSONB,
    "inferenceSource" "InferenceSource",
    "totalRows" INTEGER,
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "failedRows" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportError" (
    "id" UUID NOT NULL,
    "importJobId" UUID NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "field" TEXT,
    "message" TEXT NOT NULL,
    "rawRow" JSONB NOT NULL,

    CONSTRAINT "ImportError_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportJob_userId_createdAt_idx" ON "ImportJob"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ImportJob_status_leaseExpiresAt_idx" ON "ImportJob"("status", "leaseExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ImportJob_userId_idempotencyKey_key" ON "ImportJob"("userId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ImportError_importJobId_rowNumber_idx" ON "ImportError"("importJobId", "rowNumber");

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportError" ADD CONSTRAINT "ImportError_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "ImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
