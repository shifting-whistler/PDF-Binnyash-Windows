from pathlib import Path
import fitz


def merge_pdfs(input_paths, output_path, progress=None):
    paths = [Path(p) for p in input_paths]
    if not paths:
        raise ValueError("Select at least one PDF.")

    output_path = Path(output_path)
    temp_path = output_path.with_suffix(".tmp.pdf")
    temp_path.unlink(missing_ok=True)

    try:
        if progress:
            progress(0, "Merging PDFs…")
        total_files = len(paths)
        with fitz.open() as out:
            for file_index, path in enumerate(paths):
                if not path.exists():
                    raise FileNotFoundError(f"File not found: {path.name}")
                with fitz.open(str(path)) as src:
                    if src.page_count == 0:
                        raise ValueError(f"{path.name} contains no pages.")
                    # Insert every page of this source PDF in a single call instead of
                    # one insert_pdf() call per page — each call carries fixed overhead
                    # (graft map setup, etc.), so batching per-file is dramatically
                    # faster for multi-page sources while still giving smooth,
                    # file-by-file progress feedback.
                    out.insert_pdf(src, from_page=0, to_page=src.page_count - 1)
                if progress:
                    progress(((file_index + 1) / max(1, total_files)) * 96, f"Merging PDFs… {file_index + 1}/{total_files} files")
            if out.page_count == 0:
                raise ValueError("The merged PDF contains no pages.")
            if progress:
                progress(98, "Saving merged PDF…")
            # garbage=1 still drops unused objects but skips the expensive full
            # object-deduplication pass that garbage=4 performs — noticeably
            # faster on large merges with an identical visual result.
            out.save(str(temp_path), garbage=1, deflate=True)
        temp_path.replace(output_path)
        if progress:
            progress(100, "Merge complete")
    except Exception:
        temp_path.unlink(missing_ok=True)
        raise

    return output_path
