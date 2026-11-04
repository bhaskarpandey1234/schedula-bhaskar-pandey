-- Vonage Messages API WhatsApp Sandbox support.
-- WhatsApp remains opt-in and uses the same operational consent model as SMS.

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS operational_whatsapp boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_whatsapp boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_consented_at timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_revoked_at timestamptz;

CREATE OR REPLACE FUNCTION public.enqueue_notification_delivery()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO notification_deliveries(notification_id, recipient_id, appointment_id, channel, template, status, scheduled_at, dedupe_key)
  SELECT NEW.id, NEW.recipient_id, NEW.appointment_id, channels.channel,
         NEW.type::text, 'pending'::notification_delivery_status, now(),
         COALESCE(NEW.dedupe_key, 'notification/' || NEW.id::text) || '/' || channels.channel
  FROM (
    SELECT 'email'::notification_channel AS channel
    WHERE EXISTS (SELECT 1 FROM notification_preferences p WHERE p.recipient_id = NEW.recipient_id AND p.operational_email)
      AND NOT (NEW.type = 'appointment_booked'::notification_type AND EXISTS (SELECT 1 FROM payments payment WHERE payment.appointment_id = NEW.appointment_id))
    UNION ALL
    SELECT 'sms'::notification_channel
    WHERE NEW.type <> 'payment_confirmed'::notification_type
      AND EXISTS (SELECT 1 FROM notification_preferences p WHERE p.recipient_id = NEW.recipient_id AND p.operational_sms)
    UNION ALL
    SELECT 'whatsapp'::notification_channel
    WHERE NEW.type <> 'payment_confirmed'::notification_type
      AND EXISTS (SELECT 1 FROM notification_preferences p WHERE p.recipient_id = NEW.recipient_id AND p.operational_whatsapp)
  ) channels
  ON CONFLICT (dedupe_key) DO NOTHING;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
