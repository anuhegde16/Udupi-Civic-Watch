import fitz
from pathlib import Path

pdf = Path('attached_assets/CMC_Udupi_WARD_MAP_1786352999898.pdf')
out = Path('.agents/outputs/cmc_ward_map_page1.png')
doc = fitz.open(pdf)
print('pages:', doc.page_count)
print('metadata:', doc.metadata)
page = doc[0]
print('page_rect:', page.rect)
# Render at a readable scale for visual inspection.
pix = page.get_pixmap(matrix=fitz.Matrix(2.5, 2.5), alpha=False)
pix.save(out)
print('rendered:', out, pix.width, pix.height)
# Text blocks and word positions, useful for comparing labels.
words = page.get_text('words')
print('word_count:', len(words))
for w in words:
    text = w[4].strip()
    if text.isdigit() and 1 <= int(text) <= 35:
        print(f'ward_label {text}: bbox=({w[0]:.2f},{w[1]:.2f},{w[2]:.2f},{w[3]:.2f})')
