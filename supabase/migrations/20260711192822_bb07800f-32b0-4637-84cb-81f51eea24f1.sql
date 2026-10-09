-- School decisions/announcements
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

-- Enable RLS + policies + triggers for all above
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['school_decisions','behavior_records','library_items','library_loans','school_trips','trip_participants','exams']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=tbl AND policyname='Authenticated can view school admin data') THEN
      EXECUTE format('CREATE POLICY "Authenticated can view school admin data" ON public.%I FOR SELECT TO authenticated USING (true)', tbl);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=tbl AND policyname='Management can change school admin data') THEN
      EXECUTE format('CREATE POLICY "Management can change school admin data" ON public.%I FOR ALL TO authenticated USING (public.has_role(auth.uid(), ''admin'') OR public.has_role(auth.uid(), ''director'') OR public.has_role(auth.uid(), ''supervisor'')) WITH CHECK (public.has_role(auth.uid(), ''admin'') OR public.has_role(auth.uid(), ''director'') OR public.has_role(auth.uid(), ''supervisor''))', tbl);
    END IF;
    IF tbl <> 'trip_participants' AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_' || tbl || '_updated_at') THEN
      EXECUTE format('CREATE TRIGGER set_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', tbl, tbl);
    END IF;
  END LOOP;
END $$;

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_decisions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.behavior_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_loans TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_trips TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_participants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exams TO authenticated;
GRANT ALL ON public.school_decisions, public.behavior_records, public.library_items, public.library_loans, public.school_trips, public.trip_participants, public.exams TO service_role;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.school_decisions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.behavior_records;
ALTER PUBLICATION supabase_realtime ADD TABLE public.library_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.library_loans;
ALTER PUBLICATION supabase_realtime ADD TABLE public.school_trips;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.exams;

-- Extra indexes
CREATE INDEX IF NOT EXISTS idx_attendance_records_created_at ON public.attendance_records (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rfid_cards_card_uid ON public.rfid_cards (card_uid);
CREATE INDEX IF NOT EXISTS idx_rfid_cards_student_id ON public.rfid_cards (student_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_school_decisions_status_starts_at ON public.school_decisions (status, starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_students_user_id ON public.students (user_id);

-- Overview stats RPC
CREATE OR REPLACE FUNCTION public.get_overview_stats()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
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
GRANT EXECUTE ON FUNCTION public.get_overview_stats() TO authenticated;