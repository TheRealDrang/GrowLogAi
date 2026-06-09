-- Migration 008: Add followup_days to session_logs
--
-- Enables the advisor to flag that a specific action was recommended and
-- the user should check back in N days. The alerts system reads this field
-- instead of scanning log text for keywords.

alter table session_logs
  add column if not exists followup_days integer not null default 0;

comment on column session_logs.followup_days is
  'Number of days after this session the user should check back in. 0 = no follow-up needed. Set by the advisor when a specific action is recommended.';
