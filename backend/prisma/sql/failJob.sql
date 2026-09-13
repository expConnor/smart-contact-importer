-- @description Give up on a job the caller still holds. Used by both phases. Returns no rows if the lease was lost.
-- @param {String} $1:leaseOwner worker identity; must still hold a live lease
-- @param {String} $2:jobId the job being failed
-- @param {String} $3:failureReason user-facing explanation
UPDATE "ImportJob"
SET
  "status" = 'FAILED',
  "failureReason" = $3,
  "completedAt" = now(),
  "leaseOwner" = NULL,
  "leaseExpiresAt" = NULL,
  "updatedAt" = now()
WHERE
  "id" = $2::UUID
  AND "leaseOwner" = $1
  AND "leaseExpiresAt" > now()
RETURNING
  "id";
