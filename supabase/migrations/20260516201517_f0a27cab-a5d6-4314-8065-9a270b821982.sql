-- Fix search_path on trigger functions
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- Revoke public execute on definer functions; grant only to needed roles
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_roles(UUID) FROM PUBLIC, anon;
-- has_role and get_user_roles must remain executable by authenticated users (used in RLS and app)
GRANT EXECUTE ON FUNCTION public.has_role(UUID, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_roles(UUID) TO authenticated;