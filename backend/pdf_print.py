from pathlib import Path
import io

import fitz

PAGE_SIZES = {
    "A0": (2383.94, 3370.39),
    "A1": (1683.78, 2383.94),
    "A2": (1190.55, 1683.78),
    "A3": (841.89, 1190.55),
    "A4": (595.28, 841.89),
    "A5": (419.53, 595.28),
    "A6": (297.64, 419.53),
    "B4": (708.66, 1000.63),
    "B5": (498.90, 708.66),
    "Letter": (612, 792),
    "Legal": (612, 1008),
    "Tabloid": (792, 1224),
    "Executive": (522, 756),
    "Statement": (396, 612),
}


def page_dimensions(page_size, orientation):
    if page_size not in PAGE_SIZES:
        raise ValueError(f"Unsupported page size: {page_size}")
    w, h = PAGE_SIZES[page_size]
    if orientation == "Landscape":
        w, h = h, w
    elif orientation != "Portrait":
        raise ValueError("Orientation must be Portrait or Landscape.")
    return w, h


def layout_meta(page_size, orientation, columns, rows):
    w, h = page_dimensions(page_size, orientation)
    columns = max(1, min(20, int(columns)))
    rows = max(1, min(20, int(rows)))
    return w, h, columns, rows, columns * rows


def _cell_for(n, columns, rows, cellw, cellh):
    # Column-major: 1,2,3... down the first vertical column, then the next column.
    col = n // rows
    row = n % rows
    return fitz.Rect(col * cellw, row * cellh, (col + 1) * cellw, (row + 1) * cellh)


def _place_source(page, source_page, cell):
    source_rect = source_page.rect
    margin = min(cell.width, cell.height) * 0.035
    available = fitz.Rect(cell.x0 + margin, cell.y0 + margin, cell.x1 - margin, cell.y1 - margin)
    scale = min(available.width / source_rect.width, available.height / source_rect.height)
    nw = source_rect.width * scale
    nh = source_rect.height * scale
    x = available.x0 + (available.width - nw) / 2
    y = available.y0 + (available.height - nh) / 2
    page.show_pdf_page(fitz.Rect(x, y, x + nw, y + nh), source_page.parent, source_page.number)


def _decorate_cell(page, cell, source_number):
    # Subtle divider around every physical section.
    page.draw_rect(cell, color=(0.70, 0.70, 0.70), width=0.35)
    # Very small, but still readable, source-page number in the TOP LEFT.
    page.insert_text((cell.x0 + 3.5, cell.y0 + 7.5), str(source_number), fontsize=5.2, color=(0.16, 0.16, 0.16))


def _watermarks(page, w, h, columns, cellw, text):
    for col in range(columns):
        center_x = col * cellw + cellw / 2
        tw = fitz.get_text_length(text, fontname="helv", fontsize=4)
        page.insert_text((center_x - tw / 2, h - 4.5), text, fontsize=4, color=(0.45, 0.45, 0.45))


def create_print_layout(input_path, output_path, page_size="A4", orientation="Portrait", columns=2, rows=4, watermark="www.pdfbinyas.com", progress=None):
    input_path = Path(input_path)
    output_path = Path(output_path)
    w, h, columns, rows, per_sheet = layout_meta(page_size, orientation, columns, rows)
    temp_path = output_path.with_suffix(".tmp.pdf")
    temp_path.unlink(missing_ok=True)

    try:
        with fitz.open(str(input_path)) as src, fitz.open() as out:
            if src.page_count == 0:
                raise ValueError("The source PDF contains no pages.")
            cellw, cellh = w / columns, h / rows
            total_sheets = max(1, (src.page_count + per_sheet - 1) // per_sheet)
            for sheet_number, start in enumerate(range(0, src.page_count, per_sheet), start=1):
                page = out.new_page(width=w, height=h)
                for n in range(per_sheet):
                    idx = start + n
                    if idx >= src.page_count:
                        break
                    cell = _cell_for(n, columns, rows, cellw, cellh)
                    _place_source(page, src[idx], cell)
                    _decorate_cell(page, cell, idx + 1)
                _watermarks(page, w, h, columns, cellw, watermark)
                if progress:
                    progress((sheet_number / total_sheets) * 96, f"Creating print layout… {sheet_number}/{total_sheets}")
            if progress:
                progress(98, "Saving print-layout PDF…")
            # garbage=1: same visual result as garbage=4, without the costly
            # full object-deduplication pass — much faster to save.
            out.save(str(temp_path), garbage=1, deflate=True)
        temp_path.replace(output_path)
    except Exception:
        temp_path.unlink(missing_ok=True)
        raise

    return output_path


def render_layout_preview(input_path, page_size, orientation, columns, rows, sheet_index=0, watermark="www.pdfbinyas.com", preview_scale=1.35):
    input_path = Path(input_path)
    w, h, columns, rows, per_sheet = layout_meta(page_size, orientation, columns, rows)

    with fitz.open(str(input_path)) as src:
        total_sheets = max(1, (src.page_count + per_sheet - 1) // per_sheet)
        sheet_index = max(0, min(int(sheet_index), total_sheets - 1))

        with fitz.open() as preview_doc:
            page = preview_doc.new_page(width=w, height=h)
            cellw, cellh = w / columns, h / rows
            start = sheet_index * per_sheet
            for n in range(per_sheet):
                idx = start + n
                if idx >= src.page_count:
                    break
                cell = _cell_for(n, columns, rows, cellw, cellh)
                _place_source(page, src[idx], cell)
                _decorate_cell(page, cell, idx + 1)
            _watermarks(page, w, h, columns, cellw, watermark)

            pix = page.get_pixmap(
                matrix=fitz.Matrix(preview_scale, preview_scale),
                alpha=False,
                colorspace=fitz.csRGB,
            )
            data = pix.tobytes("png")

    return data, {
        "sheet": sheet_index + 1,
        "sheets": total_sheets,
        "columns": columns,
        "rows": rows,
        "width": w,
        "height": h,
        "width_mm": round(w * 25.4 / 72.0, 2),
        "height_mm": round(h * 25.4 / 72.0, 2),
        "pages_per_sheet": per_sheet,
    }
