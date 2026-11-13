-- Persist pilot assistant conversations for the signed-in account only.
CREATE TABLE IF NOT EXISTS public.assistant_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.user_role NOT NULL,
  title text NOT NULL DEFAULT 'New conversation' CHECK (char_length(title) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.assistant_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.assistant_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 4000),
  display_payloads jsonb,
  pending_action jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assistant_conversations_user_updated_idx ON public.assistant_conversations (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS assistant_messages_conversation_created_idx ON public.assistant_messages (conversation_id, created_at ASC);

ALTER TABLE public.assistant_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY assistant_conversations_owner ON public.assistant_conversations
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY assistant_messages_conversation_owner ON public.assistant_messages
  FOR ALL TO authenticated USING (EXISTS (
    SELECT 1 FROM public.assistant_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM public.assistant_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()
  ));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assistant_conversations, public.assistant_messages TO authenticated;
NOTIFY pgrst, 'reload schema';
