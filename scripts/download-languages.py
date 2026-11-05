"""Download official Tesseract fast language data for a fully local OCR runtime."""
import gzip
from pathlib import Path
from urllib.request import urlopen

destination = Path(__file__).resolve().parents[1] / 'public/ocr/lang'
destination.mkdir(parents=True, exist_ok=True)
for language in ('eng', 'chi_sim'):
    target = destination / f'{language}.traineddata.gz'
    if target.exists():
        print(f'{language}: already present')
        continue
    url = f'https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/4.1.0/{language}.traineddata'
    with urlopen(url, timeout=90) as response:
        data = response.read()
    if len(data) < 100_000:
        raise RuntimeError(f'Invalid traineddata: {language}')
    target.write_bytes(gzip.compress(data, mtime=0))
    print(f'{language}: {target.stat().st_size:,} bytes')
