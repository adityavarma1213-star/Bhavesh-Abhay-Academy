#!/usr/bin/env node
// G6 backup utility. Produces a JSON export of BAA's logical records.
// For a production deployment, pair this with provider-native encrypted
// snapshots and object-storage retention/versioning.
import fs from 'node:fs/promises';
import { sql } from '../api/_lib/db.js';

const tables = [
  'users','user_roles','credentials','auth_sessions','learners','parent_learner',
  'teacher_learner','classes','class_members','learning_profiles','assessment_attempts',
  'assessment_answers','assessment_results','ai_evaluation_records','teacher_reviews',
  'teacher_notes','learning_evidence','learning_memory','learning_memory_history',
  'mistake_patterns','mistake_pattern_occurrences','planner_preferences','planner_goals',
  'planner_upcoming_assessments','planner_tasks','planner_task_events','consent_preferences',
  'audit_log'
];

// Authentication secrets/tokens must never be copied into a portable JSON backup.
// Keep this denylist explicit so adding a new credential-bearing table requires
// an intentional review instead of silently exporting secrets.
const SENSITIVE_TABLES = new Set(['credentials', 'auth_sessions']);
const exportTables = tables.filter((table) => !SENSITIVE_TABLES.has(table));

const out = {
  version: 2,
  exportedAt: new Date().toISOString(),
  tables: {},
  excludedTables: [...SENSITIVE_TABLES],
  security: {
    sensitiveTablesExcluded: true,
    note: 'Credentials and active authentication sessions are intentionally excluded from portable JSON backups. Use provider-native encrypted snapshots for complete production recovery.'
  }
};

for (const table of exportTables) {
  const r = await sql.query(`SELECT * FROM ${table}`);
  out.tables[table] = r.rows;
}

const file = process.argv[2] || `baa-backup-${Date.now()}.json`;
await fs.writeFile(file, JSON.stringify(out, null, 2), 'utf8');
console.log(`Backup written: ${file}`);
