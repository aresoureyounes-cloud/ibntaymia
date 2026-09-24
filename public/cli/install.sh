#!/bin/sh
# IDAROOM CLI installer
#   curl -fsSL https://idarroom.lovable.app/cli/install.sh | sh
#   curl -fsSL https://idarroom.lovable.app/cli/install.sh | sudo sh   (تثبيت للجميع)
set -e

BASE_URL="${IDAROOM_BASE_URL:-https://idarroom.lovable.app}"
SRC="$BASE_URL/cli/idaroom"

if ! command -v node >/dev/null 2>&1; then
  echo "خطأ: Node.js 18+ مطلوب. ثبّته أولاً:  sudo apt install nodejs" >&2
  exit 1
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "خطأ: Node.js $NODE_MAJOR قديم — مطلوب 18 أو أحدث." >&2
  exit 1
fi

if [ "$(id -u)" = "0" ]; then
  DEST="/usr/local/bin"
  COMP_DIR="/etc/bash_completion.d"
else
  DEST="$HOME/.local/bin"
  COMP_DIR="$HOME/.local/share/bash-completion/completions"
fi

mkdir -p "$DEST" "$COMP_DIR"

echo "تنزيل idaroom من $SRC ..."
curl -fsSL "$SRC" -o "$DEST/idaroom"
chmod 755 "$DEST/idaroom"

curl -fsSL "$BASE_URL/cli/idaroom-completion.bash" -o "$COMP_DIR/idaroom" 2>/dev/null || true

mkdir -p "$HOME/.config/idaroom"
if [ ! -f "$HOME/.config/idaroom/idaroom.env" ]; then
  cat > "$HOME/.config/idaroom/idaroom.env" <<EOF
IDAROOM_URL=$BASE_URL
IDAROOM_LOG_LEVEL=warn
IDAROOM_TIMEOUT=10000
EOF
fi

echo "تم التثبيت: $DEST/idaroom"
case ":$PATH:" in
  *":$DEST:"*) ;;
  *) echo "أضف هذا السطر إلى ~/.bashrc:  export PATH=\"\$PATH:$DEST\"" ;;
esac

"$DEST/idaroom" version || true
echo "جرّب:  idaroom help   ·   idaroom status   ·   idaroom doctor"
