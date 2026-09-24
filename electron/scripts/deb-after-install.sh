#!/bin/bash
# Register the `idaroom` command and its bash completion after .deb install.
set -e
ln -sf '/opt/IDAROOM/idaroom' /usr/bin/idaroom
if [ -f '/opt/IDAROOM/resources/idaroom-completion.bash' ]; then
  install -Dm644 '/opt/IDAROOM/resources/idaroom-completion.bash' \
    /usr/share/bash-completion/completions/idaroom || true
fi

# systemd units + default CLI configuration (never overwrite user settings).
SD='/opt/IDAROOM/resources/systemd'
if [ -d "$SD" ]; then
  install -Dm644 "$SD/idaroom.service" /usr/lib/systemd/user/idaroom.service || true
  install -Dm644 "$SD/idaroom-health.service" /usr/lib/systemd/system/idaroom-health.service || true
  install -Dm644 "$SD/idaroom-health.timer" /usr/lib/systemd/system/idaroom-health.timer || true
  if [ ! -f /etc/idaroom/idaroom.env ]; then
    install -Dm644 "$SD/idaroom.env" /etc/idaroom/idaroom.env || true
  fi
  systemctl daemon-reload 2>/dev/null || true
fi

chmod 4755 '/opt/IDAROOM/chrome-sandbox' 2>/dev/null || true
update-desktop-database -q 2>/dev/null || true

