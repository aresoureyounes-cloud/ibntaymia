-- Fix 1: Remove privilege escalation via requested_role in signup metadata
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
    -- Role elevation only through staff_whitelist (server-controlled) or admin action.
    -- Never trust requested_role from client-supplied raw_user_meta_data.
    SELECT role INTO _whitelisted_role FROM public.staff_whitelist WHERE full_name = _name LIMIT 1;
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, COALESCE(_whitelisted_role, 'student'::app_role))
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  UPDATE public.students SET user_id = NEW.id WHERE full_name = _name AND user_id IS NULL;

  RETURN NEW;
END;
$function$;

-- Fix 2: Restrict teacher visibility of students to only those in classes they teach
DROP POLICY IF EXISTS "Staff or self can view students" ON public.students;
CREATE POLICY "Staff or self can view students"
ON public.students
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'director'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
  OR has_role(auth.uid(), 'gate_monitor'::app_role)
  OR (user_id = auth.uid())
  OR (
    has_role(auth.uid(), 'teacher'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.attendance_sessions s
      WHERE s.teacher_id = auth.uid() AND s.class_id = students.class_id
    )
  )
);

-- Fix 3: Restrict teacher visibility of attendance to their own sessions
DROP POLICY IF EXISTS "Staff or self can view attendance" ON public.attendance_records;
CREATE POLICY "Staff or self can view attendance"
ON public.attendance_records
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'director'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
  OR (
    has_role(auth.uid(), 'teacher'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.attendance_sessions s
      WHERE s.id = attendance_records.session_id AND s.teacher_id = auth.uid()
    )
  )
  OR EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = attendance_records.student_id AND s.user_id = auth.uid()
  )
);