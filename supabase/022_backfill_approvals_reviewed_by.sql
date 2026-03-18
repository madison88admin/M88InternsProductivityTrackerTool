-- Migration: Backfill reviewed_by on historical approvals
-- Uses audit trail action `approval.approved` to capture the actual approving user.

WITH latest_approval_audits AS (
  SELECT DISTINCT ON (entity_id)
    entity_id,
    user_id
  FROM audit_logs
  WHERE entity_type = 'approval'
    AND action = 'approval.approved'
    AND user_id IS NOT NULL
    AND entity_id IS NOT NULL
  ORDER BY entity_id, created_at DESC
)
UPDATE approvals a
SET reviewed_by = la.user_id
FROM latest_approval_audits la
WHERE a.id = la.entity_id
  AND a.status = 'approved'
  AND a.reviewed_at IS NOT NULL
  AND a.reviewed_by IS NULL;
