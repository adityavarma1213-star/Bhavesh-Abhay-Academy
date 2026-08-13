-- BAA migration 002 — historical numbering marker.
-- The canonical schema already contains the foundation that was introduced
-- during the early G1/G2 design checkpoints. This marker preserves the
-- migration sequence without silently recreating tables already owned by
-- db/schema.sql.
SELECT 1;
