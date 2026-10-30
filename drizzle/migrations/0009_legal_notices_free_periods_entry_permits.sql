-- Phase 1: legal absence path
CREATE TABLE public.legal_notice_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  notice1_days integer NOT NULL DEFAULT 3,
  notice2_days integer NOT NULL DEFAULT 6,
  notice3_days integer NOT NULL DEFAULT 10,
  strike_off_days integer NOT NULL DEFAULT 15,
  confirmed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CHECK (notice1_days > 0 AND notice1_days < notice2_days AND notice2_days < notice3_days AND notice3_days <= strike_off_days)
);
INSERT INTO public.legal_notice_settings (id) VALUES (true);
GRANT SELECT, UPDATE ON public.legal_notice_settings TO authenticated;
GRANT ALL ON public.legal_notice_settings TO service_role;
ALTER TABLE public.legal_notice_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lns read" ON public.legal_notice_settings FOR SELECT TO authenticated USING (public.is_management(auth.uid()));
CREATE POLICY "lns update" ON public.legal_notice_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'developer'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'developer'));

ALTER TABLE public.students
  ADD COLUMN enrollment_status text NOT NULL DEFAULT 'active' CHECK (enrollment_status IN ('active','struck_off')),
  ADD COLUMN struck_off_at timestamptz,
  ADD COLUMN struck_off_by uuid,
  ADD COLUMN struck_off_reason text;

CREATE TABLE public.legal_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  serial bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  level smallint NOT NULL CHECK (level BETWEEN 1 AND 3),
  unjustified_days integer NOT NULL,
  absence_dates date[] NOT NULL DEFAULT '{}',
  delivery_method text NOT NULL DEFAULT 'hand' CHECK (delivery_method IN ('hand','mail','sms')),
  guardian_response_on date,
  note text,
  issued_by uuid DEFAULT auth.uid(),
  issued_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, level)
);
GRANT SELECT, INSERT, UPDATE ON public.legal_notices TO authenticated;
GRANT ALL ON public.legal_notices TO service_role;
ALTER TABLE public.legal_notices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ln mgmt read" ON public.legal_notices FOR SELECT TO authenticated USING (
  public.is_management(auth.uid())
  OR EXISTS (SELECT 1 FROM public.parent_student ps WHERE ps.student_id = legal_notices.student_id AND ps.parent_user_id = auth.uid()));
CREATE POLICY "ln mgmt insert" ON public.legal_notices FOR INSERT TO authenticated WITH CHECK (public.is_management(auth.uid()));
CREATE POLICY "ln mgmt update" ON public.legal_notices FOR UPDATE TO authenticated USING (public.is_management(auth.uid())) WITH CHECK (public.is_management(auth.uid()));

CREATE OR REPLACE FUNCTION public.student_absence_standing()
RETURNS TABLE(student_id uuid, full_name text, class_name text, guardian_name text, guardian_phone text,
  enrollment_status text, unjustified_days integer, absence_dates date[], last_notice_level smallint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH d AS (
    SELECT r.student_id, s.session_date
    FROM attendance_records r JOIN attendance_sessions s ON s.id = r.session_id
    WHERE r.status = 'absent' AND r.justified_at IS NULL
    GROUP BY r.student_id, s.session_date
  )
  SELECT st.id, st.full_name, c.name, st.guardian_name, st.guardian_phone, st.enrollment_status,
    count(d.session_date)::int, array_agg(d.session_date ORDER BY d.session_date),
    (SELECT max(level) FROM legal_notices n WHERE n.student_id = st.id)
  FROM d JOIN students st ON st.id = d.student_id LEFT JOIN classes c ON c.id = st.class_id
  WHERE public.is_management(auth.uid())
  GROUP BY st.id, c.name
$$;
REVOKE EXECUTE ON FUNCTION public.student_absence_standing() FROM anon;

CREATE OR REPLACE FUNCTION public.set_student_enrollment(_student uuid, _status text, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (has_role(auth.uid(),'director') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'developer')) THEN
    RAISE EXCEPTION 'PERM_DENIED: قرار الشطب أو الإرجاع من صلاحية المدير فقط' USING ERRCODE='42501';
  END IF;
  IF _status = 'struck_off' THEN
    IF coalesce(trim(_reason),'') = '' THEN RAISE EXCEPTION 'REASON_REQUIRED: يجب كتابة سبب القرار'; END IF;
    IF NOT EXISTS (SELECT 1 FROM legal_notices WHERE student_id = _student AND level = 3) THEN
      RAISE EXCEPTION 'NOTICE_REQUIRED: لا يمكن الشطب قبل تحرير الإعذار (الإشعار الثالث)';
    END IF;
    UPDATE students SET enrollment_status='struck_off', struck_off_at=now(), struck_off_by=auth.uid(), struck_off_reason=_reason WHERE id=_student;
  ELSIF _status = 'active' THEN
    UPDATE students SET enrollment_status='active', struck_off_at=NULL, struck_off_by=NULL,
      struck_off_reason = coalesce(nullif(trim(_reason),''), struck_off_reason) WHERE id=_student;
  ELSE RAISE EXCEPTION 'BAD_STATUS'; END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_student_enrollment(uuid,text,text) FROM anon;

-- Phase 2: teacher absences and free periods
CREATE TABLE public.teacher_absences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL,
  absence_date date NOT NULL,
  slot_ids uuid[],
  reason text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, absence_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_absences TO authenticated;
GRANT ALL ON public.teacher_absences TO service_role;
ALTER TABLE public.teacher_absences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ta read" ON public.teacher_absences FOR SELECT TO authenticated USING (teacher_id = auth.uid() OR public.is_management(auth.uid()));
CREATE POLICY "ta insert" ON public.teacher_absences FOR INSERT TO authenticated WITH CHECK (teacher_id = auth.uid() OR public.is_management(auth.uid()));
CREATE POLICY "ta update" ON public.teacher_absences FOR UPDATE TO authenticated USING (public.is_management(auth.uid())) WITH CHECK (public.is_management(auth.uid()));
CREATE POLICY "ta delete" ON public.teacher_absences FOR DELETE TO authenticated USING (public.is_management(auth.uid()));

CREATE TABLE public.free_period_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id uuid NOT NULL REFERENCES public.schedule_slots(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  decision_date date NOT NULL,
  decision text NOT NULL CHECK (decision IN ('substitute','study_room','dismissed')),
  substitute_teacher_id uuid,
  note text,
  decided_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slot_id, decision_date),
  CHECK (decision <> 'substitute' OR substitute_teacher_id IS NOT NULL)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.free_period_decisions TO authenticated;
GRANT ALL ON public.free_period_decisions TO service_role;
ALTER TABLE public.free_period_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fpd read" ON public.free_period_decisions FOR SELECT TO authenticated USING (substitute_teacher_id = auth.uid() OR public.is_management(auth.uid()));
CREATE POLICY "fpd manage" ON public.free_period_decisions FOR ALL TO authenticated USING (public.is_management(auth.uid())) WITH CHECK (public.is_management(auth.uid()));
CREATE TRIGGER trg_fpd_updated BEFORE UPDATE ON public.free_period_decisions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.notify_substitute_teacher() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sl record;
BEGIN
  IF NEW.decision = 'substitute' AND NEW.substitute_teacher_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.substitute_teacher_id IS DISTINCT FROM NEW.substitute_teacher_id OR OLD.decision <> NEW.decision) THEN
    SELECT s.subject, s.start_time, c.name AS cname INTO sl FROM schedule_slots s JOIN classes c ON c.id = s.class_id WHERE s.id = NEW.slot_id;
    INSERT INTO notifications (recipient_id, title, body, channel, status)
    VALUES (NEW.substitute_teacher_id, 'حصة استخلاف',
      format('كُلّفت بحصة استخلاف للقسم %s يوم %s على الساعة %s (%s).', sl.cname, NEW.decision_date, to_char(sl.start_time,'HH24:MI'), sl.subject),
      'in_app', 'sent');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_fpd_notify AFTER INSERT OR UPDATE ON public.free_period_decisions FOR EACH ROW EXECUTE FUNCTION public.notify_substitute_teacher();

-- Phase 3: entry permits
CREATE TABLE public.entry_permits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permit_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Africa/Algiers')::date,
  daily_no integer NOT NULL DEFAULT 0,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('absence','late')),
  justified boolean NOT NULL,
  reason text,
  period text,
  record_ids uuid[] NOT NULL DEFAULT '{}',
  entry_time timestamptz NOT NULL DEFAULT now(),
  issued_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (permit_date, daily_no),
  CHECK (NOT justified OR coalesce(trim(reason),'') <> '')
);
GRANT SELECT, INSERT ON public.entry_permits TO authenticated;
GRANT ALL ON public.entry_permits TO service_role;
ALTER TABLE public.entry_permits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ep read" ON public.entry_permits FOR SELECT TO authenticated USING (
  public.is_management(auth.uid()) OR public.has_role(auth.uid(),'teacher')
  OR EXISTS (SELECT 1 FROM public.parent_student ps WHERE ps.student_id = entry_permits.student_id AND ps.parent_user_id = auth.uid()));
CREATE POLICY "ep insert" ON public.entry_permits FOR INSERT TO authenticated WITH CHECK (public.is_management(auth.uid()));

CREATE OR REPLACE FUNCTION public.entry_permit_before() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('entry_permit:' || NEW.permit_date::text));
  SELECT coalesce(max(daily_no),0) + 1 INTO NEW.daily_no FROM entry_permits WHERE permit_date = NEW.permit_date;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_ep_before BEFORE INSERT ON public.entry_permits FOR EACH ROW EXECUTE FUNCTION public.entry_permit_before();

CREATE OR REPLACE FUNCTION public.entry_permit_after() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.justified AND array_length(NEW.record_ids,1) > 0 THEN
    UPDATE attendance_records SET justified_at = now(), justified_by = NEW.issued_by,
      justification_note = 'تصريح دخول رقم ' || NEW.daily_no || ': ' || NEW.reason
    WHERE id = ANY(NEW.record_ids) AND student_id = NEW.student_id AND justified_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_ep_after AFTER INSERT ON public.entry_permits FOR EACH ROW EXECUTE FUNCTION public.entry_permit_after();