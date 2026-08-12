#!/usr/bin/env node
// G6 backup utility. Produces a JSON export of BAA's logical records.
// For a production deployment, pair this with provider-native encrypted
// snapshots and object-storage retention/versioning.
import fs from 'node:fs/promises';
import { sql } from '../api/_lib/db.js';
const tables=['users','user_roles','credentials','auth_sessions','learners','parent_learner','teacher_learner','classes','class_members','learning_profiles','assessment_attempts','assessment_answers','assessment_results','ai_evaluation_records','teacher_reviews','teacher_notes','learning_evidence','learning_memory','learning_memory_history','mistake_patterns','mistake_pattern_occurrences','planner_preferences','planner_goals','planner_upcoming_assessments','planner_tasks','planner_task_events','consent_preferences','audit_log'];
const out={version:1,exportedAt:new Date().toISOString(),tables:{}};
for(const table of tables){ const r=await sql.query(`SELECT * FROM ${table}`); out.tables[table]=r.rows; }
const file=process.argv[2]||`baa-backup-${Date.now()}.json`;
await fs.writeFile(file,JSON.stringify(out,null,2),'utf8');
console.log(`Backup written: ${file}`);
