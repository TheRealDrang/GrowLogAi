-- Performance indexes for the highest-traffic app paths.
-- These are additive only; they do not change table data or app behavior.

-- Chat prompt assembly and crop chat page load: newest messages by crop.
create index if not exists conversations_crop_created_at_idx
  on conversations(crop_id, created_at desc);

-- Diary/session context: newest logs by crop, plus RLS membership checks by garden.
create index if not exists session_logs_crop_created_at_idx
  on session_logs(crop_id, created_at desc);

create index if not exists session_logs_garden_id_idx
  on session_logs(garden_id);

-- Garden pages, bed pickers, and alert generation all read crops by garden.
create index if not exists crops_garden_created_at_idx
  on crops(garden_id, created_at);

create index if not exists crops_garden_status_created_at_idx
  on crops(garden_id, status, created_at);

-- Membership checks are on the hot path for RLS policies, sharing, daily logs, and owner lookups.
create index if not exists garden_members_user_role_idx
  on garden_members(user_id, role);

create index if not exists garden_members_garden_role_idx
  on garden_members(garden_id, role);

-- Advisor Notes dashboard and digest reads: active alerts by user, priority, and recency.
create index if not exists garden_alerts_active_user_priority_generated_idx
  on garden_alerts(user_id, priority, generated_at desc)
  where status = 'active';

-- Alert upsert/dedup and crop-level acknowledgement paths.
create index if not exists garden_alerts_lookup_idx
  on garden_alerts(user_id, alert_type, garden_id, crop_id, created_at desc);

create index if not exists garden_alerts_crop_user_status_idx
  on garden_alerts(crop_id, user_id, status);

-- Daily digest dedupe checks by user and day window.
create index if not exists digest_log_user_sent_at_idx
  on digest_log(user_id, sent_at desc);
