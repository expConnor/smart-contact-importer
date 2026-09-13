-- @description Push out a lease the caller still holds. Returns no rows if the lease was lost.
-- @param {String} $1:leaseOwner worker identity; must still hold a live lease
-- @param {String} $2:jobId the job whose lease is being extended
-- @param {Int} $3:leaseSeconds how much longer the claim holds, measured from now
UPDATE "ImportJob"
SET
  "leaseExpiresAt" = now() + ($3::INT * INTERVAL '1 second'),
  "updatedAt" = now()
WHERE
  "id" = $2::UUID
  AND "leaseOwner" = $1
  AND "leaseExpiresAt" > now()
RETURNING
  "id";
