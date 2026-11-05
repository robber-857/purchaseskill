"""Import locally supplied product files; no downloads or uploads."""
import argparse
from pathlib import Path
import shutil
import sys

root = Path(__file__).resolve().parent
sys.path.insert(0, str(root / '.runtime'))
parser = argparse.ArgumentParser(description='Prepare local demo assets from your own product files.')
parser.add_argument('--bkt-image', type=Path, required=True)
parser.add_argument('--warmies-pdf', type=Path, required=True)
args = parser.parse_args()
for source in (args.bkt_image, args.warmies_pdf):
    if not source.is_file():
        parser.error(f'File not found: {source}')
try:
    import pymupdf
except ImportError:
    raise SystemExit('Install PyMuPDF first: python -m pip install pymupdf')
assets = root / 'assets'
assets.mkdir(exist_ok=True)
with pymupdf.open(args.warmies_pdf) as book:
    if len(book) < 30:
        raise SystemExit('Expected the supplied 2024-2025 brand book with at least 30 pages.')
    for index, name, box in [(21, 'penguin', (185,80,305,198)), (29, 'dragon', (132,82,252,201))]:
        page = book[index]
        rect = pymupdf.Rect(*(v * page.rect.width / 624 for v in box))
        page.get_pixmap(matrix=pymupdf.Matrix(3,3), clip=rect).save(assets / f'{name}.png')
for source, destination in [(args.bkt_image, assets/'bkt.jpg'), (args.warmies_pdf, assets/'warmies-brand-book.pdf')]:
    if source.resolve() != destination.resolve():
        shutil.copy2(source, destination)
print('Local assets prepared. Open index.html. Original files are ignored by Git.')
