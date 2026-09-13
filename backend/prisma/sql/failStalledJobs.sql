-- @description Fail jobs whose worker died and which have exhausted their attempts.
-- @description Run at the top of every worker tick, before claiming.
-- @param {Int} $1:maxAttempts must match the value passed to claimJob
UPDATE "ImportJob"
SET
  "status" = 'FAILED',
  "failureReason" = 'Worker stopped responding; maximum attempts exhausted',
  "completedAt" = now(),
  "leaseOwner" = NULL,
  "leaseExpiresAt" = NULL,
  "updatedAt" = now()
WHERE
  "status" IN ('ANALYZING', 'IMPORTING')
  AND (
    "leaseExpiresAt" IS NULL
    OR "leaseExpiresAt" < now()
  )
  AND "attempts" >= $1
RETURNING
  "id";
