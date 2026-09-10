import { sql } from './db.js';

function header(req, name) {
  const h = req.headers || {};
  return h[name] || h[name.toLowerCase()] || h[name.toUpperCase()] || null;
}

export async function beginOfflineOperation(req, { learnerId, endpoint }) {
  const operationId = String(header(req, 'x-baa-operation-id') || '').trim();
  if (!operationId) return { enabled: false };
  const createdRaw = header(req, 'x-baa-operation-created-at');
  const createdAt = createdRaw && !Number.isNaN(Date.parse(createdRaw)) ? new Date(createdRaw).toISOString() : new Date().toISOString();
  const existing = await sql`SELECT operation_id,learner_id,status,response,rejection_code,operation_created_at FROM offline_sync_inbox WHERE operation_id=${operationId} LIMIT 1`;
  if (existing.rows.length) {
    const row = existing.rows[0];
    if (row.learner_id !== learnerId || row.endpoint !== endpoint) {
      const e = new Error('Offline operation identity conflict.'); e.status = 409; e.code = 'OFFLINE_OPERATION_CONFLICT'; throw e;
    }
    if (row.status === 'applied' && row.response) return { enabled: true, duplicate: true, response: row.response };
    if (row.status === 'rejected') { const e = new Error(row.rejection_code || 'Offline operation rejected.'); e.status = 409; e.code = row.rejection_code || 'OFFLINE_OPERATION_REJECTED'; throw e; }
    // A crashed request may leave a processing row. Allow a retry after ten minutes.
    const age = Date.now() - new Date(row.operation_created_at).getTime();
    if (age < 10 * 60 * 1000) { const e = new Error('Offline operation is already being processed.'); e.status = 409; e.code = 'OFFLINE_OPERATION_IN_PROGRESS'; throw e; }
    await sql`UPDATE offline_sync_inbox SET status='processing',updated_at=NOW(),operation_created_at=${createdAt} WHERE operation_id=${operationId}`;
  } else {
    // Server-wins conflict rule for queued snapshots: an older offline write
    // is rejected when a newer operation for the same learner/endpoint exists.
    const latest = await sql`SELECT operation_created_at FROM offline_sync_inbox WHERE learner_id=${learnerId} AND endpoint=${endpoint} AND status='applied' ORDER BY operation_created_at DESC LIMIT 1`;
    if (latest.rows[0]?.operation_created_at && new Date(createdAt).getTime() < new Date(latest.rows[0].operation_created_at).getTime()) {
      const e = new Error('Queued change is older than the latest server-applied change.'); e.status = 409; e.code = 'OFFLINE_STALE_CONFLICT'; throw e;
    }
    await sql`INSERT INTO offline_sync_inbox(operation_id,learner_id,endpoint,operation_created_at,status,created_at,updated_at) VALUES(${operationId},${learnerId},${endpoint},${createdAt},'processing',NOW(),NOW())`;
  }
  return { enabled: true, duplicate: false, operationId };
}

export async function completeOfflineOperation(operation, response) {
  if (!operation?.enabled || operation.duplicate) return;
  await sql`UPDATE offline_sync_inbox SET status='applied',response=${JSON.stringify(response)}::jsonb,updated_at=NOW() WHERE operation_id=${operation.operationId}`;
}

export async function rejectOfflineOperation(operation, code) {
  if (!operation?.enabled || operation.duplicate) return;
  await sql`UPDATE offline_sync_inbox SET status='rejected',rejection_code=${String(code||'OFFLINE_OPERATION_REJECTED').slice(0,120)},updated_at=NOW() WHERE operation_id=${operation.operationId}`;
}
