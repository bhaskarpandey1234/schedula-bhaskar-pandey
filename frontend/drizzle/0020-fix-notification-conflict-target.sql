-- Fix notification trigger inserts against the nullable-dedupe partial index.
-- ON CONFLICT (dedupe_key) cannot infer a partial unique index without its
-- predicate, while ON CONFLICT DO NOTHING remains safe for all unique keys.

CREATE OR REPLACE FUNCTION public.enqueue_appointment_lifecycle_notifications()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.status = 'confirmed' AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status <> 'confirmed')) THEN
    INSERT INTO notifications(recipient_id, appointment_id, type, title, message, dedupe_key)
      VALUES (NEW.doctor_id, NEW.id, 'appointment_booked', 'New appointment booked', 'A patient has booked one of your available slots.', 'appointment-booked-doctor/' || NEW.id::text)
      ON CONFLICT DO NOTHING;
  END IF;
  IF NEW.status = 'cancelled' AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status <> 'cancelled')) THEN
    INSERT INTO notifications(recipient_id, appointment_id, type, title, message, dedupe_key)
      VALUES (NEW.doctor_id, NEW.id, 'appointment_cancelled', 'Appointment cancelled', 'A patient appointment was cancelled.', 'appointment-cancelled-doctor/' || NEW.id::text)
      ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_payment_failure_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.status = 'failed' AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status <> 'failed')) THEN
    INSERT INTO notifications(recipient_id, appointment_id, type, title, message, dedupe_key)
      SELECT a.patient_id, a.id, 'payment_failed', 'Payment failed', 'Your appointment payment was not completed. Please try again if the slot is still available.', 'payment-failed/' || NEW.id::text
      FROM appointments a WHERE a.id = NEW.appointment_id
      ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
