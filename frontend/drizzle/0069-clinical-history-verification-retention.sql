-- A deleted clinician is anonymised while the fact and time of verification
-- remain part of the patient record's audit history.
ALTER TABLE public.patient_medical_history_versions
  DROP CONSTRAINT IF EXISTS patient_medical_history_versions_check;
ALTER TABLE public.patient_medical_history_versions
  ADD CONSTRAINT patient_medical_history_versions_verification_audit_check
  CHECK (verified_by IS NULL OR verified_at IS NOT NULL);

NOTIFY pgrst, 'reload schema';
