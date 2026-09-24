# bash completion for the IDAROOM CLI — installed to
# /usr/share/bash-completion/completions/idaroom by the .deb package.
_idaroom() {
  local cur prev commands options pages levels
  cur="${COMP_WORDS[COMP_CWORD]}"
  prev="${COMP_WORDS[COMP_CWORD-1]}"
  commands="open dashboard console settings browser status health info routes config ping doctor version help"
  options="--page --url --fullscreen --kiosk --minimized --devtools --fix --dry-run --json --quiet --verbose --log-level --timeout --no-color --help --version"
  levels="silent error warn info debug trace"
  pages="/ /about /login /dashboard /dashboard/students /dashboard/attendance /dashboard/exams /dashboard/behavior /dashboard/cards /dashboard/gate /dashboard/gate-log /dashboard/notifications /dashboard/library /dashboard/trips /dashboard/decisions /dashboard/guidance /dashboard/import /dashboard/console /dashboard/diagnostics /dashboard/settings /dashboard/profile"

  case "$prev" in
    -p|--page|open|browser) COMPREPLY=( $(compgen -W "$pages" -- "$cur") ); return 0 ;;
    --log-level) COMPREPLY=( $(compgen -W "$levels" -- "$cur") ); return 0 ;;
    --timeout) COMPREPLY=( $(compgen -W "3000 5000 10000 30000" -- "$cur") ); return 0 ;;
    --url) COMPREPLY=(); return 0 ;;
  esac


  if [[ "$cur" == -* ]]; then
    COMPREPLY=( $(compgen -W "$options" -- "$cur") )
  else
    COMPREPLY=( $(compgen -W "$commands" -- "$cur") )
  fi
}
complete -F _idaroom idaroom
