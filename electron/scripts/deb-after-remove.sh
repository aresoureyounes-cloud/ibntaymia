#!/bin/bash
set -e
systemctl disable --now idaroom-health.timer 2>/dev/null || true
rm -f /usr/bin/idaroom
rm -f /usr/share/bash-completion/completions/idaroom
rm -f /usr/lib/systemd/user/idaroom.service
rm -f /usr/lib/systemd/system/idaroom-health.service
rm -f /usr/lib/systemd/system/idaroom-health.timer
systemctl daemon-reload 2>/dev/null || true
# /etc/idaroom/idaroom.env يُترك عمداً للحفاظ على إعدادات المستخدم
update-desktop-database -q 2>/dev/null || true
