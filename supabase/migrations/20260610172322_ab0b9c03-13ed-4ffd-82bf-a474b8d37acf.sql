
-- 1. Add email-based whitelist column (immutable identifier)
ALTER TABLE public.staff_whitelist ADD COLUMN IF NOT EXISTS email text;
CREATE UNIQUE INDEX IF NOT EXISTS staff_whitelist_email_key ON public.staff_whitelist (lower(email)) WHERE email IS NOT NULL;

-- 2. Rewrite handle_new_user to:
--    - Match staff_whitelist by email (not user-supplied name)
--    - Remove auto-link of students by name (admins must link explicitly)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _name text;
  _email text;
  _whitelisted_role app_role;
BEGIN
  _email := lower(NEW.email);
  _name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'full_name',''),
    NULLIF(NEW.raw_user_meta_data->>'name',''),
    NEW.email
  );

  INSERT INTO public.profiles (id, full_name, preferred_language, avatar_url)
  VALUES (NEW.id, _name, COALESCE(NEW.raw_user_meta_data->>'preferred_language','ar'), NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
    updated_at = now();

  IF _email IN ('boukaachey@gmail.com','boukaacheyounes@gmail.com') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES
      (NEW.id, 'admin'::app_role),
      (NEW.id, 'director'::app_role),
      (NEW.id, 'supervisor'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    -- Role elevation only via staff_whitelist matched on EMAIL (immutable, not spoofable).
    -- Names from raw_user_meta_data are attacker-controlled and MUST NOT grant roles.
    SELECT role INTO _whitelisted_role
      FROM public.staff_whitelist
      WHERE email IS NOT NULL AND lower(email) = _email
      LIMIT 1;
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, COALESCE(_whitelisted_role, 'student'::app_role))
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  -- Student linkage is no longer automatic by name — admins must link explicitly
  -- (e.g. via fake_email) to prevent account hijacking by display-name spoofing.

  RETURN NEW;
END;
$function$;

-- 3. Tighten realtime.messages subscription policy.
--    Previously: any staff role could subscribe to ALL topics, leaking PII
--    (date_of_birth, fake_email, fake_phone, behavior, attendance) to
--    teachers and gate_monitors beyond what their RLS SELECT permits.
--    Now: admin/director/supervisor get full access; teachers and
--    gate_monitors are scoped to topics relevant to their role.
DROP POLICY IF EXISTS "Staff can subscribe to realtime" ON realtime.messages;

CREATE POLICY "Realtime scoped by role"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'director'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
    OR (
      public.has_role(auth.uid(), 'teacher'::app_role)
      AND realtime.topic() ~ '^(attendance|behavior|exams|notifications|classes|students)(:|$)'
    )
    OR (
      public.has_role(auth.uid(), 'gate_monitor'::app_role)
      AND realtime.topic() ~ '^(card_scans|rfid_cards|notifications|gate)(:|$)'
    )
  );
