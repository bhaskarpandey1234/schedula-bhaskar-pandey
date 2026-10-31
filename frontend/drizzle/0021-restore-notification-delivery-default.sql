-- Restore the delivery status default removed while changing the enum type.
-- Keep the trigger explicit as a second defense against future schema drift.
ALTER TABLE public.notification_deliveries
  ALTER COLUMN status SET DEFAULT 'pending'::public.notification_delivery_status;

CREATE OR REPLACE FUNCTION public.enqueue_notification_delivery()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO notification_deliveries(notification_id, recipient_id, appointment_id, channel, template, status, scheduled_at, dedupe_key)
  SELECT NEW.id, NEW.recipient_id, NEW.appointment_id, channels.channel, NEW.type::text,
         'pending'::notification_delivery_status, now(),
         COALESCE(NEW.dedupe_key, 'notification/' || NEW.id::text) || '/' || channels.channel
  FROM (
    SELECT 'email'::notification_channel AS channel
    WHERE EXISTS (SELECT 1 FROM notification_preferences p WHERE p.recipient_id = NEW.recipient_id AND p.operational_email)
    UNION ALL
    SELECT 'sms'::notification_channel
    WHERE EXISTS (SELECT 1 FROM notification_preferences p WHERE p.recipient_id = NEW.recipient_id AND p.operational_sms)
  ) channels
  ON CONFLICT (dedupe_key) DO NOTHING;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
