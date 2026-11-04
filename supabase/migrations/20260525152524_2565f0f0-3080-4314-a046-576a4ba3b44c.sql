
-- 1. Fix profiles: scope to authenticated only
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

-- 2. Lock down user_roles: remove self-INSERT
DROP POLICY IF EXISTS "Users can create own role during test" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;

CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. Ensure new-user trigger is attached (assigns roles server-side)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Students: restrict reads to staff, parents (own children link N/A), students (self)
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

-- 5. rfid_cards: staff + gate monitor + self
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

-- 6. card_scans: staff + gate monitor + self
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

-- 7. behavior_records: staff only + self
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

-- 8. attendance_records: staff + self
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

-- 9. library_loans: staff + self
DROP POLICY IF EXISTS "Authenticated can view school admin data" ON public.library_loans;
CREATE POLICY "Staff or self can view loans" ON public.library_loans
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'director')
    OR public.has_role(auth.uid(), 'supervisor')
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = library_loans.student_id AND s.user_id = auth.uid())
  );

-- 10. trip_participants: staff + self
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

-- 11. Revoke get_overview_stats from anon
REVOKE EXECUTE ON FUNCTION public.get_overview_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_overview_stats() TO authenticated;

-- 12. Realtime: restrict subscriptions to authenticated staff
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can subscribe to realtime" ON realtime.messages;
CREATE POLICY "Staff can subscribe to realtime" ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'director')
    OR public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'teacher')
    OR public.has_role(auth.uid(), 'gate_monitor')
  );
