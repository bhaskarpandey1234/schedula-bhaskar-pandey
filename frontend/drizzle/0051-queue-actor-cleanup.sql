-- Preserve the event and timestamp when an operator account is removed.
ALTER TABLE public.appointment_attendance DROP CONSTRAINT appointment_attendance_checked_in_by_fkey;
ALTER TABLE public.appointment_attendance ADD CONSTRAINT appointment_attendance_checked_in_by_fkey
  FOREIGN KEY (checked_in_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.appointment_attendance DROP CONSTRAINT appointment_attendance_no_show_by_fkey;
ALTER TABLE public.appointment_attendance ADD CONSTRAINT appointment_attendance_no_show_by_fkey
  FOREIGN KEY (no_show_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.queue_events DROP CONSTRAINT queue_events_actor_id_fkey;
ALTER TABLE public.queue_events ADD CONSTRAINT queue_events_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
