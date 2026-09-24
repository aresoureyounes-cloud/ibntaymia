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
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.get_user_roles(_user_id UUID)
RETURNS SETOF app_role LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id
$$;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'director'));
CREATE POLICY "Users can create own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage all roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_roles(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_roles(UUID) TO authenticated;

-- Classes
CREATE TABLE public.classes (
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
CREATE TABLE public.students (
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
CREATE INDEX idx_students_class ON public.students(class_id);
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view students" ON public.students FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff manage students" ON public.students FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'supervisor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'supervisor'));
CREATE TRIGGER trg_students_updated_at BEFORE UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Staff whitelist
CREATE TABLE public.staff_whitelist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL UNIQUE,
  role app_role NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.staff_whitelist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage staff whitelist" ON public.staff_whitelist FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

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
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'supervisor'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'supervisor'));
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
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'gate_monitor'));
CREATE POLICY "Staff manage scans" ON public.card_scans FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'supervisor'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'supervisor'));

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
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'teacher'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'teacher'));

CREATE TABLE public.attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.attendance_sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'present',
  note TEXT,
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
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'teacher'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'teacher'));

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
CREATE POLICY "Recipient can mark read" ON public.notifications FOR UPDATE TO authenticated USING (recipient_id = auth.uid());

-- Admin/behavior/library/trips/exams
CREATE TABLE public.school_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  decision_type text NOT NULL DEFAULT 'announcement',
  body text,
  status text NOT NULL DEFAULT 'active',
  starts_at timestamptz DEFAULT now(),
  ends_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.behavior_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE,
  record_type text NOT NULL DEFAULT 'positive',
  points integer NOT NULL DEFAULT 0,
  title text NOT NULL,
  note text,
  recorded_by uuid,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.library_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  author text,
  item_type text NOT NULL DEFAULT 'book',
  total_copies integer NOT NULL DEFAULT 1,
  available_copies integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.library_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid REFERENCES public.library_items(id) ON DELETE CASCADE NOT NULL,
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
  loaned_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz,
  returned_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.school_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  destination text,
  trip_date date,
  status text NOT NULL DEFAULT 'planned',
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.trip_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid REFERENCES public.school_trips(id) ON DELETE CASCADE NOT NULL,
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
  consent_status text NOT NULL DEFAULT 'pending',
  attended boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id, student_id)
);
CREATE TABLE public.exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  subject text NOT NULL,
  exam_date date,
  room text,
  status text NOT NULL DEFAULT 'scheduled',
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['school_decisions','behavior_records','library_items','library_loans','school_trips','trip_participants','exams']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('CREATE POLICY "Authenticated can view school admin data" ON public.%I FOR SELECT TO authenticated USING (true)', tbl);
    EXECUTE format('CREATE POLICY "Management can change school admin data" ON public.%I FOR ALL TO authenticated USING (public.has_role(auth.uid(), ''admin'') OR public.has_role(auth.uid(), ''director'') OR public.has_role(auth.uid(), ''supervisor'')) WITH CHECK (public.has_role(auth.uid(), ''admin'') OR public.has_role(auth.uid(), ''director'') OR public.has_role(auth.uid(), ''supervisor''))', tbl);
    IF tbl <> 'trip_participants' THEN
      EXECUTE format('CREATE TRIGGER set_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', tbl, tbl);
    END IF;
  END LOOP;
END $$;

-- Data API grants for every table created above
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['profiles','user_roles','classes','students','staff_whitelist','rfid_cards','card_scans','attendance_sessions','attendance_records','notifications','school_decisions','behavior_records','library_items','library_loans','school_trips','trip_participants','exams']
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', tbl);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', tbl);
  END LOOP;
END $$;

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
ALTER PUBLICATION supabase_realtime ADD TABLE public.school_decisions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.behavior_records;
ALTER PUBLICATION supabase_realtime ADD TABLE public.library_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.library_loans;
ALTER PUBLICATION supabase_realtime ADD TABLE public.school_trips;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.exams;

-- Whitelist
INSERT INTO public.staff_whitelist (full_name, role, note)
VALUES ('بوكعاش يونس إدريس', 'admin', 'مسؤول رئيسي')
ON CONFLICT (full_name) DO UPDATE SET role = EXCLUDED.role;

-- Seed classes
INSERT INTO public.classes (name, level, branch) VALUES
  ('ج م ع ت 4', '1AS', 'جذع مشترك علوم وتكنولوجيا'),
  ('ج م أ 1', '1AS', 'جذع مشترك آداب');

-- Seed students
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone)
SELECT s.full_name, s.gender, s.dob::date, c.id, s.email, s.phone
FROM (VALUES
  ('ابن خرورو عبد الرحمان','M','2009-11-05','student93810@idaroom.test','+213524942603'),
  ('ابن مناح أروى','F','2010-11-03','student13278@idaroom.test','+213546913810'),
  ('بن جامع أريج نور الهدى','F','2010-12-01','student42098@idaroom.test','+213539958838'),
  ('بن سماعين بلال','M','2010-08-13','student28289@idaroom.test','+213523756669'),
  ('بن عامر رنيم','F','2010-06-21','student98696@idaroom.test','+213583197857'),
  ('بن قدواد ندى حبيبة','F','2010-09-14','student21395@idaroom.test','+213589254563'),
  ('بوزيتونة ليله','F','2011-03-23','student65302@idaroom.test','+213514265799'),
  ('بوعبيد ملاك','F','2010-01-05','student13905@idaroom.test','+213522575562'),
  ('بوعصيدة أمينة','F','2010-04-10','student38657@idaroom.test','+213541227216'),
  ('بوكعاش يونس إدريس','M','2011-03-07','student76237@idaroom.test','+213590801586'),
  ('حركاتي محمد الصالح','M','2009-05-06','student13478@idaroom.test','+213585329037'),
  ('حيرش محمد تميم','M','2010-11-04','student36062@idaroom.test','+213597226012'),
  ('خناوي ألاء الرحمان','F','2010-06-07','student81426@idaroom.test','+213566306997'),
  ('خيري نسرين','F','2011-01-19','student38893@idaroom.test','+213570291817'),
  ('سوالمية محمد الصالح','M','2009-04-06','student87236@idaroom.test','+213547338124'),
  ('شكارلي محمد بهاء الدين','M','2010-09-11','student10851@idaroom.test','+213531429110'),
  ('شوابية قصي','M','2010-10-21','student65392@idaroom.test','+213555667651'),
  ('عباس حداد فزيل مولود','M','2010-06-15','student46421@idaroom.test','+213530868105'),
  ('عبد الرزاق يوسف','M','2010-07-06','student38221@idaroom.test','+213555176955'),
  ('عمرو عياش أنفال','F','2011-01-24','student23396@idaroom.test','+213522448136'),
  ('فاضل اياد شمس الدين','M','2010-07-30','student59797@idaroom.test','+213522981052'),
  ('قادة أمنية','F','2010-07-05','student57052@idaroom.test','+213556164955'),
  ('قجال رائد نزار','M','2010-01-10','student89131@idaroom.test','+213545503389'),
  ('قروي جهينة أناييس','F','2010-06-09','student15695@idaroom.test','+213571662963'),
  ('قليل نور مايا','F','2010-10-09','student80284@idaroom.test','+213526753883'),
  ('كحول زكريا','M','2010-05-27','student59615@idaroom.test','+213520576383'),
  ('كحول يحي','M','2010-05-27','student82357@idaroom.test','+213549349722'),
  ('لعور نريمان','F','2010-03-18','student92397@idaroom.test','+213593016315'),
  ('منتوري نادر','M','2010-01-18','student57400@idaroom.test','+213587490893'),
  ('ميمون عبد الله','M','2010-09-19','student35203@idaroom.test','+213519335534'),
  ('ميمون نجيب','M','2009-06-07','student16006@idaroom.test','+213598753260'),
  ('يخلف إياد عبد الرحيم','M','2010-08-12','student39871@idaroom.test','+213548840994'),
  ('تواتي إيناس','F','2010-01-01','student20458@idaroom.test','+213541244663'),
  ('قدوري إيناس','F','2010-01-01','student23238@idaroom.test','+213561019678')
) AS s(full_name, gender, dob, email, phone)
CROSS JOIN public.classes c WHERE c.name = 'ج م ع ت 4';

INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone)
SELECT s.full_name, s.gender, s.dob::date, c.id, s.email, s.phone
FROM (VALUES
  ('الخزعلي علي','M','2010-11-16','student56566@idaroom.test','+213538119557'),
  ('بن جامع عبدالرحمان','M','2009-03-19','student97841@idaroom.test','+213545833156'),
  ('بن فضة اسيل ندي الريحان','F','2011-01-30','student99593@idaroom.test','+213596977837'),
  ('بن فيسح عائشة','F','2011-03-05','student19358@idaroom.test','+213591756179'),
  ('بوخالفة رامي','M','2010-11-10','student93227@idaroom.test','+213532969840'),
  ('بوخالفة هارون الرشيد','M','2009-10-17','student80010@idaroom.test','+213542857966'),
  ('بودرياسي إبراهيم خليل','M','2009-09-29','student31417@idaroom.test','+213572043515'),
  ('بودفة زينب','F','2007-05-17','student59735@idaroom.test','+213546231783'),
  ('بوسالم رنا مرام','F','2010-09-03','student93886@idaroom.test','+213584752529'),
  ('بوشيلاون محمد وليد','M','2010-11-27','student38785@idaroom.test','+213553524491'),
  ('بوكرو حمزة','M','2010-03-19','student17331@idaroom.test','+213540742311'),
  ('بوهيدل سراج الدين','M','2010-04-08','student14207@idaroom.test','+213552339391'),
  ('جبلية رقية لجين','F','2010-01-03','student62581@idaroom.test','+213545935572'),
  ('جلواط سامي شعيب','M','2009-06-24','student18675@idaroom.test','+213538317637'),
  ('خنفوسي محمد فراس','M','2010-04-25','student84341@idaroom.test','+213552235350'),
  ('دالي ريم','F','2011-02-03','student37869@idaroom.test','+213597971488'),
  ('دحدوح شعيب','M','2008-09-15','student75435@idaroom.test','+213563100814'),
  ('رزاق اية','F','2010-07-22','student94259@idaroom.test','+213571586053'),
  ('سبيح دينا نورهان','F','2008-08-03','student28726@idaroom.test','+213545551614'),
  ('سوفي عبد المعز','M','2009-06-02','student28301@idaroom.test','+213543101783'),
  ('سيابة شيماء شروق','F','2010-07-05','student83579@idaroom.test','+213582340307'),
  ('شريبط عبد المعم','M','2010-03-21','student44438@idaroom.test','+213588461803'),
  ('شريط أشواق','F','2008-08-05','student66155@idaroom.test','+213588320463'),
  ('علالوش أمير خليل','M','2010-03-02','student62350@idaroom.test','+213558586340'),
  ('عوار محمد تقي الدين','M','2009-03-17','student38746@idaroom.test','+213528566572'),
  ('لكحل نزيم إسلام','M','2011-01-04','student76784@idaroom.test','+213576238574'),
  ('مهني لميس رتاج','F','2008-08-21','student21915@idaroom.test','+213516323852'),
  ('عميور اسيل','F','2010-01-07','student24371@idaroom.test','+213530514014'),
  ('عابر محمد وسيم','M','2009-10-06','student92240@idaroom.test','+213531472420'),
  ('نسمي باي ضياء عبد العزيز','F','2009-05-22','student99192@idaroom.test','+213566661351'),
  ('وغليسي دعاء','F','2010-07-27','student88172@idaroom.test','+213518526544'),
  ('لمداوي جاسمين أريج','F','2010-03-26','student60432@idaroom.test','+213561220073'),
  ('إينوش نهال رقية','F','2009-02-06','student88104@idaroom.test','+213572820592'),
  ('أحميدة محمد جابر','M','2010-02-20','student79352@idaroom.test','+213543744231'),
  ('غريب سامي اياد','M','2009-04-03','student82512@idaroom.test','+213511540956'),
  ('وادي محمد نضال','M','2010-11-22','student99166@idaroom.test','+213525374874')
) AS s(full_name, gender, dob, email, phone)
CROSS JOIN public.classes c WHERE c.name = 'ج م أ 1';

-- Profile + role provisioning on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _name text;
  _email text;
  _whitelisted_role app_role;
  _requested_role app_role;
  _requested_text text;
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
    SELECT role INTO _whitelisted_role FROM public.staff_whitelist WHERE full_name = _name LIMIT 1;
    _requested_text := NEW.raw_user_meta_data->>'requested_role';
    IF _requested_text IS NOT NULL AND _requested_text <> '' THEN
      BEGIN _requested_role := _requested_text::app_role;
      EXCEPTION WHEN others THEN _requested_role := NULL; END;
    END IF;
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, COALESCE(_whitelisted_role, _requested_role, 'student'::app_role))
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  UPDATE public.students SET user_id = NEW.id WHERE full_name = _name AND user_id IS NULL;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Seed demo content
INSERT INTO public.library_items (title, author, item_type, total_copies, available_copies) VALUES
  ('كتاب الرياضيات — سنة رابعة متوسط','وزارة التربية','book',20,20),
  ('كتاب اللغة العربية — سنة أولى ثانوي','وزارة التربية','book',18,18);

INSERT INTO public.school_decisions (title, decision_type, body, status)
VALUES ('اجتماع إداري تجريبي','announcement','قرار تجريبي للتأكد من عمل صفحة الإدارة والتحديث الفوري.','active');