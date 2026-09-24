# bash completion for the standalone IDAROOM CLI
_idaroom() {
  local cur prev cmds opts
  cur="${COMP_WORDS[COMP_CWORD]}"
  prev="${COMP_WORDS[COMP_CWORD-1]}"
  cmds="help version status health ping changelog routes config doctor open browser dashboard console watch shell repl demo"
  opts="--url --timeout --json --no-pretty --no-color --fix --dry-run --verbose --quiet --log-level --role --name --class --card --password --admin-email --admin-password"

  case "$prev" in
    --log-level) COMPREPLY=( $(compgen -W "silent error warn info debug trace" -- "$cur") ); return ;;
    --url) COMPREPLY=( $(compgen -W "https://idarroom.lovable.app http://localhost:8080" -- "$cur") ); return ;;
    --role) COMPREPLY=( $(compgen -W "admin director supervisor teacher parent student gate_monitor" -- "$cur") ); return ;;
    demo) COMPREPLY=( $(compgen -W "list create disable enable password link help" -- "$cur") ); return ;;
    open|browser) COMPREPLY=( $(compgen -W "/ /login /dashboard /dashboard/students /dashboard/attendance /dashboard/console /dashboard/diagnostics" -- "$cur") ); return ;;
  esac

  if [[ "$cur" == -* ]]; then
    COMPREPLY=( $(compgen -W "$opts" -- "$cur") )
  else
    COMPREPLY=( $(compgen -W "$cmds" -- "$cur") )
  fi
}
complete -F _idaroom idaroom
