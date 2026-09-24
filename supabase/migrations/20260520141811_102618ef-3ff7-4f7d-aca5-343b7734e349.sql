CREATE TABLE IF NOT EXISTS public.school_decisions (
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

CREATE TABLE IF NOT EXISTS public.behavior_records (
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

CREATE TABLE IF NOT EXISTS public.library_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  author text,
  item_type text NOT NULL DEFAULT 'book',
  total_copies integer NOT NULL DEFAULT 1,
  available_copies integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.library_loans (
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

CREATE TABLE IF NOT EXISTS public.school_trips (
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

CREATE TABLE IF NOT EXISTS public.trip_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid REFERENCES public.school_trips(id) ON DELETE CASCADE NOT NULL,
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
  consent_status text NOT NULL DEFAULT 'pending',
  attended boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id, student_id)
);

CREATE TABLE IF NOT EXISTS public.exams (
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
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['school_decisions','behavior_records','library_items','library_loans','school_trips','trip_participants','exams']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
  END LOOP;
END $$;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['school_decisions','behavior_records','library_items','library_loans','school_trips','trip_participants','exams']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=tbl AND policyname='Authenticated can view school admin data') THEN
      EXECUTE format('CREATE POLICY "Authenticated can view school admin data" ON public.%I FOR SELECT TO authenticated USING (true)', tbl);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=tbl AND policyname='Management can change school admin data') THEN
      EXECUTE format('CREATE POLICY "Management can change school admin data" ON public.%I FOR ALL TO authenticated USING (public.has_role(auth.uid(), ''admin'') OR public.has_role(auth.uid(), ''director'') OR public.has_role(auth.uid(), ''supervisor'')) WITH CHECK (public.has_role(auth.uid(), ''admin'') OR public.has_role(auth.uid(), ''director'') OR public.has_role(auth.uid(), ''supervisor''))', tbl);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['school_decisions','behavior_records','library_items','library_loans','school_trips','trip_participants','exams']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_' || tbl || '_updated_at') THEN
      CONTINUE;
    END IF;
    IF tbl <> 'trip_participants' THEN
      EXECUTE format('CREATE TRIGGER set_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', tbl, tbl);
    END IF;
  END LOOP;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.school_decisions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.behavior_records;
ALTER PUBLICATION supabase_realtime ADD TABLE public.library_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.library_loans;
ALTER PUBLICATION supabase_realtime ADD TABLE public.school_trips;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.exams;

INSERT INTO public.library_items (title, author, item_type, total_copies, available_copies)
VALUES
  ('كتاب الرياضيات — سنة رابعة متوسط', 'وزارة التربية', 'book', 20, 20),
  ('كتاب اللغة العربية — سنة أولى ثانوي', 'وزارة التربية', 'book', 18, 18)
ON CONFLICT DO NOTHING;

INSERT INTO public.school_decisions (title, decision_type, body, status)
VALUES ('اجتماع إداري تجريبي', 'announcement', 'قرار تجريبي للتأكد من عمل صفحة الإدارة والتحديث الفوري.', 'active')
ON CONFLICT DO NOTHING;