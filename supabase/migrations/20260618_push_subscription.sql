-- Add push_subscription column to profiles for Web Push notifications
alter table profiles
  add column if not exists push_subscription text default null;
