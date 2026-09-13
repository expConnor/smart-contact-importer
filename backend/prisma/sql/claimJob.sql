-- @description Claim the next job in one phase of the pipeline. Returns no rows if the queue is empty.
-- @param {String} $1:leaseOwner worker identity
-- @param {Int} $2:leaseSeconds how long the claim holds before another worker may steal it
-- @param {String} $3:pendingStatus queue to drain: PENDING_ANALYSIS or PENDING_IMPORT
-- @param {String} $4:activeStatus phase to move into: ANALYZING or IMPORTING
-- @param {Int} $5:maxAttempts a stalled job is not re-claimed once it has been started this many times
UPDATE "ImportJob"
SET
  "status" = $4::"ImportJobStatus",
  "leaseOwner" = $1,
  "leaseExpiresAt" = now() + ($2::INT * INTERVAL '1 second'),
  "attempts" = "attempts" + 1,
  "startedAt" = COALESCE("startedAt", now()),
  "failureReason" = NULL,
  "updatedAt" = now()
WHERE
  "id" = (
    SELECT
      "id"
    FROM
      "ImportJob"
    WHERE
      "status" = $3::"ImportJobStatus"
      OR (
        "status" = $4::"ImportJobStatus"
        AND (
          "leaseExpiresAt" IS NULL
          OR "leaseExpiresAt" < now()
        )
        AND "attempts" < $5
      )
    ORDER BY
      "createdAt"
    LIMIT
      1
    FOR UPDATE
      SKIP LOCKED
  )
RETURNING
  "id",
  "userId",
  "storagePath",
  "originalFilename",
  "byteSize",
  "attempts",
  "detectedDelimiter",
  "detectedEncoding",
  "headerRowIndex",
  "confirmedMapping",
  "totalRows";
