CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _name text;
  _whitelisted_role app_role;
  _requested_role app_role;
  _requested_text text;
BEGIN
  _name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email);
  INSERT INTO public.profiles (id, full_name, preferred_language)
  VALUES (NEW.id, _name, COALESCE(NEW.raw_user_meta_data->>'preferred_language','ar'));

  SELECT role INTO _whitelisted_role FROM public.staff_whitelist
  WHERE full_name = _name LIMIT 1;

  _requested_text := NEW.raw_user_meta_data->>'requested_role';
  IF _requested_text IS NOT NULL AND _requested_text <> '' THEN
    BEGIN
      _requested_role := _requested_text::app_role;
    EXCEPTION WHEN others THEN
      _requested_role := NULL;
    END;
  END IF;

  IF _whitelisted_role IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _whitelisted_role);
  ELSIF _requested_role IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _requested_role);
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'student');
  END IF;

  UPDATE public.students SET user_id = NEW.id WHERE full_name = _name AND user_id IS NULL;

  RETURN NEW;
END;
$function$;