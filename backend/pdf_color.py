from pathlib import Path
import io
import os

import fitz
from PIL import Image, ImageEnhance, ImageFilter, ImageOps

# Below this many pages, spinning up a process pool costs more than it saves —
# just process sequentially in-process.
_PARALLEL_PAGE_THRESHOLD = 4
# Cap worker processes: more than this mostly adds memory/scheduling overhead
# without further speedup for typical documents.
_MAX_WORKERS = 8


def _settings(settings):
    settings = settings or {}
    return {
        "invert": bool(settings.get("invert", False)),
        "grayscale": bool(settings.get("grayscale", False)),
        "contrast": max(-100.0, min(100.0, float(settings.get("contrast", 0)))),
        "sharpen": max(0.0, min(100.0, float(settings.get("sharpen", 0)))),
        "threshold": max(0, min(255, int(float(settings.get("threshold", 0))))),
    }


def apply_color_image(image: Image.Image, settings):
    s = _settings(settings)
    image = image.convert("RGB")

    # Threshold is a dedicated black/white mode. A value of 0 means disabled.
    if s["grayscale"] or s["threshold"] > 0:
        image = ImageOps.grayscale(image).convert("RGB")

    if s["invert"]:
        image = ImageOps.invert(image)

    if s["contrast"] != 0:
        factor = 1.0 + (s["contrast"] / 100.0)
        image = ImageEnhance.Contrast(image).enhance(max(0.0, factor))

    if s["sharpen"] > 0:
        # Smoothly scales both radius and amount so low values remain useful and high values
        # are visibly sharper without turning normal scans into halos immediately.
        radius = 0.5 + 1.5 * (s["sharpen"] / 100.0)
        percent = int(70 + 230 * (s["sharpen"] / 100.0))
        image = image.filter(ImageFilter.UnsharpMask(radius=radius, percent=percent, threshold=2))

    if s["threshold"] > 0:
        gray = ImageOps.grayscale(image)
        cutoff = s["threshold"]
        image = gray.point(lambda p: 255 if p >= cutoff else 0, mode="1").convert("RGB")

    return image


def has_color_changes(settings):
    s = _settings(settings)
    return bool(s["invert"] or s["grayscale"] or s["contrast"] != 0 or s["sharpen"] > 0 or s["threshold"] > 0)


def _render_page(page, scale):
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False, colorspace=fitz.csRGB)
    return Image.frombytes("RGB", [pix.width, pix.height], pix.samples)


def render_color_preview(input_path: Path, page_index: int, settings, scale=1.7):
    with fitz.open(str(input_path)) as doc:
        if not 0 <= page_index < doc.page_count:
            raise IndexError("Page number is out of range.")
        image = apply_color_image(_render_page(doc[page_index], scale), settings)
        buf = io.BytesIO()
        image.save(buf, format="JPEG", quality=93, optimize=True)
        return buf.getvalue()


def _process_one_page(args):
    """Render + color-process a single page and return its PNG bytes plus the
    source page's point dimensions. Runs either in-process or as a worker in a
    process pool — kept import-light and self-contained (opens its own fitz
    handle) so it is safe and cheap to run in a separate process."""
    input_path, page_index, settings, scale = args
    with fitz.open(input_path) as doc:
        page = doc[page_index]
        image = apply_color_image(_render_page(page, scale), settings)
        width, height = page.rect.width, page.rect.height
    buf = io.BytesIO()
    # PNG stays lossless (identical pixels to the "optimize=True" version) but
    # skips the expensive extra compression search that optimize=True performs —
    # same visual result, much faster to encode. compress_level=6 is zlib's
    # default balance; we nudge it down slightly since these are re-encoded on
    # every export and speed matters more here than shaving a few KB.
    image.save(buf, format="PNG", optimize=False, compress_level=4)
    return page_index, buf.getvalue(), width, height


def apply_color_to_pdf(input_path: Path, output_path: Path, settings, render_dpi=144, progress=None):
    input_path = Path(input_path)
    output_path = Path(output_path)
    temp_path = output_path.with_suffix(".tmp.pdf")
    temp_path.unlink(missing_ok=True)

    scale = render_dpi / 72.0
    try:
        with fitz.open(str(input_path)) as src:
            total = src.page_count

        pages = [None] * total
        jobs = [(str(input_path), i, settings, scale) for i in range(total)]

        if total >= _PARALLEL_PAGE_THRESHOLD:
            # CPU-bound work (rasterizing + PIL color ops + PNG encode) for each
            # page is fully independent, so it parallelizes across processes
            # almost linearly with core count — this is where the real "super
            # fast" win comes from on multi-page documents.
            import concurrent.futures as cf

            workers = min(_MAX_WORKERS, max(1, os.cpu_count() or 4), total)
            done = 0
            with cf.ProcessPoolExecutor(max_workers=workers) as pool:
                for page_index, png_bytes, width, height in pool.map(_process_one_page, jobs):
                    pages[page_index] = (png_bytes, width, height)
                    done += 1
                    if progress:
                        progress((done / max(1, total)) * 90, f"Processing color… {done}/{total}")
        else:
            for job in jobs:
                page_index, png_bytes, width, height = _process_one_page(job)
                pages[page_index] = (png_bytes, width, height)
                if progress:
                    progress(((page_index + 1) / max(1, total)) * 90, f"Processing color… {page_index + 1}/{total}")

        if progress:
            progress(92, "Assembling PDF…")
        with fitz.open() as out:
            for png_bytes, width, height in pages:
                new_page = out.new_page(width=width, height=height)
                # Preserve the exact source page dimensions. The raster image is
                # contained inside the same page rectangle, so no page stretching
                # occurs at the PDF level.
                new_page.insert_image(new_page.rect, stream=png_bytes, keep_proportion=True)
            if progress:
                progress(98, "Saving modified PDF…")
            # garbage=1: drop unused objects without the costly full
            # object-deduplication pass — same visual output, faster save.
            out.save(str(temp_path), garbage=1, deflate=True)
        temp_path.replace(output_path)
        if progress:
            progress(100, "Color modification complete")
    except Exception:
        temp_path.unlink(missing_ok=True)
        raise

    return output_path
