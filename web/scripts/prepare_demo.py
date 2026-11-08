from pathlib import Path
import sys
root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root / '.runtime'))
import pymupdf
import shutil
out = root / 'web/public/demo-assets'
out.mkdir(parents=True, exist_ok=True)
doc = pymupdf.open(root / 'assets/warmies-brand-book.pdf')
for number in [1, 4, 22, 30]:
    doc[number - 1].get_pixmap(matrix=pymupdf.Matrix(1.2, 1.2)).save(out / f'page-{number}.jpg')
if (root / 'assets/penguin.png').exists():
    shutil.copyfile(root / 'assets/penguin.png', out / 'penguin.png')
print('Prepared the selected Warmies preview images. Original PDF stays local.')
