import unittest

from faroai.skill_analysis import analyze_loaded_purchase_orders


class SkillAnalysisTests(unittest.TestCase):
    def setUp(self):
        self.orders = [
            {"line_count": 2, "lines": [
                {"quantity": 2, "unit_price": 100, "line_total": 200},
                {"quantity": 1, "unit_price": 150, "line_total": 150},
            ]},
            {"line_count": 1, "lines": [{"quantity": 3, "unit_price": None, "line_total": 300}]},
        ]

    def test_calculations_use_verified_values_and_ignore_nulls(self):
        self.assertIn("Sum line amount: 650", analyze_loaded_purchase_orders("sum", "line_total", "en", self.orders)["answer"])
        self.assertIn("Average unit price: 125", analyze_loaded_purchase_orders("average", "unit_price", "en", self.orders)["answer"])

    def test_counts_current_loaded_lines_and_orders(self):
        self.assertIn("3 line items", analyze_loaded_purchase_orders("count_lines", "line_total", "en", self.orders)["answer"])
        self.assertIn("2 purchase orders", analyze_loaded_purchase_orders("count_orders", "line_total", "en", self.orders)["answer"])

    def test_thai_output_reports_partial_order_lines(self):
        result = analyze_loaded_purchase_orders("sum", "quantity", "th", [
            {"line_count": 2, "lines": [{"quantity": 2, "unit_price": 10, "line_total": 20}]},
        ])
        self.assertIn("ผลรวม จำนวน: 2", result["answer"])
        self.assertIn("บรรทัดไม่ครบ", result["answer"])

    def test_missing_numeric_values_are_reported_as_partial(self):
        result = analyze_loaded_purchase_orders("sum", "unit_price", "en", self.orders)
        self.assertTrue(result["partial"])
        self.assertIn("lack a verified numeric value", result["answer"])

    def test_rejects_data_beyond_fixed_limits(self):
        with self.assertRaisesRegex(ValueError, "invalid_analysis_orders"):
            analyze_loaded_purchase_orders("sum", "quantity", "en", [])
        too_many = [{"line_count": 501, "lines": [{"quantity": 1, "unit_price": 1, "line_total": 1}] * 501}]
        with self.assertRaisesRegex(ValueError, "analysis_row_limit_exceeded"):
            analyze_loaded_purchase_orders("sum", "quantity", "en", too_many)


if __name__ == "__main__":
    unittest.main()
