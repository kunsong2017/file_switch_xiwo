"""Package the ready-to-serve static app and its source without local runtime data."""
import argparse
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, default=root.parent / '题页-试卷转PPT-旧版工程服务包.zip')
args = parser.parse_args()
if not (root / 'dist/index.html').is_file():
    raise SystemExit('缺少构建产物 dist/index.html，请先运行 npm run build 再打包。')
for required in ['ocr/worker.min.js', 'ocr/lang/eng.traineddata.gz', 'ocr/lang/chi_sim.traineddata.gz']:
    if not (root / 'dist' / required).is_file():
        raise SystemExit(f'缺少离线资源 {required}，请准备资源并重新构建后打包。')
target = args.output.resolve()
temporary = target.with_suffix('.tmp.zip')
excluded = {'node_modules', 'test-results', '.git', 'dist-next', 'dist-previous'}
with zipfile.ZipFile(temporary, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for item in sorted(root.rglob('*')):
        if not item.is_file() or item.resolve() in (target, temporary):
            continue
        rel = item.relative_to(root)
        if any(part in excluded for part in rel.parts):
            continue
        if rel.parts[0] == 'offline' and item.suffix == '.zip':
            continue
        if len(rel.parts) > 1 and rel.parts[0] == 'public' and rel.parts[1] in {'pdf', 'ocr', 'licenses'}:
            continue
        if rel == Path('使用前先看.txt'):
            archive.writestr('题页-试卷转PPT/使用前先看.txt',
                '这是旧版工程服务包，需要 Python 3.8+。\n'
                'Windows 双击 启动题页.bat；macOS / Linux 运行 sh ./启动题页.sh。\n'
                '保持启动窗口开启，用浏览器访问窗口中的本机网址。\n'
                '如果希望不安装 Python，请下载免安装离线包，解压后双击其中的 index.html。\n'
                '源码构建免安装版：npm run build:offline；npm run package:offline。\n')
        else:
            archive.write(item, Path('题页-试卷转PPT') / rel)
with zipfile.ZipFile(temporary) as archive:
    if archive.testzip() is not None:
        raise RuntimeError('交付包完整性检查失败')
temporary.replace(target)
print(f'{target} ({target.stat().st_size:,} bytes)')
