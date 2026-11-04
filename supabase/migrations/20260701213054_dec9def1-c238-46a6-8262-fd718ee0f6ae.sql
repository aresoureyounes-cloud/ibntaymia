
CREATE TABLE public.profile_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  details JSONB,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX profile_audit_log_user_id_idx ON public.profile_audit_log(user_id, created_at DESC);

GRANT SELECT, INSERT ON public.profile_audit_log TO authenticated;
GRANT ALL ON public.profile_audit_log TO service_role;

ALTER TABLE public.profile_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own audit rows" ON public.profile_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users read own audit rows" ON public.profile_audit_log
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins read all audit rows" ON public.profile_audit_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
