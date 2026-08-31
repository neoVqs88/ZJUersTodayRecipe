from pathlib import Path

from PIL import Image


asset_dir = Path(__file__).resolve().parents[1] / "static" / "figma"
sources = list(asset_dir.glob("*.png")) + list(asset_dir.glob("*.webp"))
for source in sources:
    with Image.open(source) as opened:
        image = opened.convert("RGB")
    image.thumbnail((640, 640), Image.Resampling.LANCZOS)
    image.save(source.with_suffix(".webp"), "WEBP", quality=74, method=6)

print(sum(path.stat().st_size for path in asset_dir.glob("*.webp")))
