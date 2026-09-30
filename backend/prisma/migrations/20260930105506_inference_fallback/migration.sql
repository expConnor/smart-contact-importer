-- CreateEnum
CREATE TYPE "InferenceFallback" AS ENUM ('NO_KEY', 'GUESS_FAILED', 'GUESS_REJECTED');

-- AlterTable
ALTER TABLE "ImportJob" ADD COLUMN     "inferenceFallback" "InferenceFallback";
