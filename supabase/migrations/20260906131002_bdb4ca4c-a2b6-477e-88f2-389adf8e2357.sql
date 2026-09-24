CREATE OR REPLACE FUNCTION public.set_appearance_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_appearance_updated_at() FROM PUBLIC, anon, authenticated;

CREATE TABLE public.appearance_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  is_global BOOLEAN NOT NULL DEFAULT false,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX appearance_settings_user_key ON public.appearance_settings (user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX appearance_settings_global_key ON public.appearance_settings ((is_global)) WHERE is_global;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.appearance_settings TO authenticated;
GRANT ALL ON public.appearance_settings TO service_role;

ALTER TABLE public.appearance_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users can read appearance settings"
  ON public.appearance_settings FOR SELECT TO authenticated
  USING (is_global OR user_id = auth.uid());

CREATE POLICY "Users manage their own appearance"
  ON public.appearance_settings FOR ALL TO authenticated
  USING (user_id = auth.uid() AND NOT is_global)
  WITH CHECK (user_id = auth.uid() AND NOT is_global);

CREATE POLICY "Admins manage the shared appearance"
  ON public.appearance_settings FOR ALL TO authenticated
  USING (is_global AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (is_global AND public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER appearance_settings_updated_at
  BEFORE UPDATE ON public.appearance_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_appearance_updated_at();