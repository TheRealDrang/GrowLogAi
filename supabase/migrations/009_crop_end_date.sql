-- Repurpose the never-used harvest_date column as a general "end date,"
-- set whenever a crop is wrapped up for any reason (not just harvest).
alter table crops rename column harvest_date to end_date;

comment on column crops.end_date is
  'Date the crop was wrapped up (harvested, failed, or removed). Null while status = growing.';

comment on column crops.status is
  'growing | harvested | failed | removed — removed covers crops pulled early or closed out for another reason.';
