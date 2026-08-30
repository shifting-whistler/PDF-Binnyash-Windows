import base64
import io
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

import fitz
import webview
from PIL import Image

from backend.pdf_color import apply_color_to_pdf, render_color_preview, has_color_changes
from backend.pdf_merge import merge_pdfs
from backend.pdf_print import create_print_layout, render_layout_preview

APP_TITLE = "PDF Binnyash"
WATERMARK_TEXT = "https://pdfbinnyash.pages.dev/"
PREVIEW_SCALE = 1.7
THUMBNAIL_SCALE = 0.42


def resource_path(relative_path: str) -> Path:
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
    return base / relative_path


def safe_name(name: str) -> str:
    return Path(name).name or "document.pdf"


class API:
    def __init__(self):
        self.work_dir = Path(tempfile.mkdtemp(prefix="pdf_binyas_"))
        self.current_pdf: Path | None = None

    def _progress(self, percent, message="Processing PDF…"):
        try:
            if webview.windows:
                payload = json.dumps({"percent": float(percent), "message": str(message)})
                webview.windows[0].evaluate_js(f"window.__pdfProgress({payload});")
        except Exception:
            pass

    def _validate_pdf(self, path: Path):
        if not path.exists():
            raise FileNotFoundError(f"PDF file not found: {path.name}")
        if path.suffix.lower() != ".pdf":
            raise ValueError(f"Not a PDF file: {path.name}")
        try:
            with fitz.open(str(path)) as doc:
                if doc.page_count == 0:
                    raise ValueError(f"{path.name} contains no pages.")
        except Exception as exc:
            if isinstance(exc, (ValueError, FileNotFoundError)):
                raise
            raise ValueError(f"Could not open {path.name}: {exc}") from exc

    def _info(self, path: Path, include_thumbnail=True):
        self._validate_pdf(path)
        with fitz.open(str(path)) as doc:
            result = {
                "path": str(path),
                "name": path.name,
                "page_count": doc.page_count,
                "pages": [],
            }
            if include_thumbnail:
                page = doc[0]
                pix = page.get_pixmap(
                    matrix=fitz.Matrix(THUMBNAIL_SCALE, THUMBNAIL_SCALE),
                    alpha=False,
                )
                result["pages"].append({
                    "index": 0,
                    "width": page.rect.width,
                    "height": page.rect.height,
                    "image": self._data_url(pix.tobytes("jpeg", jpg_quality=80)),
                })
            return result

    @staticmethod
    def _data_url(data: bytes, mime="image/jpeg"):
        return f"data:{mime};base64," + base64.b64encode(data).decode("ascii")

    def _set_current(self, path: Path):
        self._validate_pdf(path)
        self.current_pdf = Path(path)
        return self._info(self.current_pdf, include_thumbnail=True)

    def _open_dialog(self, multiple=False):
        files = webview.windows[0].create_file_dialog(
            webview.OPEN_DIALOG,
            allow_multiple=multiple,
            file_types=("PDF files (*.pdf)",),
        )
        if not files:
            return []
        if isinstance(files, str):
            files = [files]
        return list(files)

    def open_pdf(self):
        files = self._open_dialog(False)
        if not files:
            return None
        return self._set_current(Path(files[0]))

    def open_pdfs(self):
        results = []
        for raw in self._open_dialog(True):
            path = Path(raw)
            try:
                results.append(self._info(path, include_thumbnail=True))
            except Exception as exc:
                results.append({
                    "path": str(path),
                    "name": path.name,
                    "error": str(exc),
                    "pages": [],
                    "page_count": 0,
                })
        return results

    def add_dropped_pdf(self, filename, data_url):
        if not filename.lower().endswith(".pdf"):
            raise ValueError("Only PDF files are supported.")
        if "," in data_url:
            data_url = data_url.split(",", 1)[1]
        try:
            raw = base64.b64decode(data_url)
        except Exception as exc:
            raise ValueError("The dropped file could not be read.") from exc
        if not raw:
            raise ValueError("The dropped PDF is empty.")
        display_name = safe_name(filename)
        # Internal storage name is intentionally separate from the original display name.
        # This prevents the UI from ever exposing drop_1/drop_2 prefixes.
        stem = Path(display_name).stem
        suffix = Path(display_name).suffix or ".pdf"
        counter = 1
        path = self.work_dir / f"source_{counter}_{stem}{suffix}"
        while path.exists():
            counter += 1
            path = self.work_dir / f"source_{counter}_{stem}{suffix}"
        path.write_bytes(raw)
        info = self._info(path, include_thumbnail=True)
        info["name"] = display_name
        return info

    def render_page(self, path, page_index, scale=PREVIEW_SCALE):
        target = Path(path)
        self._validate_pdf(target)
        with fitz.open(str(target)) as doc:
            index = int(page_index)
            if not 0 <= index < doc.page_count:
                raise IndexError("Page number is out of range.")
            page = doc[index]
            pix = page.get_pixmap(matrix=fitz.Matrix(float(scale), float(scale)), alpha=False)
            return self._data_url(pix.tobytes("jpeg", jpg_quality=92))

    def merge(self, paths):
        if not paths:
            raise ValueError("Select at least one PDF.")
        normalized = [Path(p) for p in paths]
        for path in normalized:
            self._validate_pdf(path)
        output = self.work_dir / "merged.pdf"
        self._progress(0, "Preparing merge…")
        merge_pdfs(normalized, output, progress=self._progress)
        self._progress(100, "Merge complete")
        return self._set_current(output)

    def save_pdf(self, path, suggested_name="output.pdf"):
        source = Path(path)
        self._validate_pdf(source)
        result = webview.windows[0].create_file_dialog(
            webview.SAVE_DIALOG,
            save_filename=suggested_name,
            file_types=("PDF files (*.pdf)",),
        )
        if not result:
            return {"saved": False, "cancelled": True}
        if isinstance(result, (tuple, list)):
            result = result[0] if result else None
        if not result:
            return {"saved": False, "cancelled": True}
        target = Path(result)
        if target.suffix.lower() != ".pdf":
            target = target.with_suffix(".pdf")
        target.parent.mkdir(parents=True, exist_ok=True)
        if source.resolve() != target.resolve():
            shutil.copyfile(source, target)
        return {"saved": True, "path": str(target)}

    def download_merged(self, paths, suggested_name="merged.pdf"):
        info = self.merge(paths)
        saved = self.save_pdf(info["path"], suggested_name)
        return {"pdf": info, "save": saved}

    def preview_color(self, path, page_index, settings):
        target = Path(path)
        self._validate_pdf(target)
        data = render_color_preview(target, int(page_index), settings, scale=PREVIEW_SCALE)
        return self._data_url(data)

    def process_color(self, path, settings):
        src_path = Path(path)
        self._validate_pdf(src_path)
        output = self.work_dir / f"modified_{os.getpid()}.pdf"
        self._progress(0, "Preparing color modification…")
        if has_color_changes(settings):
            apply_color_to_pdf(src_path, output, settings, progress=self._progress)
        else:
            shutil.copyfile(src_path, output)
            self._progress(100, "No color changes needed")
        return self._set_current(output)

    def download_color(self, path, settings, suggested_name="modified.pdf"):
        # Download is a snapshot: it does not change the current working PDF or tool state.
        src_path = Path(path)
        self._validate_pdf(src_path)
        output = self.work_dir / f"download_modified_{os.getpid()}.pdf"
        self._progress(0, "Preparing color modification…")
        if has_color_changes(settings):
            apply_color_to_pdf(src_path, output, settings, progress=self._progress)
        else:
            shutil.copyfile(src_path, output)
            self._progress(100, "No color changes needed")
        saved = self.save_pdf(output, suggested_name)
        return saved

    def render_layout_preview(self, path, page_size, orientation, columns, rows, sheet_index=0):
        target = Path(path)
        self._validate_pdf(target)
        data, meta = render_layout_preview(
            target,
            page_size,
            orientation,
            int(columns),
            int(rows),
            int(sheet_index),
            watermark=WATERMARK_TEXT,
        )
        return {"image": self._data_url(data), **meta}

    def print_layout(self, path, page_size, orientation, columns, rows):
        src_path = Path(path)
        self._validate_pdf(src_path)
        output = self.work_dir / f"print_layout_{os.getpid()}.pdf"
        self._progress(0, "Preparing print layout…")
        create_print_layout(
            src_path,
            output,
            page_size=page_size,
            orientation=orientation,
            columns=int(columns),
            rows=int(rows),
            watermark=WATERMARK_TEXT,
            progress=self._progress,
        )
        self._progress(100, "Print layout complete")
        return str(output)

    def download_layout(self, path, page_size, orientation, columns, rows, suggested_name="print-layout.pdf"):
        output = Path(self.print_layout(path, page_size, orientation, columns, rows))
        return self.save_pdf(output, suggested_name)

    def cleanup(self):
        shutil.rmtree(self.work_dir, ignore_errors=True)


if __name__ == "__main__":
    import multiprocessing
    # Required on Windows for PyInstaller-frozen executables: without this,
    # the ProcessPoolExecutor workers spawned by pdf_color.py would each
    # re-launch the whole app instead of running as plain worker processes.
    multiprocessing.freeze_support()

    api = API()
    html = str(resource_path("frontend/index.html"))
    webview.create_window(
        APP_TITLE,
        html,
        js_api=api,
        min_size=(980, 680),
        width=1280,
        height=820,
    )
    try:
        webview.start(debug=False)
    finally:
        api.cleanup()
