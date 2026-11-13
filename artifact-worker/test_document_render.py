import tempfile
import unittest
import base64
import re
from io import BytesIO
from pathlib import Path

from docx import Document
from openpyxl import load_workbook
from PIL import Image
from pptx import Presentation

from document_render import render_document, validate_input


class DocumentRenderTests(unittest.TestCase):
    def test_formats_preserve_input_and_prevent_excel_formula_execution(self):
        sample = {"title": "รายงาน Test", "columns": ["Product", "Price"],
                  "rows": [["=HYPERLINK(\"https://invalid.test\")", 125], ["แหวน", 0]]}
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for fmt in ("pdf", "xlsx", "docx", "pptx"):
                path = root / ("report." + fmt)
                result = render_document(fmt, sample, path)
                self.assertEqual(result["row_count"], 2)
                self.assertGreater(path.stat().st_size, 0)
            workbook = load_workbook(root / "report.xlsx", data_only=False)
            self.assertEqual(workbook.active["A3"].data_type, "s")
            self.assertTrue(workbook.active["A3"].value.startswith("'="))
            self.assertEqual(workbook.active["B3"].value, 125)
            self.assertEqual(Document(root / "report.docx").tables[0].rows[2].cells[0].text, "แหวน")
            self.assertEqual(len(Presentation(root / "report.pptx").slides), 1)

    def test_rejects_malformed_and_unbounded_inputs(self):
        cases = [
            {"title": "x", "columns": ["a"], "rows": [[1, 2]]},
            {"title": "x", "columns": ["a"], "rows": [[float("nan")]]},
            {"title": "x", "columns": ["a"], "rows": [[{}]]},
            {"title": "x", "columns": ["a"], "rows": [["x" * 501]]},
            {"title": "x", "columns": ["a"], "rows": [], "path": "other"},
        ]
        for case in cases:
            with self.subTest(case=case), self.assertRaises(ValueError):
                validate_input(case)

    def test_validates_bounded_pdf_orientation(self):
        document = {"title": "PO", "columns": ["PO", "Product"],
                    "rows": [["PO-1", "Ring"]], "orientation": "portrait"}
        self.assertEqual(validate_input(document)[3], "portrait")
        document["orientation"] = "diagonal"
        with self.assertRaisesRegex(ValueError, "invalid_orientation"):
            validate_input(document)

    def test_revisions_apply_portrait_layout_columns_and_uploaded_image(self):
        buffer = BytesIO()
        Image.new("RGB", (24, 12), "teal").save(buffer, "PNG")
        sample = {"title": "PO report", "columns": ["PO", "Status", "Product"],
                  "rows": [["PO-1", "pending", "Ring"]], "orientation": "portrait",
                  "layout": {"paper_size": "a3", "title_size": 22, "font_size": 10,
                             "hidden_columns": ["Status"], "page_numbers": True,
                             "footer": "Review copy", "image_position": "center"},
                  "image": {"mime_type": "image/png", "base64": base64.b64encode(buffer.getvalue()).decode()}}
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for kind in ("pdf", "docx", "xlsx"):
                output = root / f"report.{kind}"
                result = render_document(kind, sample, output)
                self.assertEqual(result["column_count"], 2)
            match = re.search(rb"/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)", (root / "report.pdf").read_bytes())
            self.assertIsNotNone(match)
            self.assertGreater(float(match.group(2)), float(match.group(1)))
            document = Document(root / "report.docx")
            self.assertGreater(document.sections[0].page_height, document.sections[0].page_width)
            self.assertEqual(len(document.inline_shapes), 1)
            self.assertEqual(len(document.tables[0].columns), 2)
            sheet = load_workbook(root / "report.xlsx").active
            self.assertEqual(sheet.page_setup.orientation, "portrait")
            self.assertEqual(len(sheet._images), 1)
            self.assertEqual(sheet.max_column, 2)

    def test_image_validation_rejects_spoofed_format(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(ValueError, "invalid_image"):
                render_document("pdf", {"title": "x", "columns": ["a"], "rows": [["b"]],
                        "image": {"mime_type": "image/png", "base64": base64.b64encode(b"not an image").decode()}},
                    Path(folder) / "bad.pdf")

    def test_presentation_refuses_oversized_cells_without_truncating(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(ValueError, "slide_cell_too_long"):
                render_document("pptx", {"title": "x", "columns": ["a"],
                                         "rows": [["x" * 91]]}, Path(folder) / "x.pptx")


if __name__ == "__main__":
    unittest.main()
