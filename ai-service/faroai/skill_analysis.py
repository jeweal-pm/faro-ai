"""Fixed calculations for verified, already-loaded procurement result tables."""
from __future__ import annotations

import math
from typing import Any


def analyze_loaded_purchase_orders(
    operation: str, field: str, language: str, orders: list[dict[str, Any]],
) -> dict[str, Any]:
    if operation not in {"count_lines", "count_orders", "sum", "average", "minimum", "maximum"}:
        raise ValueError("unsupported_analysis_operation")
    if field not in {"quantity", "unit_price", "line_total"} or language not in {"th", "en"}:
        raise ValueError("unsupported_analysis_field")
    if not 1 <= len(orders) <= 10:
        raise ValueError("invalid_analysis_orders")
    lines = [line for order in orders for line in order.get("lines", [])]
    if len(lines) > 500:
        raise ValueError("analysis_row_limit_exceeded")
    incomplete = any(int(order.get("line_count", 0)) > len(order.get("lines", [])) for order in orders)
    thai = language == "th"

    if operation == "count_orders":
        answer = f"มี {len(orders)} ใบสั่งซื้อในผลลัพธ์ที่แสดง" if thai else f"{len(orders)} purchase orders are in the displayed results."
    elif operation == "count_lines":
        note = " (บาง PO มีบรรทัดที่ยังไม่ได้โหลด)" if thai and incomplete else " (some PO lines were not loaded)" if incomplete else ""
        answer = f"มี {len(lines)} บรรทัดสินค้าในข้อมูลที่โหลด{note}" if thai else f"{len(lines)} line items are in the loaded data{note}."
    else:
        values = [line.get(field) for line in lines]
        values = [float(value) for value in values if isinstance(value, (int, float)) and math.isfinite(value)]
        if not values:
            label = {"quantity": "จำนวน", "unit_price": "ราคาต่อหน่วย", "line_total": "ยอดต่อรายการ"}[field] if thai else {"quantity": "quantity", "unit_price": "unit price", "line_total": "line amount"}[field]
            answer = f"ไม่มีข้อมูล {label} ที่ตรวจสอบได้ในรายการที่โหลด" if thai else f"No verified {label} values are available in the loaded lines."
        else:
            result = {
                "sum": lambda: sum(values),
                "average": lambda: sum(values) / len(values),
                "minimum": lambda: min(values),
                "maximum": lambda: max(values),
            }[operation]()
            field_label = {"quantity": "จำนวน", "unit_price": "ราคาต่อหน่วย", "line_total": "ยอดต่อรายการ"}[field] if thai else {"quantity": "quantity", "unit_price": "unit price", "line_total": "line amount"}[field]
            operation_label = {"sum": "ผลรวม", "average": "ค่าเฉลี่ย", "minimum": "ค่าต่ำสุด", "maximum": "ค่าสูงสุด"}[operation] if thai else operation
            value_text = f"{result:,.2f}".rstrip("0").rstrip(".")
            missing_values = len(values) < len(lines)
            partial = incomplete or missing_values
            notes = []
            if incomplete:
                notes.append("ยังมี PO บางส่วนที่โหลดบรรทัดไม่ครบ" if thai else "some PO lines were not loaded")
            if missing_values:
                notes.append("มีบรรทัดที่ไม่มีค่าตัวเลขที่ใช้คำนวณ" if thai else "some loaded lines lack a verified numeric value")
            incomplete_note = f" ({'; '.join(notes)})" if notes else ""
            scope = f"คำนวณจาก {len(values)} บรรทัดที่มีข้อมูล{incomplete_note}" if thai else f"Calculated from {len(values)} lines with verified values{incomplete_note}."
            answer = f"{operation_label} {field_label}: {value_text} ({scope})" if thai else f"{operation_label.capitalize()} {field_label}: {value_text}. {scope}"

    if operation in {"count_lines", "sum", "average", "minimum", "maximum"}:
        values_missing = operation != "count_lines" and len([line.get(field) for line in lines if isinstance(line.get(field), (int, float)) and math.isfinite(line.get(field))]) < len(lines)
        partial = incomplete or values_missing
    else:
        partial = False
    return {"success": True, "base_skill_id": "base.data-analysis", "answer": answer,
            "orders_used": len(orders), "lines_used": len(lines), "partial": partial}
