alter table public.feedback_reports
  add column if not exists support_email_sent_at timestamptz;

create index if not exists feedback_reports_user_email_sent_idx
  on public.feedback_reports(user_id, support_email_sent_at, created_at desc);
