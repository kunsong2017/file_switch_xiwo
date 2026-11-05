#!/bin/sh
set -eu
tiye_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$tiye_directory"
if ! command -v python3 >/dev/null 2>&1; then
    echo '请先安装 Python 3.8 或更新版本，再启动题页。' >&2
    exit 1
fi
exec python3 scripts/serve.py --open
