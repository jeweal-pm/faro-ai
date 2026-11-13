import unittest
from types import SimpleNamespace
from unittest.mock import patch

import httpx

from faroai import routing


class McpSearchRetryTests(unittest.TestCase):
    def setUp(self):
        self.source = {
            "id": "gis-test",
            "endpoint_url": "https://gis.example.test/mcp",
            "api_key": "test-key",
            "auth_method": "x-api-key",
            "allowed_tools": ["search_products"],
        }
        self.valid_result = SimpleNamespace(
            isError=False,
            structuredContent={
                "products": [{"id": "product-1", "name": "Emerald Pendant", "sku": "P-1"}],
                "applied_filters": {},
                "unmatched_filters": [],
            },
            content=[],
        )

    def test_read_only_product_search_retries_once_after_connection_failure(self):
        with patch.object(routing, "validate_mcp_endpoint"), \
             patch.object(routing, "_call_streamable_mcp", side_effect=[
                 httpx.ConnectError("temporary connection reset"),
                 (self.valid_result, {"item"}),
             ]) as call_mcp, \
             patch.object(routing.time, "sleep") as sleep:
            result = routing.call_live_tool(
                "tenant-test", self.source, "search_products", "pendant", "en", {"item": "Pendant"}
            )

        self.assertTrue(result["success"])
        self.assertTrue(result["products_valid"])
        self.assertEqual(len(result["products"]), 1)
        self.assertEqual(call_mcp.call_count, 2)
        sleep.assert_called_once_with(0.2)

    def test_mcp_tool_error_is_not_retried(self):
        tool_error = SimpleNamespace(isError=True, structuredContent=None, content=[])
        with patch.object(routing, "validate_mcp_endpoint"), \
             patch.object(routing, "_call_streamable_mcp", return_value=(tool_error, set())) as call_mcp, \
             patch.object(routing.time, "sleep") as sleep:
            result = routing.call_live_tool(
                "tenant-test", self.source, "search_products", "pendant", "en", {"item": "Pendant"}
            )

        self.assertFalse(result["success"])
        self.assertFalse(result["products_valid"])
        call_mcp.assert_called_once()
        sleep.assert_not_called()

    def test_non_search_tool_is_not_retried(self):
        source = {**self.source, "allowed_tools": ["get_inventory_stock"]}
        with patch.object(routing, "validate_mcp_endpoint"), \
             patch.object(routing, "_call_streamable_mcp", side_effect=httpx.ConnectError("offline")) as call_mcp, \
             patch.object(routing.time, "sleep") as sleep:
            result = routing.call_live_tool(
                "tenant-test", source, "get_inventory_stock", "", "en"
            )

        self.assertFalse(result["success"])
        call_mcp.assert_called_once()
        sleep.assert_not_called()


if __name__ == "__main__":
    unittest.main()
