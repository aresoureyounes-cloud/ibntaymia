<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Enforce attendance session identity in the database by class, date and normalized period, and recover uniqueness conflicts by offering the existing session; this prevents concurrent duplicate records.
- Treat external notification simulation as recording only, never successful delivery; this prevents staff relying on unsent parent alerts.
- Account imports must use cryptographic temporary credentials, enumerate existing auth users across all pages, check every dependent write, and attempt cleanup of newly created incomplete accounts; this prevents false success and duplicate or orphaned accounts.
- Parent homework queries must use the selected child's class ID in both the filter and query key; class labels are not unique identifiers.
- Browser clients may only read user roles; role mutations go through authorized server handlers that check caller privileges with the caller-scoped client before loading privileged access, preventing direct privilege escalation.
- Official student rosters use a unique textual national_student_id for repeatable imports and preserve original enrollment fields in enrollment_data; this avoids duplicate students and loss of registry identifiers.
- Telegram event alerts use a durable database queue and staff-authorized SMS preparation page; gateway acceptance and composer opening never mean SMS delivery, and corrected attendance cancels pending preparation.
- Launch the SMS composer through a direct user-clicked sms: anchor after authorized preparation, not asynchronous window navigation; mobile browsers can block external app launches after an awaited request, and Telegram inline URL buttons support HTTP/tg links rather than sms links.
- Absence-report SMS trials reuse staff-readable is_test alert rows in a separate section, never attendance records or report totals; this keeps experiments out of official student history.
