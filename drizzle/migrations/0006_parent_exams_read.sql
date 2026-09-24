create policy "Parents can view children class exams"
  on public.exams for select to authenticated
  using (
    exists (
      select 1
      from public.parent_student ps
      join public.students s on s.id = ps.student_id
      where ps.parent_user_id = auth.uid()
        and s.class_id = exams.class_id
    )
  );