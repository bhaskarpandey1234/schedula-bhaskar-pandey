-- 0066 was already exercised in local environments. Keep historical entries
-- when a development or test account is removed by anonymising its author.
ALTER TABLE public.patient_medical_history_versions
  ALTER COLUMN authored_by DROP NOT NULL;
ALTER TABLE public.visit_summary_versions
  ALTER COLUMN authored_by DROP NOT NULL;

DO $$
DECLARE
  v_constraint text;
BEGIN
  FOR v_constraint IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid IN ('public.patient_medical_history_versions'::regclass, 'public.visit_summary_versions'::regclass)
      AND contype = 'f'
      AND confrelid = 'public.profiles'::regclass
      AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = conrelid AND attname = 'authored_by')]
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',
      (SELECT conrelid::regclass FROM pg_constraint WHERE conname = v_constraint LIMIT 1), v_constraint);
  END LOOP;
END;
$$;

ALTER TABLE public.patient_medical_history_versions
  ADD CONSTRAINT patient_medical_history_versions_authored_by_fkey
  FOREIGN KEY (authored_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.visit_summary_versions
  ADD CONSTRAINT visit_summary_versions_authored_by_fkey
  FOREIGN KEY (authored_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
