-- @description Record analysis findings and hand the job to the user for mapping. Resets the attempt budget for the import phase. Returns no rows if the lease was lost.
-- @param {String} $1:leaseOwner worker identity; must still hold a live lease
-- @param {String} $2:jobId the job being settled
-- @param {Json} $3:detectedHeaders header cells as parsed from the file
-- @param {String} $4:detectedDelimiter
-- @param {String} $5:detectedEncoding
-- @param {Int} $6:headerRowIndex zero-based row the headers were found on
-- @param {Json} $7:sampleRows leading data rows, for the mapping preview
-- @param {Json} $8:proposedMapping detected column -> contact field guesses
-- @param {String} $9:inferenceSource LLM or HEURISTIC
-- @param {Int} $10:totalRows data rows, excluding the header row
UPDATE "ImportJob"
SET
  "status" = 'AWAITING_MAPPING',
  "attempts" = 0,
  "detectedHeaders" = $3,
  "detectedDelimiter" = $4,
  "detectedEncoding" = $5,
  "headerRowIndex" = $6,
  "sampleRows" = $7,
  "proposedMapping" = $8,
  "inferenceSource" = $9::"InferenceSource",
  "totalRows" = $10,
  "leaseOwner" = NULL,
  "leaseExpiresAt" = NULL,
  "updatedAt" = now()
WHERE
  "id" = $2::UUID
  AND "leaseOwner" = $1
  AND "leaseExpiresAt" > now()
RETURNING
  "id";
