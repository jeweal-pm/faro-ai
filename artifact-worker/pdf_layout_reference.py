"""FaroAI PDF layout primitives adapted from GIS print-template conventions.

This module contains layout only. It intentionally has no GIS branding,
template variables, or access to GIS data.
"""
from __future__ import annotations

from reportlab.lib import colors
from reportlab.platypus import TableStyle


RULE = colors.HexColor("#D9D9D9")
ALTERNATE_ROW = colors.HexColor("#F7F8F9")
ACCENT = colors.HexColor("#5CC7C1")


def table_style(row_count: int) -> TableStyle:
    """Return a compact, print-friendly table style with repeating header rules."""
    commands: list[tuple] = [
        ("LINEBELOW", (0, 0), (-1, 0), 0.8, colors.HexColor("#2A2A2A")),
        ("LINEABOVE", (0, 0), (-1, 0), 0.8, colors.HexColor("#2A2A2A")),
        ("LINEBELOW", (0, 1), (-1, -1), 0.35, RULE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]
    for row in range(2, row_count, 2):
        commands.append(("BACKGROUND", (0, row), (-1, row), ALTERNATE_ROW))
    return TableStyle(commands)
