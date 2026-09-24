-- Tighten profiles policies (scope to authenticated)
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'director'));
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Students: role/self-scoped SELECT, plus teachers scoped to classes they teach
DROP POLICY IF EXISTS "Authenticated can view students" ON public.students;
DROP POLICY IF EXISTS "Staff or self can view students" ON public.students;
CREATE POLICY "Staff or self can view students" ON public.students FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'admin') OR has_role(auth.uid(),'director') OR has_role(auth.uid(),'supervisor')
    OR has_role(auth.uid(),'gate_monitor') OR (user_id = auth.uid())
    OR (has_role(auth.uid(),'teacher') AND EXISTS (
      SELECT 1 FROM public.attendance_sessions s WHERE s.teacher_id = auth.uid() AND s.class_id = students.class_id))
  );

-- rfid_cards: staff + gate + self
DROP POLICY IF EXISTS "Authenticated can view cards" ON public.rfid_cards;
CREATE POLICY "Staff can view cards" ON public.rfid_cards FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'admin') OR has_role(auth.uid(),'director') OR has_role(auth.uid(),'supervisor')
    OR has_role(auth.uid(),'gate_monitor')
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = rfid_cards.student_id AND s.user_id = auth.uid())
  );

-- card_scans: staff + gate + self
DROP POLICY IF EXISTS "Authenticated can view scans" ON public.card_scans;
CREATE POLICY "Staff can view scans" ON public.card_scans FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'admin') OR has_role(auth.uid(),'director') OR has_role(auth.uid(),'supervisor')
    OR has_role(auth.uid(),'gate_monitor')
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = card_scans.student_id AND s.user_id = auth.uid())
  );

-- Behavior: staff + self
DROP POLICY IF EXISTS "Authenticated can view school admin data" ON public.behavior_records;
CREATE POLICY "Staff can view behavior" ON public.behavior_records FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'admin') OR has_role(auth.uid(),'director') OR has_role(auth.uid(),'supervisor')
    OR has_role(auth.uid(),'teacher')
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = behavior_records.student_id AND s.user_id = auth.uid())
  );

-- Attendance: staff (teacher scoped to their sessions) + self
DROP POLICY IF EXISTS "Authenticated can view records" ON public.attendance_records;
DROP POLICY IF EXISTS "Staff or self can view attendance" ON public.attendance_records;
CREATE POLICY "Staff or self can view attendance" ON public.attendance_records FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'admin') OR has_role(auth.uid(),'director') OR has_role(auth.uid(),'supervisor')
    OR (has_role(auth.uid(),'teacher') AND EXISTS (
      SELECT 1 FROM public.attendance_sessions s WHERE s.id = attendance_records.session_id AND s.teacher_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = attendance_records.student_id AND s.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Authenticated can view school admin data" ON public.library_loans;
CREATE POLICY "Staff or self can view loans" ON public.library_loans FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'admin') OR has_role(auth.uid(),'director') OR has_role(auth.uid(),'supervisor')
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = library_loans.student_id AND s.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Authenticated can view school admin data" ON public.trip_participants;
CREATE POLICY "Staff or self can view trip participants" ON public.trip_participants FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'admin') OR has_role(auth.uid(),'director') OR has_role(auth.uid(),'supervisor')
    OR has_role(auth.uid(),'teacher')
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = trip_participants.student_id AND s.user_id = auth.uid())
  );

-- Add card scan mode/note/visitor columns
ALTER TABLE public.card_scans
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS visitor_name text;
CREATE INDEX IF NOT EXISTS idx_card_scans_mode ON public.card_scans(mode);
CREATE INDEX IF NOT EXISTS idx_card_scans_student_scanned_at ON public.card_scans(student_id, scanned_at DESC);

-- Attendance justification workflow
CREATE OR REPLACE FUNCTION public.prevent_late_override()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'late' AND NEW.status <> 'late'
     AND OLD.justified_at IS NULL AND NEW.justified_at IS NULL THEN
    RAISE EXCEPTION 'LATE_NOT_JUSTIFIED: لا يمكن تعديل حالة الطالب من "متأخر" قبل تبرير التأخر.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_prevent_late_override ON public.attendance_records;
CREATE TRIGGER trg_prevent_late_override BEFORE UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.prevent_late_override();

-- Staff whitelist by email (immutable)
ALTER TABLE public.staff_whitelist ADD COLUMN IF NOT EXISTS email text;
CREATE UNIQUE INDEX IF NOT EXISTS staff_whitelist_email_key ON public.staff_whitelist (lower(email)) WHERE email IS NOT NULL;

-- Rewrite handle_new_user: match staff_whitelist by email, no auto-link
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _name text; _email text; _whitelisted_role app_role;
BEGIN
  _email := lower(NEW.email);
  _name := COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name',''), NULLIF(NEW.raw_user_meta_data->>'name',''), NEW.email);
  INSERT INTO public.profiles (id, full_name, preferred_language, avatar_url)
  VALUES (NEW.id, _name, COALESCE(NEW.raw_user_meta_data->>'preferred_language','ar'), NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
    updated_at = now();

  IF _email IN ('boukaachey@gmail.com','boukaacheyounes@gmail.com') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES
      (NEW.id, 'admin'::app_role), (NEW.id, 'director'::app_role), (NEW.id, 'supervisor'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    SELECT role INTO _whitelisted_role FROM public.staff_whitelist
      WHERE email IS NOT NULL AND lower(email) = _email LIMIT 1;
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, COALESCE(_whitelisted_role, 'student'::app_role))
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Realtime subscription policy scoped by role
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can subscribe to realtime" ON realtime.messages;
DROP POLICY IF EXISTS "Realtime scoped by role" ON realtime.messages;
CREATE POLICY "Realtime scoped by role" ON realtime.messages FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'supervisor')
    OR (public.has_role(auth.uid(),'teacher') AND realtime.topic() ~ '^(attendance|behavior|exams|notifications|classes|students)(:|$)')
    OR (public.has_role(auth.uid(),'gate_monitor') AND realtime.topic() ~ '^(card_scans|rfid_cards|notifications|gate)(:|$)')
  );

-- Parent-student link
CREATE TABLE IF NOT EXISTS public.parent_student (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  relation text DEFAULT 'parent',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (parent_user_id, student_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parent_student TO authenticated;
GRANT ALL ON public.parent_student TO service_role;
ALTER TABLE public.parent_student ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Parents see own links" ON public.parent_student FOR SELECT TO authenticated
  USING (parent_user_id = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'director') OR has_role(auth.uid(),'supervisor'));
CREATE POLICY "Staff manage parent links" ON public.parent_student FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'director') OR has_role(auth.uid(),'supervisor'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'director') OR has_role(auth.uid(),'supervisor'));
CREATE INDEX IF NOT EXISTS idx_parent_student_parent ON public.parent_student(parent_user_id);
CREATE INDEX IF NOT EXISTS idx_parent_student_student ON public.parent_student(student_id);