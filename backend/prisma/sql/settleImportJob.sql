-- @description Record a finished import and release the lease. Returns no rows if the lease was lost.
-- @param {String} $1:leaseOwner worker identity; must still hold a live lease
-- @param {String} $2:jobId the job being settled
-- @param {Int} $3:importedRows contacts written
-- @param {Int} $4:failedRows rows rejected, each with a matching ImportError row
UPDATE "ImportJob"
SET
  "status" = 'COMPLETED',
  "importedRows" = $3,
  "failedRows" = $4,
  "completedAt" = now(),
  "failureReason" = NULL,
  "leaseOwner" = NULL,
  "leaseExpiresAt" = NULL,
  "updatedAt" = now()
WHERE
  "id" = $2::UUID
  AND "leaseOwner" = $1
  AND "leaseExpiresAt" > now()
RETURNING
  "id";
