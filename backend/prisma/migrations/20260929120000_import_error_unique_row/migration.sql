-- DropIndex
DROP INDEX "ImportError_importJobId_rowNumber_idx";

-- CreateIndex
CREATE UNIQUE INDEX "ImportError_importJobId_rowNumber_key" ON "ImportError"("importJobId", "rowNumber");

