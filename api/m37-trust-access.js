// M37 Trust & Privacy Center — authenticated page-access contract.
import { requireAuth } from './_lib/auth.js';

function noStore(res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      noStore(res);
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }
    const session = await requireAuth(req);
    const roles = Array.isArray(session.roles) ? session.roles : [];
    const allowed = roles.some((role) => ['student', 'parent', 'teacher', 'admin'].includes(role));
    if (!allowed) {
      noStore(res);
      res.status(403).json({ error: 'Trust & Privacy Center access is not available for this account.' });
      return;
    }
    noStore(res);
    res.status(200).json({
      authenticated: true,
      user: { id: session.user_id, displayName: session.display_name || null },
      roles,
    });
  } catch (error) {
    const status = Number(error?.status) || 500;
    noStore(res);
    res.status(status).json({ error: status === 401 ? 'Authentication required.' : 'Trust access check failed.' });
  }
}
