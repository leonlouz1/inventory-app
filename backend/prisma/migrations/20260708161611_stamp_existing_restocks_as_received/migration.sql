-- Stamp all past restocks that exist in the database as already received.
-- These were entered manually and stock was already adjusted by hand,
-- so applyPendingRestocks must not increment stock for them again.
UPDATE restocks
SET received_at = NOW()
WHERE expected_date <= CURRENT_DATE
  AND received_at IS NULL;