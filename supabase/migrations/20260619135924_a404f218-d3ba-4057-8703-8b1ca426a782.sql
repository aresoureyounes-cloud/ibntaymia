-- Tighten realtime.messages subscription policy:
-- 1. Require ':' separator in topic regex to prevent broad topics like "students:all"
--    from matching. Topics now must look like "attendance:<scope>".
-- 2. Add coverage for parent and student roles, scoped to per-user topics
--    (e.g. "notifications:user:<uid>", "grades:user:<uid>") so RLS-protected
--    realtime updates actually reach them.
DROP POLICY IF EXISTS "Realtime scoped by role" ON realtime.messages;

CREATE POLICY "Realtime scoped by role"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'director'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
    OR (
      public.has_role(auth.uid(), 'teacher'::app_role)
      AND realtime.topic() ~ '^(attendance|behavior|exams|notifications|classes|students):[A-Za-z0-9_-]+'
    )
    OR (
      public.has_role(auth.uid(), 'gate_monitor'::app_role)
      AND realtime.topic() ~ '^(card_scans|rfid_cards|notifications|gate):[A-Za-z0-9_-]+'
    )
    OR (
      public.has_role(auth.uid(), 'parent'::app_role)
      AND realtime.topic() = ('notifications:user:' || auth.uid()::text)
    )
    OR (
      public.has_role(auth.uid(), 'student'::app_role)
      AND realtime.topic() IN (
        'notifications:user:' || auth.uid()::text,
        'grades:user:' || auth.uid()::text,
        'attendance:user:' || auth.uid()::text
      )
    )
  );