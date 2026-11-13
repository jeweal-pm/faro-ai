"""Fixed, bounded document renderers. Input is data; it is never executable code."""
from __future__ import annotations

import math
import os
import re
import base64
import binascii
from io import BytesIO
from html import escape
from pathlib import Path
from typing import Any

from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Mm, Pt as DocxPt, RGBColor
from openpyxl import Workbook
from openpyxl.drawing.image import Image as WorksheetImage
from openpyxl.styles import Font, PatternFill
from openpyxl.styles import Alignment as WorksheetAlignment
from openpyxl.utils import get_column_letter
from PIL import Image as PillowImage
from pptx import Presentation
from pptx.util import Inches, Pt
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A3, A4, letter, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import HRFlowable, Image as PdfImage, LongTable, Paragraph, SimpleDocTemplate, Spacer, TableStyle

from pdf_layout_reference import ACCENT, RULE, table_style


FORMATS = {"pdf", "xlsx", "docx", "pptx"}
MAX_ROWS, MAX_COLUMNS, MAX_TEXT = 500, 20, 500
MAX_BYTES = 10 * 1024 * 1024
MAX_IMAGE_BYTES = 256 * 1024
LAYOUT_KEYS = {"paper_size", "font_size", "title_size", "alignment", "accent_color", "text_color",
               "title_color", "header_text_color", "header_background_color",
               "margin_mm", "subtitle", "footer", "page_numbers", "hidden_columns", "column_order",
               "image_position", "image_width_mm"}


def _text(value: Any, limit: int = MAX_TEXT) -> str:
    if value is None:
        return ""
    if not isinstance(value, (str, int, float, bool)):
        raise ValueError("unsupported_cell_type")
    if isinstance(value, float) and not math.isfinite(value):
        raise ValueError("invalid_number")
    result = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", str(value))
    if len(result) > limit:
        raise ValueError("cell_too_long")
    return result


def validate_input(document: dict[str, Any]) -> tuple[str, list[str], list[list[Any]], str | None]:
    if (not isinstance(document, dict)
            or not {"title", "columns", "rows"}.issubset(document)
            or set(document) - {"title", "columns", "rows", "orientation", "layout", "image"}):
        raise ValueError("invalid_document")
    title = _text(document["title"], 120).strip()
    cols, rows = document["columns"], document["rows"]
    orientation = document.get("orientation")
    if orientation is not None and orientation not in {"portrait", "landscape"}:
        raise ValueError("invalid_orientation")
    if not title or not isinstance(cols, list) or not 1 <= len(cols) <= MAX_COLUMNS:
        raise ValueError("invalid_columns")
    if not isinstance(rows, list) or not rows or len(rows) > MAX_ROWS:
        raise ValueError("invalid_rows")
    columns = [_text(col, 120).strip() for col in cols]
    if any(not col for col in columns) or len(set(columns)) != len(columns):
        raise ValueError("invalid_columns")
    checked: list[list[Any]] = []
    for row in rows:
        if not isinstance(row, list) or len(row) != len(columns):
            raise ValueError("invalid_row_width")
        for cell in row:
            _text(cell)
        checked.append(row)
    return title, columns, checked, orientation


def validate_layout(value: Any, columns: list[str]) -> dict[str, Any]:
    if value is None:
        return {}
    if not isinstance(value, dict) or set(value) - LAYOUT_KEYS:
        raise ValueError("invalid_layout")
    layout = dict(value)
    choices = {"paper_size": {"a4", "a3", "letter"}, "alignment": {"left", "center", "right"},
               "image_position": {"left", "center", "right"}}
    for key, allowed in choices.items():
        if key in layout and (not isinstance(layout[key], str) or layout[key] not in allowed):
            raise ValueError("invalid_layout")
    ranges = {"font_size": (6, 18), "title_size": (10, 36), "margin_mm": (8, 35),
              "image_width_mm": (15, 100)}
    for key, (minimum, maximum) in ranges.items():
        if key in layout and (isinstance(layout[key], bool) or not isinstance(layout[key], (int, float))
                              or not math.isfinite(layout[key]) or not minimum <= layout[key] <= maximum):
            raise ValueError("invalid_layout")
    for key in ("accent_color", "text_color", "title_color", "header_text_color", "header_background_color"):
        if key in layout and (not isinstance(layout[key], str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", layout[key])):
            raise ValueError("invalid_layout")
    for key, limit in (("subtitle", 500), ("footer", 200)):
        if key in layout and (not isinstance(layout[key], str) or len(layout[key]) > limit):
            raise ValueError("invalid_layout")
        if key in layout:
            _text(layout[key], limit)
    if "page_numbers" in layout and not isinstance(layout["page_numbers"], bool):
        raise ValueError("invalid_layout")
    hidden = layout.get("hidden_columns", [])
    ordered = layout.get("column_order")
    if (not isinstance(hidden, list) or len(hidden) > 19 or any(not isinstance(item, str) or item not in columns for item in hidden)
            or len(set(hidden)) != len(hidden)):
        raise ValueError("invalid_column_selection")
    visible = [column for column in columns if column not in hidden]
    if not visible or (ordered is not None and (not isinstance(ordered, list) or len(ordered) != len(visible)
        or any(not isinstance(item, str) for item in ordered)
        or len(set(ordered)) != len(ordered) or set(ordered) != set(visible))):
        raise ValueError("invalid_column_selection")
    return layout


def select_columns(columns: list[str], rows: list[list[Any]], layout: dict[str, Any]) -> tuple[list[str], list[list[Any]]]:
    hidden = set(layout.get("hidden_columns", []))
    visible = layout.get("column_order") or [column for column in columns if column not in hidden]
    positions = [columns.index(column) for column in visible]
    return list(visible), [[row[index] for index in positions] for row in rows]


def validate_image(value: Any) -> bytes | None:
    if value is None:
        return None
    if (not isinstance(value, dict) or set(value) != {"mime_type", "base64"}
            or not isinstance(value["mime_type"], str) or value["mime_type"] not in {"image/png", "image/jpeg"}):
        raise ValueError("invalid_image")
    encoded = value["base64"]
    if not isinstance(encoded, str) or len(encoded) > 350_000:
        raise ValueError("invalid_image")
    try:
        raw = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error):
        raise ValueError("invalid_image") from None
    if not raw or len(raw) > MAX_IMAGE_BYTES:
        raise ValueError("invalid_image")
    try:
        with PillowImage.open(BytesIO(raw)) as image:
            expected = "PNG" if value["mime_type"] == "image/png" else "JPEG"
            if image.format != expected or image.width * image.height > 4_000_000:
                raise ValueError("invalid_image")
            image.verify()
    except (OSError, PillowImage.DecompressionBombError):
        raise ValueError("invalid_image") from None
    return raw


def spreadsheet_value(value: Any) -> Any:
    if value is None or isinstance(value, (bool, int, float)):
        _text(value)
        return value
    text = _text(value)
    # Excel treats a formula after whitespace/control characters as executable.
    return "'" + text if re.match(r"^[\s]*[=+@-]", text) else text


def _font_path() -> Path:
    candidates = [os.environ.get("FAROAI_DOCUMENT_FONT", ""),
                  "/usr/share/fonts/truetype/noto/NotoSansThai-Regular.ttf",
                  "C:/Windows/Fonts/LeelawUI.ttf"]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return Path(candidate)
    raise ValueError("thai_font_unavailable")


def _latin_font_path() -> Path:
    candidates = ["/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
                  "C:/Windows/Fonts/arial.ttf"]
    for candidate in candidates:
        if Path(candidate).is_file():
            return Path(candidate)
    raise ValueError("latin_font_unavailable")


def _pdf_markup(value: str) -> str:
    """Use a Thai font only for Thai codepoints and a Latin font for other text."""
    parts: list[str] = []
    active_thai: bool | None = None
    run: list[str] = []

    def flush() -> None:
        if not run:
            return
        escaped = escape("".join(run))
        parts.append(f'<font name="FaroThai">{escaped}</font>' if active_thai else escaped)
        run.clear()

    for char in value:
        is_thai = 0x0E00 <= ord(char) <= 0x0E7F
        if active_thai is not None and is_thai != active_thai:
            flush()
        active_thai = is_thai
        run.append(char)
    flush()
    return "".join(parts)


def _pdf(path: Path, title: str, columns: list[str], rows: list[list[Any]], orientation: str | None,
         layout: dict[str, Any], image_data: bytes | None) -> None:
    registered = pdfmetrics.getRegisteredFontNames()
    if "FaroThai" not in registered:
        pdfmetrics.registerFont(TTFont("FaroThai", str(_font_path())))
    if "FaroLatin" not in registered:
        pdfmetrics.registerFont(TTFont("FaroLatin", str(_latin_font_path())))
    page = {"a4": A4, "a3": A3, "letter": letter}.get(layout.get("paper_size"), A3 if len(columns) > 6 else A4)
    if orientation == "landscape" or (orientation is None and len(columns) > 6):
        page = landscape(page)
    align = {"left": TA_LEFT, "center": TA_CENTER, "right": TA_RIGHT}[layout.get("alignment", "left")]
    font_size = layout.get("font_size", 7.5)
    title_size = layout.get("title_size", 16)
    text_color = colors.HexColor(layout.get("text_color", "#2A2A2A"))
    title_color = colors.HexColor(layout.get("title_color", layout.get("text_color", "#2A2A2A")))
    header_text_color = colors.HexColor(layout.get("header_text_color", layout.get("text_color", "#2A2A2A")))
    header_background = colors.HexColor(layout.get("header_background_color", layout.get("accent_color", "#FFFFFF")))
    margin = layout.get("margin_mm", 12.7) * 72 / 25.4
    style = ParagraphStyle("FaroCell", fontName="FaroLatin", fontSize=font_size,
                           leading=font_size * 1.45, wordWrap="CJK", alignment=align, textColor=text_color)
    heading = ParagraphStyle("FaroHeading", fontName="FaroLatin", fontSize=title_size,
                             leading=title_size * 1.35, wordWrap="CJK", alignment=align, textColor=title_color)
    header_style = ParagraphStyle("FaroTableHeader", parent=style, textColor=header_text_color)
    table_rows = [[Paragraph(_pdf_markup(c), header_style) for c in columns]]
    table_rows += [[Paragraph(_pdf_markup(_text(cell)).replace("\n", "<br/>"), style)
                    for cell in row] for row in rows]
    width = (page[0] - 2 * margin) / len(columns)
    table = LongTable(table_rows, colWidths=[width] * len(columns), repeatRows=1)
    table.setStyle(table_style(len(table_rows)))
    table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), header_background)]))
    brand = ParagraphStyle("FaroReportBrand", fontName="FaroLatin", fontSize=7,
                           leading=9, textColor=ACCENT, alignment=TA_CENTER, spaceAfter=4)
    title_heading = ParagraphStyle("FaroReportTitle", parent=heading, alignment=TA_CENTER)
    story: list[Any] = [Paragraph("FAROAI  ·  REPORT", brand),
                        Paragraph(_pdf_markup(title), title_heading),
                        HRFlowable(width="100%", thickness=0.6, color=RULE,
                                   spaceBefore=5, spaceAfter=8)]
    if layout.get("subtitle"):
        story.extend([Spacer(1, 5), Paragraph(_pdf_markup(layout["subtitle"]), style)])
    if image_data:
        with PillowImage.open(BytesIO(image_data)) as image:
            max_width = min(layout.get("image_width_mm", 55) * 72 / 25.4, page[0] - 2 * margin)
            scale = min(max_width / image.width, max(40, page[1] - 2 * margin - 120) / image.height)
            picture = PdfImage(BytesIO(image_data), width=image.width * scale, height=image.height * scale)
            picture.hAlign = layout.get("image_position", "left").upper()
            story.extend([Spacer(1, 8), picture])
    story.extend([Spacer(1, 14), table])

    def draw_page_chrome(canvas: Any, doc: Any) -> None:
        footer = layout.get("footer", "")
        if doc.page > 1:
            canvas.saveState()
            canvas.setStrokeColor(RULE)
            canvas.setLineWidth(0.45)
            canvas.line(margin, page[1] - margin * 0.72, page[0] - margin, page[1] - margin * 0.72)
            running = Paragraph(_pdf_markup(title), ParagraphStyle(
                "FaroRunningTitle", parent=style, fontSize=min(font_size, 8),
                leading=10, textColor=MUTED, alignment=TA_LEFT))
            running.wrap(page[0] - 2 * margin, margin)
            running.drawOn(canvas, margin, page[1] - margin * 0.62)
            canvas.restoreState()
        if footer or layout.get("page_numbers"):
            text = footer + (f"    Page {doc.page}" if layout.get("page_numbers") else "")
            paragraph = Paragraph(_pdf_markup(text), ParagraphStyle(
                "FaroFooter", parent=style, fontSize=min(font_size, 8), alignment=TA_CENTER,
                textColor=MUTED))
            paragraph.wrap(page[0] - 2 * margin, margin)
            canvas.saveState()
            canvas.setStrokeColor(RULE)
            canvas.setLineWidth(0.45)
            canvas.line(margin, margin * 0.8, page[0] - margin, margin * 0.8)
            paragraph.drawOn(canvas, margin, max(5, margin / 3))
            canvas.restoreState()

    SimpleDocTemplate(str(path), pagesize=page, leftMargin=margin, rightMargin=margin,
                      topMargin=max(margin, 18 * 72 / 25.4),
                      bottomMargin=max(margin, 24)).build(
                          story, onFirstPage=draw_page_chrome, onLaterPages=draw_page_chrome)


def _xlsx(path: Path, title: str, columns: list[str], rows: list[list[Any]],
          orientation: str | None, layout: dict[str, Any], image_data: bytes | None) -> None:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Report"
    sheet.append([spreadsheet_value(title)])
    if layout.get("subtitle"):
        sheet.append([spreadsheet_value(layout["subtitle"])])
    sheet.append([spreadsheet_value(value) for value in columns])
    header_row = 3 if layout.get("subtitle") else 2
    text_color = layout.get("text_color", "#26354C").lstrip("#")
    title_color = layout.get("title_color", layout.get("text_color", "#26354C")).lstrip("#")
    header_text_color = layout.get("header_text_color", layout.get("text_color", "#26354C")).lstrip("#")
    accent = layout.get("header_background_color", layout.get("accent_color", "#DFF2F1")).lstrip("#")
    alignment = layout.get("alignment", "left")
    sheet["A1"].font = Font(bold=True, size=layout.get("title_size", 16), color=title_color)
    for cell in sheet[header_row]:
        cell.font = Font(bold=True, size=layout.get("font_size", 11), color=header_text_color)
        cell.fill = PatternFill("solid", fgColor=accent)
        cell.alignment = WorksheetAlignment(horizontal=alignment, wrap_text=True)
    for row in rows:
        sheet.append([spreadsheet_value(value) for value in row])
    for cells in sheet.iter_rows(min_row=header_row + 1):
        for cell in cells:
            cell.font = Font(size=layout.get("font_size", 11), color=text_color)
            cell.alignment = WorksheetAlignment(horizontal=alignment, wrap_text=True)
    sheet.freeze_panes = f"A{header_row + 1}"
    sheet.page_setup.orientation = "landscape" if orientation == "landscape" else "portrait"
    sheet.page_setup.paperSize = {"a4": sheet.PAPERSIZE_A4, "a3": sheet.PAPERSIZE_A3,
                                  "letter": sheet.PAPERSIZE_LETTER}.get(layout.get("paper_size"), sheet.PAPERSIZE_A4)
    if layout.get("footer") or layout.get("page_numbers"):
        sheet.oddFooter.center.text = layout.get("footer", "") + ("  Page &P" if layout.get("page_numbers") else "")
    if image_data:
        stream = BytesIO(image_data)
        picture = WorksheetImage(stream)
        picture.width = layout.get("image_width_mm", 55) * 96 / 25.4
        picture.height = picture.height * picture.width / WorksheetImage(BytesIO(image_data)).width
        anchor_column = {"left": 1, "center": max(2, len(columns) // 2), "right": len(columns) + 2}[layout.get("image_position", "left")]
        picture.anchor = f"{get_column_letter(anchor_column)}{header_row + len(rows) + 3}"
        sheet.add_image(picture)
    workbook.save(path)


def _docx(path: Path, title: str, columns: list[str], rows: list[list[Any]],
          orientation: str | None, layout: dict[str, Any], image_data: bytes | None) -> None:
    document = Document()
    section = document.sections[0]
    dimensions = {"a4": (210, 297), "a3": (297, 420), "letter": (215.9, 279.4)}.get(layout.get("paper_size"), (210, 297))
    width, height = dimensions
    if orientation == "landscape":
        width, height = height, width
        section.orientation = WD_ORIENT.LANDSCAPE
    section.page_width, section.page_height = Mm(width), Mm(height)
    margin = Mm(layout.get("margin_mm", 12.7))
    section.top_margin = section.bottom_margin = section.left_margin = section.right_margin = margin
    align = {"left": WD_ALIGN_PARAGRAPH.LEFT, "center": WD_ALIGN_PARAGRAPH.CENTER,
             "right": WD_ALIGN_PARAGRAPH.RIGHT}[layout.get("alignment", "left")]
    rgb = RGBColor.from_string(layout.get("text_color", "#26354C").lstrip("#"))
    title_rgb = RGBColor.from_string(layout.get("title_color", layout.get("text_color", "#26354C")).lstrip("#"))
    header_text_rgb = RGBColor.from_string(layout.get("header_text_color", layout.get("text_color", "#26354C")).lstrip("#"))
    header_fill = layout.get("header_background_color", layout.get("accent_color", "#DFF2F1")).lstrip("#")
    heading = document.add_heading(title, 0)
    heading.alignment = align
    for run in heading.runs:
        run.font.size = DocxPt(layout.get("title_size", 16))
        run.font.color.rgb = title_rgb
    if layout.get("subtitle"):
        subtitle = document.add_paragraph(layout["subtitle"])
        subtitle.alignment = align
    if image_data:
        image_paragraph = document.add_paragraph()
        image_paragraph.alignment = {"left": WD_ALIGN_PARAGRAPH.LEFT, "center": WD_ALIGN_PARAGRAPH.CENTER,
                                     "right": WD_ALIGN_PARAGRAPH.RIGHT}[layout.get("image_position", "left")]
        with PillowImage.open(BytesIO(image_data)) as picture:
            width_mm = min(layout.get("image_width_mm", 55), 150 * picture.width / picture.height)
        image_paragraph.add_run().add_picture(BytesIO(image_data), width=Mm(width_mm))
    table = document.add_table(rows=1, cols=len(columns))
    table.style = "Table Grid"
    for cell, value in zip(table.rows[0].cells, columns, strict=True):
        cell.text = value
    for row in rows:
        cells = table.add_row().cells
        for cell, value in zip(cells, row, strict=True):
            cell.text = _text(value)
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    for row_index, table_row in enumerate(table.rows):
        for cell in table_row.cells:
            if row_index == 0:
                shading = OxmlElement("w:shd")
                shading.set(qn("w:fill"), header_fill)
                cell._tc.get_or_add_tcPr().append(shading)
            for paragraph in cell.paragraphs:
                paragraph.alignment = align
                for run in paragraph.runs:
                    run.font.size = DocxPt(layout.get("font_size", 9))
                    run.font.color.rgb = header_text_rgb if row_index == 0 else rgb
    if layout.get("footer") or layout.get("page_numbers"):
        footer = section.footer.paragraphs[0]
        footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
        footer.add_run(layout.get("footer", ""))
        if layout.get("page_numbers"):
            from docx.oxml import OxmlElement
            from docx.oxml.ns import qn
            field = OxmlElement("w:fldSimple")
            field.set(qn("w:instr"), "PAGE")
            footer._p.append(field)
    document.save(path)


def _pptx(path: Path, title: str, columns: list[str], rows: list[list[Any]]) -> None:
    # A fixed page budget avoids silently clipping long data or generating huge decks.
    if any(len(value) > 50 for value in columns) or any(len(_text(value)) > 90 for row in rows for value in row):
        raise ValueError("slide_cell_too_long")
    groups = [columns[i:i + 5] for i in range(0, len(columns), 5)]
    row_pages = [rows[i:i + 8] for i in range(0, len(rows), 8)] or [[]]
    if len(groups) * len(row_pages) > 64:
        raise ValueError("slide_limit_exceeded")
    presentation = Presentation()
    presentation.slide_width = Inches(13.333)
    presentation.slide_height = Inches(7.5)
    for group_index, group in enumerate(groups):
        for page_index, page in enumerate(row_pages):
            slide = presentation.slides.add_slide(presentation.slide_layouts[6])
            heading = slide.shapes.add_textbox(Inches(.5), Inches(.25), Inches(12.3), Inches(.65))
            paragraph = heading.text_frame.paragraphs[0]
            paragraph.text = title
            paragraph.font.size = Pt(24)
            table = slide.shapes.add_table(len(page) + 1, len(group), Inches(.5), Inches(1.15),
                                           Inches(12.3), Inches(.48 * (len(page) + 1))).table
            for index, value in enumerate(group):
                table.cell(0, index).text = value
            for row_index, row in enumerate(page, 1):
                for col_index in range(len(group)):
                    table.cell(row_index, col_index).text = _text(row[group_index * 5 + col_index])
            for table_row in table.rows:
                for cell in table_row.cells:
                    for paragraph in cell.text_frame.paragraphs:
                        paragraph.font.size = Pt(12)
    presentation.save(path)


def render_document(kind: str, document: dict[str, Any], path: Path) -> dict[str, Any]:
    if kind not in FORMATS:
        raise ValueError("unsupported_format")
    title, columns, rows, orientation = validate_input(document)
    layout = validate_layout(document.get("layout"), columns)
    columns, rows = select_columns(columns, rows, layout)
    image_data = validate_image(document.get("image"))
    if kind == "pdf":
        _pdf(path, title, columns, rows, orientation, layout, image_data)
    elif kind == "docx":
        _docx(path, title, columns, rows, orientation, layout, image_data)
    elif kind == "xlsx":
        _xlsx(path, title, columns, rows, orientation, layout, image_data)
    else:
        _pptx(path, title, columns, rows)
    size = path.stat().st_size
    if size <= 0 or size > MAX_BYTES:
        raise ValueError("artifact_size_invalid")
    return {"row_count": len(rows), "column_count": len(columns), "size_bytes": size}
