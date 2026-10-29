import json
import unittest
from types import SimpleNamespace

from faroai.mcp_products import (
    normalize_product_records,
    parse_mcp_product_result,
    remove_excluded_stone_shapes,
)


class MCPProductResultTests(unittest.TestCase):
    def test_parses_json_text_and_maps_product_fields(self):
        result = SimpleNamespace(content=[SimpleNamespace(
            type="text",
            text=json.dumps({"products": [{
                "id": "necklace-1", "name": "Gold necklace", "sku": "N-1",
                "product_type": "Necklace", "price": "125.50", "currency": "usd",
                "stone_shape": "oval",
                "availability": True, "image_url": "https://cdn.example.com/n.jpg",
                "product_url": "https://shop.example.com/n", "summary": "18k gold",
            }]}),
        )], structuredContent=None, isError=False)

        products, valid = parse_mcp_product_result(result)

        self.assertTrue(valid)
        self.assertEqual(len(products), 1)
        self.assertEqual(products[0]["price"], 125.5)
        self.assertEqual(products[0]["currency"], "USD")
        self.assertEqual(products[0]["productType"], "Necklace")
        self.assertEqual(products[0]["stoneShape"], "oval")
        self.assertEqual(products[0]["url"], "https://shop.example.com/n")

    def test_structured_empty_result_is_a_valid_no_match(self):
        result = SimpleNamespace(content=[], structuredContent={"products": []}, isError=False)
        self.assertEqual(parse_mcp_product_result(result), ([], True))

    def test_rejects_wrong_envelope_and_oversized_structured_payload(self):
        wrong_shape = SimpleNamespace(content=[], structuredContent={"results": []}, isError=False)
        oversized = SimpleNamespace(content=[], structuredContent={"products": [{"id": "x", "name": "y", "extra": "a" * 24_000}]}, isError=False)
        self.assertEqual(parse_mcp_product_result(wrong_shape), ([], False))
        self.assertEqual(parse_mcp_product_result(oversized), ([], False))

    def test_discards_invalid_records_urls_prices_and_duplicate_ids(self):
        products = normalize_product_records({"products": [
            {"id": "good", "name": "Ring", "price": 10, "currency": "USD", "image_url": "http://cdn.example.com/a"},
            {"id": "good", "name": "Duplicate"},
            {"id": "missing-name"},
            {"id": "bad-price", "name": "Pendant", "price": float("inf"), "currency": "USD", "product_url": "https://127.0.0.1/item"},
        ]})

        self.assertEqual([item["id"] for item in products], ["good", "bad-price"])
        self.assertIsNone(products[0]["image"])
        self.assertIsNone(products[1]["price"])
        self.assertIsNone(products[1]["url"])

    def test_caps_products_and_rejects_unrecognized_or_oversized_text(self):
        items = [{"id": str(index), "name": "Item"} for index in range(20)]
        self.assertEqual(len(normalize_product_records({"products": items})), 10)

    def test_shape_exclusions_remove_named_round_cut_products_and_keep_alternatives(self):
        products = normalize_product_records({"products": [
            {"id": "round", "name": "Aura round-cut diamond ring"},
            {"id": "oval", "name": "Oval diamond ring", "stone_shape": "oval"},
            {"id": "summary-round", "name": "Diamond ring", "summary": "Round cut center stone"},
            {"id": "princess", "name": "Princess ring", "stone_shape": "princess"},
        ]})

        filtered = remove_excluded_stone_shapes(products, ["round"])

        self.assertEqual([item["id"] for item in filtered], ["oval", "princess"])

        large = SimpleNamespace(content=[SimpleNamespace(type="text", text=" " * 24_001)], structuredContent=None)
        self.assertEqual(parse_mcp_product_result(large), ([], False))


if __name__ == "__main__":
    unittest.main()
