-- Deleting a doctor account must remove its historical queue sessions after
-- the existing appointment cascade, including in local integration cleanup.
ALTER TABLE public.queue_entries DROP CONSTRAINT queue_entries_session_id_fkey;
ALTER TABLE public.queue_entries ADD CONSTRAINT queue_entries_session_id_fkey
  FOREIGN KEY (session_id) REFERENCES public.queue_sessions(id) ON DELETE CASCADE;
ALTER TABLE public.queue_sessions DROP CONSTRAINT queue_sessions_doctor_id_fkey;
ALTER TABLE public.queue_sessions ADD CONSTRAINT queue_sessions_doctor_id_fkey
  FOREIGN KEY (doctor_id) REFERENCES public.doctors(id) ON DELETE CASCADE;
