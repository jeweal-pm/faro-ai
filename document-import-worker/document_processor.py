"""Bounded PDF/image text extraction for the isolated document-import worker."""

from __future__ import annotations

import csv
import io
import math
import subprocess
import warnings
from contextlib import suppress
from pathlib import Path
from typing import Any, Iterator

import pypdfium2 as pdfium
from PIL import Image, ImageOps

MAX_PDF_PAGES = 25
MAX_IMAGE_PIXELS = 20_000_000
MAX_PREVIEW_BYTES = 3_000_000
PDF_RENDER_SCALE = 2.0
OCR_TIMEOUT_SECONDS = 30
Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS


class DocumentRejected(ValueError):
    """Input is outside the explicitly supported safe-processing envelope."""


def _clean_text(value: str) -> str:
    return "".join(ch if ch in "\n\t" or ord(ch) >= 32 else " " for ch in value).strip()[:100_000]


def _text_layer_is_useful(value: str) -> bool:
    visible = [char for char in value if char.isprintable() and not char.isspace()]
    if len(visible) < 30:
        return False
    plausible = sum(char.isalnum() or char in ".,:;!?()[]{}@#$%&+-_/\\'\"฿€£¥" for char in visible)
    return plausible / len(visible) >= 0.72


def _render_preview(image: Image.Image) -> bytes:
    image = ImageOps.exif_transpose(image)
    image.thumbnail((1800, 2400), Image.Resampling.LANCZOS)
    output = io.BytesIO()
    image.convert("RGB").save(output, format="JPEG", quality=78, optimize=True)
    result = output.getvalue()
    if len(result) > MAX_PREVIEW_BYTES:
        image.thumbnail((1400, 1800), Image.Resampling.LANCZOS)
        output = io.BytesIO()
        image.convert("RGB").save(output, format="JPEG", quality=68, optimize=True)
        result = output.getvalue()
    if len(result) > MAX_PREVIEW_BYTES:
        raise DocumentRejected("preview_limit_exceeded")
    return result


def _ocr_image(image: Image.Image, language: str) -> tuple[str, list[dict[str, Any]]]:
    normalized = ImageOps.exif_transpose(image).convert("RGB")
    if normalized.width * normalized.height > MAX_IMAGE_PIXELS:
        raise DocumentRejected("image_pixel_limit_exceeded")
    image_buffer = io.BytesIO()
    normalized.save(image_buffer, format="PNG", optimize=True)
    env = {"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8", "HOME": "/tmp"}
    try:
        completed = subprocess.run(
            ["tesseract", "stdin", "stdout", "-l", language, "--psm", "3", "tsv"],
            input=image_buffer.getvalue(),
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            check=False,
            timeout=OCR_TIMEOUT_SECONDS,
            env=env,
            close_fds=True,
        )
    except subprocess.TimeoutExpired as error:
        raise DocumentRejected("ocr_time_limit_exceeded") from error
    except OSError as error:
        raise RuntimeError("ocr_engine_unavailable") from error
    if completed.returncode != 0:
        raise DocumentRejected("ocr_failed")
    try:
        decoded = completed.stdout.decode("utf-8", errors="replace")
        rows = csv.DictReader(io.StringIO(decoded), delimiter="\t")
        text_parts: list[str] = []
        evidence: list[dict[str, Any]] = []
        for row in rows:
            text = (row.get("text") or "").strip()
            if not text:
                continue
            text_parts.append(text)
            try:
                confidence = float(row.get("conf") or -1)
                left, top = int(row["left"]), int(row["top"])
                width, height = int(row["width"]), int(row["height"])
            except (KeyError, TypeError, ValueError):
                continue
            if confidence >= 0 and len(evidence) < 4000:
                evidence.append({
                    "text": text[:300],
                    "confidence": round(max(0.0, min(1.0, confidence / 100)), 3),
                    "image_width": normalized.width,
                    "image_height": normalized.height,
                    "bbox_pixels": {"left": left, "top": top, "width": width, "height": height},
                })
        return _clean_text(" ".join(text_parts)), evidence
    except Exception as error:
        raise DocumentRejected("ocr_output_invalid") from error


def _open_image(path: Path) -> Image.Image:
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            image = Image.open(path)
            if image.format not in {"PNG", "JPEG"}:
                raise DocumentRejected("unsupported_image_format")
            if image.width <= 0 or image.height <= 0 or image.width * image.height > MAX_IMAGE_PIXELS:
                raise DocumentRejected("image_pixel_limit_exceeded")
            image.load()
            return ImageOps.exif_transpose(image).convert("RGB")
    except DocumentRejected:
        raise
    except (Image.DecompressionBombError, Image.DecompressionBombWarning) as error:
        raise DocumentRejected("image_pixel_limit_exceeded") from error
    except Exception as error:
        raise DocumentRejected("invalid_image") from error


def _pdf_pages(path: Path, ocr_language: str) -> Iterator[tuple[int, str, str, list[dict[str, Any]], bytes]]:
    document = None
    try:
        document = pdfium.PdfDocument(path)
        if len(document) < 1 or len(document) > MAX_PDF_PAGES:
            raise DocumentRejected("page_limit_exceeded")
        for index in range(len(document)):
            try:
                page = document[index]
                width_pt, height_pt = page.get_size()
                if not math.isfinite(width_pt) or not math.isfinite(height_pt) or width_pt <= 0 or height_pt <= 0:
                    raise DocumentRejected("invalid_page_dimensions")
                scale = min(PDF_RENDER_SCALE, math.sqrt(MAX_IMAGE_PIXELS / (width_pt * height_pt)))
                scale = max(0.25, scale)
                text_page = page.get_textpage()
                try:
                    text = _clean_text(text_page.get_text_bounded() or "")
                    preview_image = page.render(scale=scale).to_pil().convert("RGB")
                    preview = _render_preview(preview_image)
                    evidence: list[dict[str, Any]] = [{"kind": "page_text", "page": index + 1}]
                    source = "pdf_text"
                    if not _text_layer_is_useful(text):
                        text, evidence = _ocr_image(preview_image, ocr_language)
                        source = "ocr"
                    yield index + 1, text, source, evidence, preview
                finally:
                    with suppress(Exception):
                        text_page.close()
                    with suppress(Exception):
                        page.close()
            except DocumentRejected:
                raise
            except Exception as error:
                raise DocumentRejected("pdf_page_unreadable") from error
    except DocumentRejected:
        raise
    except Exception as error:
        raise DocumentRejected("invalid_pdf") from error
    finally:
        if document is not None:
            with suppress(Exception):
                document.close()


def iter_document_pages(path: Path, content_type: str, language_hint: str = "auto") -> Iterator[tuple[int, str, str, list[dict[str, Any]], bytes]]:
    """Yield page number, extracted text, source kind, evidence and safe JPEG preview."""
    ocr_language = {"auto": "eng+tha", "en": "eng", "th": "tha"}.get(language_hint)
    if ocr_language is None:
        raise DocumentRejected("unsupported_language_hint")
    if content_type == "application/pdf":
        yield from _pdf_pages(path, ocr_language)
        return
    if content_type in {"image/png", "image/jpeg"}:
        image = _open_image(path)
        preview = _render_preview(image)
        text, evidence = _ocr_image(image, ocr_language)
        yield 1, text, "ocr", evidence, preview
        return
    raise DocumentRejected("unsupported_file_type")
