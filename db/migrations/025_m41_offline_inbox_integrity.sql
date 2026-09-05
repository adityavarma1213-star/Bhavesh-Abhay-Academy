-- BAA M41: constrain the offline idempotency ledger to server-owned API
-- operations and bounded identifiers. The client is untrusted input; these
-- checks prevent a malformed queue entry from becoming a persistent ledger
-- record even if a future endpoint forgets to validate one field.
ALTER TABLE offline_sync_inbox
  ADD CONSTRAINT offline_sync_operation_id_length
  CHECK (char_length(operation_id) BETWEEN 8 AND 160);

ALTER TABLE offline_sync_inbox
  ADD CONSTRAINT offline_sync_endpoint_length
  CHECK (char_length(endpoint) BETWEEN 1 AND 240);

ALTER TABLE offline_sync_inbox
  ADD CONSTRAINT offline_sync_endpoint_local_api
  CHECK (endpoint LIKE '/api/%' AND endpoint NOT LIKE '%://%' AND endpoint NOT LIKE '//%');

ALTER TABLE offline_sync_inbox
  ADD CONSTRAINT offline_sync_rejection_code_length
  CHECK (rejection_code IS NULL OR char_length(rejection_code) BETWEEN 1 AND 120);
