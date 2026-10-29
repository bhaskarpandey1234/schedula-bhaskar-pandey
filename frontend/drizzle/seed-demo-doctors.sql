-- Schedula demo content seed (run only after creating and verifying these
-- doctor accounts in Supabase Auth). It never creates users or passwords.
-- The email values are intentionally easy to replace for an approved project.
BEGIN;

WITH demo(email, full_name, specialty, clinic_name, experience_years, biography, timezone) AS (
  VALUES
    ('demo.cardiology@schedula.example', 'Dr. Aanya Mehta', 'Cardiology', 'Cedar Heart Clinic', 12, 'Dr. Aanya Mehta helps adults make practical, informed decisions about heart health and preventive care.', 'Asia/Kolkata'),
    ('demo.dermatology@schedula.example', 'Dr. Rohan Shah', 'Dermatology', 'Clearview Skin Centre', 9, 'Dr. Rohan Shah provides thoughtful consultations for common skin, hair, and scalp concerns.', 'Asia/Kolkata'),
    ('demo.general@schedula.example', 'Dr. Kavya Iyer', 'General Medicine', 'Harbor Medical Centre', 14, 'Dr. Kavya Iyer offers comprehensive primary care with a focus on prevention and continuity.', 'Asia/Kolkata')
), matched AS (
  SELECT u.id, demo.* FROM auth.users u JOIN demo ON lower(u.email) = lower(demo.email)
)
INSERT INTO public.profiles (id, full_name, role)
SELECT id, full_name, 'doctor'::public.user_role FROM matched
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

WITH demo(email, full_name, specialty, clinic_name, experience_years, biography, timezone) AS (
  VALUES
    ('demo.cardiology@schedula.example', 'Dr. Aanya Mehta', 'Cardiology', 'Cedar Heart Clinic', 12, 'Dr. Aanya Mehta helps adults make practical, informed decisions about heart health and preventive care.', 'Asia/Kolkata'),
    ('demo.dermatology@schedula.example', 'Dr. Rohan Shah', 'Dermatology', 'Clearview Skin Centre', 9, 'Dr. Rohan Shah provides thoughtful consultations for common skin, hair, and scalp concerns.', 'Asia/Kolkata'),
    ('demo.general@schedula.example', 'Dr. Kavya Iyer', 'General Medicine', 'Harbor Medical Centre', 14, 'Dr. Kavya Iyer offers comprehensive primary care with a focus on prevention and continuity.', 'Asia/Kolkata')
), matched AS (
  SELECT u.id, demo.* FROM auth.users u JOIN demo ON lower(u.email) = lower(demo.email)
)
INSERT INTO public.doctors (id, specialty, clinic_name, experience_years, biography, timezone)
SELECT id, specialty, clinic_name, experience_years, biography, timezone FROM matched
ON CONFLICT (id) DO UPDATE SET specialty = EXCLUDED.specialty, clinic_name = EXCLUDED.clinic_name, experience_years = EXCLUDED.experience_years, biography = EXCLUDED.biography, timezone = EXCLUDED.timezone;

WITH demo(email) AS (VALUES ('demo.cardiology@schedula.example'), ('demo.dermatology@schedula.example'), ('demo.general@schedula.example')),
doctors_to_seed AS (SELECT u.id, d.timezone FROM auth.users u JOIN demo ON lower(u.email) = lower(demo.email) JOIN public.doctors d ON d.id = u.id),
days AS (SELECT generate_series(current_date + 1, current_date + 14, interval '1 day')::date AS session_date),
new_sessions AS (
  INSERT INTO public.availability_sessions (doctor_id, session_date, start_time, end_time, timezone, interval_minutes, capacity, session_start_at, session_end_at)
  SELECT d.id, days.session_date, time '09:00', time '12:00', d.timezone, 30, 3,
    (days.session_date + time '09:00') AT TIME ZONE d.timezone,
    (days.session_date + time '12:00') AT TIME ZONE d.timezone
  FROM doctors_to_seed d CROSS JOIN days
  WHERE extract(isodow FROM days.session_date) < 6
    AND NOT EXISTS (SELECT 1 FROM public.availability_sessions existing WHERE existing.doctor_id = d.id AND existing.session_date = days.session_date)
  RETURNING id, doctor_id, session_start_at, session_end_at, interval_minutes, capacity
)
INSERT INTO public.appointment_slots (availability_session_id, doctor_id, slot_start_at, slot_end_at, capacity)
SELECT s.id, s.doctor_id, slot_start, slot_start + make_interval(mins => s.interval_minutes), s.capacity
FROM new_sessions s
CROSS JOIN LATERAL generate_series(s.session_start_at, s.session_end_at - make_interval(mins => s.interval_minutes), make_interval(mins => s.interval_minutes)) AS slot_start;

COMMIT;
