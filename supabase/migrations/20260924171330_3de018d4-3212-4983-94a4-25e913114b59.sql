REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_attendance_records_created_at ON public.attendance_records (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rfid_cards_card_uid ON public.rfid_cards (card_uid);
CREATE INDEX IF NOT EXISTS idx_rfid_cards_student_id ON public.rfid_cards (student_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_school_decisions_status_starts_at ON public.school_decisions (status, starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_students_user_id ON public.students (user_id);

CREATE OR REPLACE FUNCTION public.get_overview_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'students', (SELECT count(*) FROM public.students),
    'cards', (SELECT count(*) FROM public.rfid_cards),
    'attendance', (SELECT count(*) FROM public.attendance_records),
    'notifications', (SELECT count(*) FROM public.notifications),
    'classes', (SELECT count(*) FROM public.classes),
    'scans', (SELECT count(*) FROM public.card_scans)
  )
$$;
REVOKE EXECUTE ON FUNCTION public.get_overview_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_overview_stats() TO authenticated;

-- profiles: authenticated only
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'director'));
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);

-- user_roles
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage all roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- students
DROP POLICY IF EXISTS "Authenticated can view students" ON public.students;
CREATE POLICY "Staff or self can view students" ON public.students
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'director')
    OR public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'teacher')
    OR public.has_role(auth.uid(), 'gate_monitor')
    OR user_id = auth.uid()
  );

-- rfid_cards
DROP POLICY IF EXISTS "Authenticated can view cards" ON public.rfid_cards;
CREATE POLICY "Staff can view cards" ON public.rfid_cards
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'director')
    OR public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'gate_monitor')
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = rfid_cards.student_id AND s.user_id = auth.uid())
  );

-- card_scans
DROP POLICY IF EXISTS "Authenticated can view scans" ON public.card_scans;
CREATE POLICY "Staff can view scans" ON public.card_scans
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'director')
    OR public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'gate_monitor')
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = card_scans.student_id AND s.user_id = auth.uid())
  );

-- behavior_records
DROP POLICY IF EXISTS "Authenticated can view school admin data" ON public.behavior_records;
CREATE POLICY "Staff can view behavior" ON public.behavior_records
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'director')
    OR public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'teacher')
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = behavior_records.student_id AND s.user_id = auth.uid())
  );

-- attendance_records
DROP POLICY IF EXISTS "Authenticated can view records" ON public.attendance_records;
CREATE POLICY "Staff or self can view attendance" ON public.attendance_records
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'director')
    OR public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'teacher')
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = attendance_records.student_id AND s.user_id = auth.uid())
  );

-- library_loans
DROP POLICY IF EXISTS "Authenticated can view school admin data" ON public.library_loans;
CREATE POLICY "Staff or self can view loans" ON public.library_loans
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'director')
    OR public.has_role(auth.uid(), 'supervisor')
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = library_loans.student_id AND s.user_id = auth.uid())
  );

-- trip_participants
DROP POLICY IF EXISTS "Authenticated can view school admin data" ON public.trip_participants;
CREATE POLICY "Staff or self can view trip participants" ON public.trip_participants
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'director')
    OR public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'teacher')
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = trip_participants.student_id AND s.user_id = auth.uid())
  );

ALTER TABLE public.card_scans
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS visitor_name text;
CREATE INDEX IF NOT EXISTS idx_card_scans_mode ON public.card_scans(mode);
CREATE INDEX IF NOT EXISTS idx_card_scans_student_scanned_at ON public.card_scans(student_id, scanned_at DESC);