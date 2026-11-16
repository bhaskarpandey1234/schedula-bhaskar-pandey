-- Enum values must commit before later migrations use them.
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'staff';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'admin';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'checkin_token';
