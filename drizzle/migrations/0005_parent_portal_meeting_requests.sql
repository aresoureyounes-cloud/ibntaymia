-- بوابة الولي: طلبات المقابلات
create table if not exists public.meeting_requests (
  id uuid primary key default gen_random_uuid(),
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  preferred_date date not null,
  preferred_slot text,
  message text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','done')),
  review_note text,
  reviewed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update on public.meeting_requests to authenticated;
grant all on public.meeting_requests to service_role;

alter table public.meeting_requests enable row level security;

create policy "meeting parent read own"
  on public.meeting_requests for select to authenticated
  using (
    parent_user_id = auth.uid()
    or has_role(auth.uid(), 'admin')
    or has_role(auth.uid(), 'director')
    or has_role(auth.uid(), 'supervisor')
  );

create policy "meeting parent insert own"
  on public.meeting_requests for insert to authenticated
  with check (
    parent_user_id = auth.uid()
    and exists (
      select 1 from public.parent_student ps
      where ps.parent_user_id = auth.uid() and ps.student_id = meeting_requests.student_id
    )
  );

create policy "meeting staff manage"
  on public.meeting_requests for all to authenticated
  using (
    has_role(auth.uid(), 'admin')
    or has_role(auth.uid(), 'director')
    or has_role(auth.uid(), 'supervisor')
  )
  with check (
    has_role(auth.uid(), 'admin')
    or has_role(auth.uid(), 'director')
    or has_role(auth.uid(), 'supervisor')
  );

create trigger trg_meeting_requests_updated_at
  before update on public.meeting_requests
  for each row execute function public.set_updated_at();

-- بوابة الولي: قراءة وتبرير غيابات الأبناء
create policy "justif parent read"
  on public.absence_justifications for select to authenticated
  using (
    exists (
      select 1
      from public.parent_student ps
      join public.students s on s.id = ps.student_id
      where ps.parent_user_id = auth.uid()
        and s.id = absence_justifications.student_id
    )
  );

create policy "justif parent insert"
  on public.absence_justifications for insert to authenticated
  with check (
    status = 'pending'
    and exists (
      select 1 from public.parent_student ps
      where ps.parent_user_id = auth.uid()
        and ps.student_id = absence_justifications.student_id
    )
  );
