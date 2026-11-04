CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _name text;
  _whitelisted_role app_role;
  _requested_role app_role;
  _requested_text text;
BEGIN
  _name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'name', ''),
    NEW.email
  );

  INSERT INTO public.profiles (id, full_name, preferred_language, avatar_url)
  VALUES (
    NEW.id,
    _name,
    COALESCE(NEW.raw_user_meta_data->>'preferred_language','ar'),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
    updated_at = now();

  SELECT role INTO _whitelisted_role
  FROM public.staff_whitelist
  WHERE full_name = _name
  LIMIT 1;

  _requested_text := NEW.raw_user_meta_data->>'requested_role';
  IF _requested_text IS NOT NULL AND _requested_text <> '' THEN
    BEGIN
      _requested_role := _requested_text::app_role;
    EXCEPTION WHEN others THEN
      _requested_role := NULL;
    END;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, COALESCE(_whitelisted_role, _requested_role, 'student'::app_role))
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.students
  SET user_id = NEW.id
  WHERE full_name = _name AND user_id IS NULL;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'on_auth_user_created'
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.ensure_user_roles(_requested_role app_role DEFAULT NULL)
RETURNS SETOF app_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _user_id uuid;
  _email text;
  _name text;
  _avatar text;
  _role app_role;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    u.email,
    COALESCE(NULLIF(u.raw_user_meta_data->>'full_name', ''), NULLIF(u.raw_user_meta_data->>'name', ''), u.email),
    u.raw_user_meta_data->>'avatar_url'
  INTO _email, _name, _avatar
  FROM auth.users u
  WHERE u.id = _user_id;

  INSERT INTO public.profiles (id, full_name, preferred_language, avatar_url)
  VALUES (_user_id, _name, 'ar', _avatar)
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
    avatar_url = COALESCE(public.profiles.avatar_url, EXCLUDED.avatar_url),
    updated_at = now();

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id) THEN
    IF _requested_role IS NOT NULL THEN
      _role := _requested_role;
    ELSIF lower(_email) IN ('boukaachey@gmail.com', 'boukaacheyounes@gmail.com') THEN
      _role := 'admin'::app_role;
    ELSE
      _role := 'student'::app_role;
    END IF;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (_user_id, _role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  IF lower(_email) IN ('boukaachey@gmail.com', 'boukaacheyounes@gmail.com') THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES
      (_user_id, 'admin'::app_role),
      (_user_id, 'director'::app_role),
      (_user_id, 'supervisor'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN QUERY
  SELECT ur.role
  FROM public.user_roles ur
  WHERE ur.user_id = _user_id
  ORDER BY CASE ur.role
    WHEN 'admin' THEN 1
    WHEN 'director' THEN 2
    WHEN 'supervisor' THEN 3
    WHEN 'teacher' THEN 4
    WHEN 'gate_monitor' THEN 5
    WHEN 'parent' THEN 6
    WHEN 'student' THEN 7
    ELSE 99
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_user_roles(app_role) TO authenticated;

INSERT INTO public.profiles (id, full_name, preferred_language, avatar_url)
SELECT
  u.id,
  COALESCE(NULLIF(u.raw_user_meta_data->>'full_name', ''), NULLIF(u.raw_user_meta_data->>'name', ''), u.email),
  COALESCE(u.raw_user_meta_data->>'preferred_language', 'ar'),
  u.raw_user_meta_data->>'avatar_url'
FROM auth.users u
WHERE lower(u.email) IN ('boukaachey@gmail.com', 'boukaacheyounes@gmail.com')
ON CONFLICT (id) DO UPDATE SET
  full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
  avatar_url = COALESCE(public.profiles.avatar_url, EXCLUDED.avatar_url),
  updated_at = now();

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, r.role::app_role
FROM auth.users u
CROSS JOIN (VALUES ('admin'), ('director'), ('supervisor')) AS r(role)
WHERE lower(u.email) IN ('boukaachey@gmail.com', 'boukaacheyounes@gmail.com')
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'student'::app_role
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id
)
ON CONFLICT (user_id, role) DO NOTHING;