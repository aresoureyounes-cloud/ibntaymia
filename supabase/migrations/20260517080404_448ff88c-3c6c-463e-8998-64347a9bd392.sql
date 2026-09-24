-- Classes table
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

-- Students table
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

-- Updated signup trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _name text;
  _whitelisted_role app_role;
BEGIN
  _name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email);
  INSERT INTO public.profiles (id, full_name, preferred_language)
  VALUES (NEW.id, _name, COALESCE(NEW.raw_user_meta_data->>'preferred_language','ar'));

  SELECT role INTO _whitelisted_role FROM public.staff_whitelist
  WHERE full_name = _name LIMIT 1;

  IF _whitelisted_role IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _whitelisted_role);
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'student');
  END IF;

  UPDATE public.students SET user_id = NEW.id WHERE full_name = _name AND user_id IS NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Enable realtime
ALTER TABLE public.classes REPLICA IDENTITY FULL;
ALTER TABLE public.students REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.classes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.students;

-- Whitelist Bouqaach
INSERT INTO public.staff_whitelist (full_name, role, note)
VALUES ('بوكعاش يونس إدريس', 'admin', 'مسؤول رئيسي')
ON CONFLICT (full_name) DO UPDATE SET role = EXCLUDED.role;

-- Seed classes
INSERT INTO public.classes (name, level, branch) VALUES ('ج م ع ت 4', '1AS', 'جذع مشترك علوم وتكنولوجيا') ON CONFLICT (name) DO NOTHING;
INSERT INTO public.classes (name, level, branch) VALUES ('ج م أ 1', '1AS', 'جذع مشترك آداب') ON CONFLICT (name) DO NOTHING;

-- Seed students class 1 (ج م ع ت 4)
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'ابن خرورو عبد الرحمان','M','2009-11-05', id, 'student93810@idaroom.test','+213524942603' FROM public.classes WHERE name='ج م ع ت 4' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'ابن مناح أروى','F','2010-11-03', id, 'student13278@idaroom.test','+213546913810' FROM public.classes WHERE name='ج م ع ت 4' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'بن جامع أريج نور الهدى','F','2010-12-01', id, 'student42098@idaroom.test','+213539958838' FROM public.classes WHERE name='ج م ع ت 4' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'بن سماعين بلال','M','2010-08-13', id, 'student28289@idaroom.test','+213523756669' FROM public.classes WHERE name='ج م ع ت 4' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'بن عامر رنيم','F','2010-06-21', id, 'student98696@idaroom.test','+213583197857' FROM public.classes WHERE name='ج م ع ت 4' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'بن قدواد ندى حبيبة','F','2010-09-14', id, 'student21395@idaroom.test','+213589254563' FROM public.classes WHERE name='ج م ع ت 4' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'بوزيتونة ليله','F','2011-03-23', id, 'student65302@idaroom.test','+213514265799' FROM public.classes WHERE name='ج م ع ت 4' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'بوعبيد ملاك','F','2010-01-05', id, 'student13905@idaroom.test','+213522575562' FROM public.classes WHERE name='ج م ع ت 4' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'بوعصيدة أمينة','F','2010-04-10', id, 'student38657@idaroom.test','+213541227216' FROM public.classes WHERE name='ج م ع ت 4' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'بوكعاش يونس إدريس','M','2011-03-07', id, 'student76237@idaroom.test','+213590801586' FROM public.classes WHERE name='ج م ع ت 4' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'حركاتي محمد الصالح','M','2009-05-06', id, 'student13478@idaroom.test','+213585329037' FROM public.classes WHERE name='ج م ع ت 4' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'حيرش محمد تميم','M','2010-11-04', id, 'student36062@idaroom.test','+213597226012' FROM public.classes WHERE name='ج م ع ت 4' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'خناوي ألاء الرحمان','F','2010-06-07', id, 'student81426@idaroom.test','+213566306997' FROM public.classes WHERE name='ج م ع ت 4' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'خيري نسرين','F','2011-01-19', id, 'student38893@idaroom.test','+213570291817' FROM public.classes WHERE name='ج م ع ت 4' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'سوالمية محمد الصالح','M','2009-04-06', id, 'student87236@idaroom.test','+213547338124' FROM public.classes WHERE name='ج م ع ت 4' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'شكارلي محمد بهاء الدين','M','2010-09-11', id, 'student10851@idaroom.test','+213531429110' FROM public.classes WHERE name='ج م ع ت 4' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'شوابية قصي','M','2010-10-21', id, 'student65392@idaroom.test','+213555667651' FROM public.classes WHERE name='ج م ع ت 4' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'عباس حداد فزيل مولود','M','2010-06-15', id, 'student46421@idaroom.test','+213530868105' FROM public.classes WHERE name='ج م ع ت 4' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'عبد الرزاق يوسف','M','2010-07-06', id, 'student38221@idaroom.test','+213555176955' FROM public.classes WHERE name='ج م ع ت 4' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'عمرو عياش أنفال','F','2011-01-24', id, 'student23396@idaroom.test','+213522448136' FROM public.classes WHERE name='ج م ع ت 4' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'فاضل اياد شمس الدين','M','2010-07-30', id, 'student59797@idaroom.test','+213522981052' FROM public.classes WHERE name='ج م ع ت 4' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'قادة أمنية','F','2010-07-05', id, 'student57052@idaroom.test','+213556164955' FROM public.classes WHERE name='ج م ع ت 4' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'قجال رائد نزار','M','2010-01-10', id, 'student89131@idaroom.test','+213545503389' FROM public.classes WHERE name='ج م ع ت 4' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'قروي جهينة أناييس','F','2010-06-09', id, 'student15695@idaroom.test','+213571662963' FROM public.classes WHERE name='ج م ع ت 4' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'قليل نور مايا','F','2010-10-09', id, 'student80284@idaroom.test','+213526753883' FROM public.classes WHERE name='ج م ع ت 4' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'كحول زكريا','M','2010-05-27', id, 'student59615@idaroom.test','+213520576383' FROM public.classes WHERE name='ج م ع ت 4' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'كحول يحي','M','2010-05-27', id, 'student82357@idaroom.test','+213549349722' FROM public.classes WHERE name='ج م ع ت 4' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'لعور نريمان','F','2010-03-18', id, 'student92397@idaroom.test','+213593016315' FROM public.classes WHERE name='ج م ع ت 4' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'منتوري نادر','M','2010-01-18', id, 'student57400@idaroom.test','+213587490893' FROM public.classes WHERE name='ج م ع ت 4' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'ميمون عبد الله','M','2010-09-19', id, 'student35203@idaroom.test','+213519335534' FROM public.classes WHERE name='ج م ع ت 4' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'ميمون نجيب','M','2009-06-07', id, 'student16006@idaroom.test','+213598753260' FROM public.classes WHERE name='ج م ع ت 4' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'يخلف إياد عبد الرحيم','M','2010-08-12', id, 'student39871@idaroom.test','+213548840994' FROM public.classes WHERE name='ج م ع ت 4' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'تواتي إيناس','F','2010-01-01', id, 'student20458@idaroom.test','+213541244663' FROM public.classes WHERE name='ج م ع ت 4' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'قدوري إيناس','F','2010-01-01', id, 'student23238@idaroom.test','+213561019678' FROM public.classes WHERE name='ج م ع ت 4' LIMIT 1;

-- Seed students class 2 (ج م أ 1)
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'الخزعلي علي','M','2010-11-16', id, 'student56566@idaroom.test','+213538119557' FROM public.classes WHERE name='ج م أ 1' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'بن جامع عبدالرحمان','M','2009-03-19', id, 'student97841@idaroom.test','+213545833156' FROM public.classes WHERE name='ج م أ 1' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'بن فضة اسيل ندي الريحان','F','2011-01-30', id, 'student99593@idaroom.test','+213596977837' FROM public.classes WHERE name='ج م أ 1' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'بن فيسح عائشة','F','2011-03-05', id, 'student19358@idaroom.test','+213591756179' FROM public.classes WHERE name='ج م أ 1' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'بوخالفة رامي','M','2010-11-10', id, 'student93227@idaroom.test','+213532969840' FROM public.classes WHERE name='ج م أ 1' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'بوخالفة هارون الرشيد','M','2009-10-17', id, 'student80010@idaroom.test','+213542857966' FROM public.classes WHERE name='ج م أ 1' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'بودرياسي إبراهيم خليل','M','2009-09-29', id, 'student31417@idaroom.test','+213572043515' FROM public.classes WHERE name='ج م أ 1' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'بودفة زينب','F','2007-05-17', id, 'student59735@idaroom.test','+213546231783' FROM public.classes WHERE name='ج م أ 1' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'بوسالم رنا مرام','F','2010-09-03', id, 'student93886@idaroom.test','+213584752529' FROM public.classes WHERE name='ج م أ 1' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'بوشيلاون محمد وليد','M','2010-11-27', id, 'student38785@idaroom.test','+213553524491' FROM public.classes WHERE name='ج م أ 1' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'بوكرو حمزة','M','2010-03-19', id, 'student17331@idaroom.test','+213540742311' FROM public.classes WHERE name='ج م أ 1' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'بوهيدل سراج الدين','M','2010-04-08', id, 'student14207@idaroom.test','+213552339391' FROM public.classes WHERE name='ج م أ 1' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'جبلية رقية لجين','F','2010-01-03', id, 'student62581@idaroom.test','+213545935572' FROM public.classes WHERE name='ج م أ 1' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'جلواط سامي شعيب','M','2009-06-24', id, 'student18675@idaroom.test','+213538317637' FROM public.classes WHERE name='ج م أ 1' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'خنفوسي محمد فراس','M','2010-04-25', id, 'student84341@idaroom.test','+213552235350' FROM public.classes WHERE name='ج م أ 1' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'دالي ريم','F','2011-02-03', id, 'student37869@idaroom.test','+213597971488' FROM public.classes WHERE name='ج م أ 1' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'دحدوح شعيب','M','2008-09-15', id, 'student75435@idaroom.test','+213563100814' FROM public.classes WHERE name='ج م أ 1' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'رزاق اية','F','2010-07-22', id, 'student94259@idaroom.test','+213571586053' FROM public.classes WHERE name='ج م أ 1' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'سبيح دينا نورهان','F','2008-08-03', id, 'student28726@idaroom.test','+213545551614' FROM public.classes WHERE name='ج م أ 1' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'سوفي عبد المعز','M','2009-06-02', id, 'student28301@idaroom.test','+213543101783' FROM public.classes WHERE name='ج م أ 1' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'سيابة شيماء شروق','F','2010-07-05', id, 'student83579@idaroom.test','+213582340307' FROM public.classes WHERE name='ج م أ 1' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'شريبط عبد المعم','M','2010-03-21', id, 'student44438@idaroom.test','+213588461803' FROM public.classes WHERE name='ج م أ 1' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'شريط أشواق','F','2008-08-05', id, 'student66155@idaroom.test','+213588320463' FROM public.classes WHERE name='ج م أ 1' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'علالوش أمير خليل','M','2010-03-02', id, 'student62350@idaroom.test','+213558586340' FROM public.classes WHERE name='ج م أ 1' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'عوار محمد تقي الدين','M','2009-03-17', id, 'student38746@idaroom.test','+213528566572' FROM public.classes WHERE name='ج م أ 1' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'لكحل نزيم إسلام','M','2011-01-04', id, 'student76784@idaroom.test','+213576238574' FROM public.classes WHERE name='ج م أ 1' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'مهني لميس رتاج','F','2008-08-21', id, 'student21915@idaroom.test','+213516323852' FROM public.classes WHERE name='ج م أ 1' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'عميور اسيل','F','2010-01-07', id, 'student24371@idaroom.test','+213530514014' FROM public.classes WHERE name='ج م أ 1' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'عابر محمد وسيم','M','2009-10-06', id, 'student92240@idaroom.test','+213531472420' FROM public.classes WHERE name='ج م أ 1' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'نسمي باي ضياء عبد العزيز','F','2009-05-22', id, 'student99192@idaroom.test','+213566661351' FROM public.classes WHERE name='ج م أ 1' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'وغليسي دعاء','F','2010-07-27', id, 'student88172@idaroom.test','+213518526544' FROM public.classes WHERE name='ج م أ 1' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'لمداوي جاسمين أريج','F','2010-03-26', id, 'student60432@idaroom.test','+213561220073' FROM public.classes WHERE name='ج م أ 1' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'إينوش نهال رقية','F','2009-02-06', id, 'student88104@idaroom.test','+213572820592' FROM public.classes WHERE name='ج م أ 1' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'أحميدة محمد جابر','M','2010-02-20', id, 'student79352@idaroom.test','+213543744231' FROM public.classes WHERE name='ج م أ 1' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'غريب سامي اياد','M','2009-04-03', id, 'student82512@idaroom.test','+213511540956' FROM public.classes WHERE name='ج م أ 1' LIMIT 1;
INSERT INTO public.students (full_name, gender, date_of_birth, class_id, fake_email, fake_phone) SELECT 'وادي محمد نضال','M','2010-11-22', id, 'student99166@idaroom.test','+213525374874' FROM public.classes WHERE name='ج م أ 1' LIMIT 1;