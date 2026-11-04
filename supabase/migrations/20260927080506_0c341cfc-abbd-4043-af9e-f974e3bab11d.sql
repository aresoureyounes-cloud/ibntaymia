ALTER TABLE public.schedule_slots
  ADD COLUMN IF NOT EXISTS period_no smallint,
  ADD COLUMN IF NOT EXISTS group_label text NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_schedule_teacher_day ON public.schedule_slots(teacher_id, weekday);
CREATE INDEX IF NOT EXISTS idx_schedule_class_day ON public.schedule_slots(class_id, weekday);

CREATE OR REPLACE FUNCTION public.check_schedule_conflict()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c record;
BEGIN
  IF NEW.end_time <= NEW.start_time THEN
    RAISE EXCEPTION 'SCHED_BAD_TIME: وقت النهاية يجب أن يكون بعد البداية' USING ERRCODE='check_violation';
  END IF;
  IF NEW.weekday < 0 OR NEW.weekday > 6 THEN
    RAISE EXCEPTION 'SCHED_BAD_DAY' USING ERRCODE='check_violation';
  END IF;
  IF NOT NEW.is_active THEN RETURN NEW; END IF;

  IF NEW.teacher_id IS NOT NULL THEN
    SELECT s.*, cl.name AS cname INTO c FROM schedule_slots s JOIN classes cl ON cl.id=s.class_id
     WHERE s.id <> NEW.id AND s.is_active AND s.teacher_id = NEW.teacher_id AND s.weekday = NEW.weekday
       AND s.start_time < NEW.end_time AND NEW.start_time < s.end_time LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'SCHED_TEACHER_CONFLICT: الأستاذ مبرمج في نفس الوقت مع قسم % (% - %)', c.cname, c.start_time, c.end_time USING ERRCODE='check_violation';
    END IF;
  END IF;

  SELECT s.* INTO c FROM schedule_slots s
   WHERE s.id <> NEW.id AND s.is_active AND s.class_id = NEW.class_id AND s.weekday = NEW.weekday
     AND s.start_time < NEW.end_time AND NEW.start_time < s.end_time
     AND (s.group_label = 'all' OR NEW.group_label = 'all' OR s.group_label = NEW.group_label) LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'SCHED_CLASS_CONFLICT: القسم لديه حصة % في نفس الوقت (% - %)', c.subject, c.start_time, c.end_time USING ERRCODE='check_violation';
  END IF;

  IF NEW.room IS NOT NULL AND btrim(NEW.room) <> '' THEN
    SELECT s.*, cl.name AS cname INTO c FROM schedule_slots s JOIN classes cl ON cl.id=s.class_id
     WHERE s.id <> NEW.id AND s.is_active AND lower(btrim(s.room)) = lower(btrim(NEW.room)) AND s.weekday = NEW.weekday
       AND s.start_time < NEW.end_time AND NEW.start_time < s.end_time LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'SCHED_ROOM_CONFLICT: القاعة محجوزة لقسم % (% - %)', c.cname, c.start_time, c.end_time USING ERRCODE='check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.check_schedule_conflict() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_schedule_conflict ON public.schedule_slots;
CREATE TRIGGER trg_schedule_conflict BEFORE INSERT OR UPDATE ON public.schedule_slots
FOR EACH ROW EXECUTE FUNCTION public.check_schedule_conflict();

DROP POLICY IF EXISTS "schedule read" ON public.schedule_slots;
DROP POLICY IF EXISTS "schedule write" ON public.schedule_slots;
REVOKE ALL ON public.schedule_slots FROM anon;
CREATE POLICY "schedule read" ON public.schedule_slots FOR SELECT TO authenticated USING (true);
CREATE POLICY "schedule management write" ON public.schedule_slots FOR ALL TO authenticated
USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'director') OR has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'developer'))
WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'director') OR has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'developer'));

ALTER TABLE public.attendance_sessions
  ADD COLUMN IF NOT EXISTS slot_id uuid REFERENCES public.schedule_slots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS session_type text NOT NULL DEFAULT 'regular';
ALTER TABLE public.attendance_sessions DROP CONSTRAINT IF EXISTS attendance_sessions_type_chk;
ALTER TABLE public.attendance_sessions ADD CONSTRAINT attendance_sessions_type_chk CHECK (session_type IN ('regular','replacement','extra'));

CREATE OR REPLACE FUNCTION public.list_teachers()
RETURNS TABLE(id uuid, full_name text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, COALESCE(p.full_name, '—') FROM profiles p
  JOIN user_roles r ON r.user_id = p.id AND r.role = 'teacher'
  WHERE has_role(auth.uid(),'admin') OR has_role(auth.uid(),'director') OR has_role(auth.uid(),'supervisor')
     OR has_role(auth.uid(),'teacher') OR has_role(auth.uid(),'developer')
  ORDER BY 2
$$;
REVOKE EXECUTE ON FUNCTION public.list_teachers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_teachers() TO authenticated;