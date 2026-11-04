-- Roles enum
CREATE TYPE public.app_role AS ENUM ('admin', 'director', 'supervisor', 'teacher', 'parent', 'student', 'gate_monitor');

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  preferred_language TEXT DEFAULT 'ar',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.get_user_roles(_user_id UUID)
RETURNS SETOF app_role LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT role FROM public.user_roles WHERE user_id = _user_id $$;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'director'));
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage all roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Classes
CREATE TABLE IF NOT EXISTS public.classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  level text,
  branch text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authenticated can view classes" ON public.classes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage classes" ON public.classes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director'));

-- Students
CREATE TABLE IF NOT EXISTS public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  gender text CHECK (gender IN ('M','F')),
  date_of_birth date,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  fake_email text,
  fake_phone text,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_students_class ON public.students(class_id);
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view students" ON public.students FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff manage students" ON public.students FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'supervisor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'supervisor'));
CREATE TRIGGER trg_students_updated_at BEFORE UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Staff whitelist
CREATE TABLE IF NOT EXISTS public.staff_whitelist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL UNIQUE,
  role app_role NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.staff_whitelist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage staff whitelist" ON public.staff_whitelist FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Signup trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  _name text;
  _whitelisted_role app_role;
  _requested_role app_role;
  _requested_text text;
BEGIN
  _name := COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name',''), NULLIF(NEW.raw_user_meta_data->>'name',''), NEW.email);
  INSERT INTO public.profiles (id, full_name, preferred_language, avatar_url)
  VALUES (NEW.id, _name, COALESCE(NEW.raw_user_meta_data->>'preferred_language','ar'), NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
    updated_at = now();

  SELECT role INTO _whitelisted_role FROM public.staff_whitelist WHERE full_name = _name LIMIT 1;

  _requested_text := NEW.raw_user_meta_data->>'requested_role';
  IF _requested_text IS NOT NULL AND _requested_text <> '' THEN
    BEGIN _requested_role := _requested_text::app_role;
    EXCEPTION WHEN others THEN _requested_role := NULL; END;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, COALESCE(_whitelisted_role, _requested_role, 'student'::app_role))
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.students SET user_id = NEW.id WHERE full_name = _name AND user_id IS NULL;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_roles(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_roles(UUID) TO authenticated;

-- RFID Cards
CREATE TABLE public.rfid_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_uid TEXT NOT NULL UNIQUE,
  student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',
  note TEXT,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.rfid_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view cards" ON public.rfid_cards FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff manage cards" ON public.rfid_cards FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'director') OR has_role(auth.uid(),'supervisor'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'director') OR has_role(auth.uid(),'supervisor'));
CREATE TRIGGER trg_rfid_cards_updated BEFORE UPDATE ON public.rfid_cards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Card scans
CREATE TABLE public.card_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_uid TEXT NOT NULL,
  student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  direction TEXT NOT NULL DEFAULT 'in',
  gate_id TEXT,
  scanned_by UUID,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_card_scans_scanned_at ON public.card_scans(scanned_at DESC);
CREATE INDEX idx_card_scans_card_uid ON public.card_scans(card_uid);
ALTER TABLE public.card_scans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view scans" ON public.card_scans FOR SELECT TO authenticated USING (true);
CREATE POLICY "Gate and staff can insert scans" ON public.card_scans FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'director') OR has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'gate_monitor'));
CREATE POLICY "Staff manage scans" ON public.card_scans FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'director') OR has_role(auth.uid(),'supervisor'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'director') OR has_role(auth.uid(),'supervisor'));

-- Attendance
CREATE TABLE public.attendance_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,
  period TEXT,
  subject TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_att_sessions_class_date ON public.attendance_sessions(class_id, session_date DESC);
CREATE TRIGGER trg_att_sessions_updated_at BEFORE UPDATE ON public.attendance_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view sessions" ON public.attendance_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can manage sessions" ON public.attendance_sessions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'director') OR public.has_role(auth.uid(), 'supervisor') OR public.has_role(auth.uid(), 'teacher'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'director') OR public.has_role(auth.uid(), 'supervisor') OR public.has_role(auth.uid(), 'teacher'));

CREATE TABLE public.attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.attendance_sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'present',
  note TEXT,
  justified_at TIMESTAMPTZ,
  justified_by UUID,
  justification_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, student_id),
  CHECK (status IN ('present','absent','late','excused'))
);
CREATE INDEX idx_att_records_student ON public.attendance_records(student_id);
CREATE INDEX idx_att_records_session ON public.attendance_records(session_id);
CREATE TRIGGER trg_att_records_updated_at BEFORE UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view records" ON public.attendance_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can manage records" ON public.attendance_records FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'director') OR public.has_role(auth.uid(), 'supervisor') OR public.has_role(auth.uid(), 'teacher'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'director') OR public.has_role(auth.uid(), 'supervisor') OR public.has_role(auth.uid(), 'teacher'));

-- Notifications
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_label TEXT,
  title TEXT NOT NULL,
  body TEXT,
  channel TEXT NOT NULL DEFAULT 'inapp',
  status TEXT NOT NULL DEFAULT 'sent',
  related_student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  read_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (channel IN ('inapp','email','sms')),
  CHECK (status IN ('sent','simulated','failed','read'))
);
CREATE INDEX idx_notif_recipient ON public.notifications(recipient_id, created_at DESC);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Recipient or staff can view" ON public.notifications FOR SELECT TO authenticated
  USING (recipient_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'supervisor'));
CREATE POLICY "Staff can insert" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'teacher'));
CREATE POLICY "Recipient can mark read" ON public.notifications FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid());

-- Grants (public-schema Data API access)
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE ON public.profiles TO authenticated;
GRANT INSERT ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
GRANT SELECT ON public.classes TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.classes TO authenticated;
GRANT ALL ON public.classes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO authenticated;
GRANT ALL ON public.students TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_whitelist TO authenticated;
GRANT ALL ON public.staff_whitelist TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rfid_cards TO authenticated;
GRANT ALL ON public.rfid_cards TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.card_scans TO authenticated;
GRANT ALL ON public.card_scans TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_sessions TO authenticated;
GRANT ALL ON public.attendance_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_records TO authenticated;
GRANT ALL ON public.attendance_records TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

-- Realtime
ALTER TABLE public.classes REPLICA IDENTITY FULL;
ALTER TABLE public.students REPLICA IDENTITY FULL;
ALTER TABLE public.rfid_cards REPLICA IDENTITY FULL;
ALTER TABLE public.card_scans REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.classes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.students;
ALTER PUBLICATION supabase_realtime ADD TABLE public.rfid_cards;
ALTER PUBLICATION supabase_realtime ADD TABLE public.card_scans;
ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_records;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Seed classes + whitelist
INSERT INTO public.staff_whitelist (full_name, role, note)
VALUES ('بوكعاش يونس إدريس', 'admin', 'مسؤول رئيسي')
ON CONFLICT (full_name) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO public.classes (name, level, branch) VALUES ('ج م ع ت 4', '1AS', 'جذع مشترك علوم وتكنولوجيا') ON CONFLICT (name) DO NOTHING;
INSERT INTO public.classes (name, level, branch) VALUES ('ج م أ 1', '1AS', 'جذع مشترك آداب') ON CONFLICT (name) DO NOTHING;