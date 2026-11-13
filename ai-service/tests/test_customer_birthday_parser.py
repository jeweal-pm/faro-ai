import unittest
import uuid
from datetime import date
from unittest.mock import patch

from faroai import app as birthday_app


class CustomerBirthdayParserTests(unittest.TestCase):
    def test_every_english_month_name_and_common_abbreviation(self):
        month_prompts = {
            1: ["Show customers born in January", "Show customers born in Jan"],
            2: ["Show customers born in February", "Show customers born in feb", "Show customers born in FEB"],
            3: ["Show customers born in March", "Show customers born in Mar"],
            4: ["Show customers born in April", "Show customers born in Apr"],
            5: ["Show customers born in May"],
            6: ["Show customers born in June", "Show customers born in Jun"],
            7: ["Show customers born in July", "Show customers born in Jul"],
            8: ["Show customers born in August", "Show customers born in Aug"],
            9: ["Show customers born in September", "Show customers born in Sep", "Show customers born in Sept"],
            10: ["Show customers born in October", "Show customers born in Oct"],
            11: ["Show customers born in November", "Show customers born in Nov"],
            12: ["Show customers born in December", "Show customers born in Dec"],
        }
        for month, prompts in month_prompts.items():
            for prompt in prompts:
                with self.subTest(prompt=prompt):
                    self.assertEqual(birthday_app._parse_customer_birthday_prompt(prompt)["birthday_month"], month)

    def test_all_thai_months_and_abbreviations(self):
        prompts = {
            1: ["มกราคม", "ม.ค."], 2: ["กุมภาพันธ์", "ก.พ."],
            3: ["มีนาคม", "มี.ค."], 4: ["เมษายน", "เม.ย."],
            5: ["พฤษภาคม", "พ.ค."], 6: ["มิถุนายน", "มิ.ย."],
            7: ["กรกฎาคม", "ก.ค."], 8: ["สิงหาคม", "ส.ค."],
            9: ["กันยายน", "ก.ย."], 10: ["ตุลาคม", "ต.ค."],
            11: ["พฤศจิกายน", "พ.ย."], 12: ["ธันวาคม", "ธ.ค."],
        }
        for month, names in prompts.items():
            for name in names:
                prompt = f"Show birthdays in {name}"
                with self.subTest(prompt=prompt):
                    self.assertEqual(birthday_app._parse_customer_birthday_prompt(prompt)["birthday_month"], month)

    def test_month_day_word_orders_and_ordinal_suffixes(self):
        prompts = {
            "Who has a birthday on June 12?": (6, 12),
            "Who has a birthday on 12th June?": (6, 12),
            "Who has a birthday on June 12th?": (6, 12),
            "Who was born on 12 June?": (6, 12),
            "ลูกค้าคนไหนเกิดวันที่ 12 มิถุนายน": (6, 12),
            "Customers born 12 June?": (6, 12),
            "June 12 birthday customers.": (6, 12),
        }
        for prompt, expected in prompts.items():
            with self.subTest(prompt=prompt):
                parsed = birthday_app._parse_customer_birthday_prompt(prompt)
                self.assertEqual((parsed["birthday_month"], parsed["birthday_day"]), expected)

    def test_natural_customer_name_prompt_does_not_include_leading_phrase(self):
        parsed = birthday_app._parse_customer_birthday_prompt("I want to know Alex Morgan's birthday.")
        self.assertEqual(parsed["query"], "Alex Morgan")

    def test_numeric_day_first_and_iso_dates(self):
        prompts = {
            "List customers with birthdays on 12/06": (6, 12, None),
            "Can you check whose birthday is on 12/6?": (6, 12, None),
            "List customers with birthdays on 29/02": (2, 29, None),
            "Find customers born on 2020-02-29": (2, 29, 2020),
            "Find customers born on 12/06/1990": (6, 12, 1990),
        }
        for prompt, expected in prompts.items():
            with self.subTest(prompt=prompt):
                parsed = birthday_app._parse_customer_birthday_prompt(prompt)
                self.assertEqual((parsed["birthday_month"], parsed["birthday_day"], parsed.get("birth_year")), expected)
        casual = birthday_app._parse_customer_birthday_prompt("June 12 birthday customers.")
        self.assertEqual(casual["limit"], 100)

    def test_every_calendar_month_day_combination_parses(self):
        month_names = ["January", "February", "March", "April", "May", "June",
                       "July", "August", "September", "October", "November", "December"]
        for month in range(1, 13):
            for day in range(1, 32):
                try:
                    date(2000, month, day)
                except ValueError:
                    continue
                prompt = f"Who has a birthday on {day} {month_names[month - 1]}?"
                with self.subTest(prompt=prompt):
                    parsed = birthday_app._parse_customer_birthday_prompt(prompt)
                    self.assertEqual((parsed["birthday_month"], parsed["birthday_day"]), (month, day))

    def test_every_supported_gregorian_birth_year_parses(self):
        current_year = date.today().year
        for year in range(1800, current_year + 1):
            prompt = f"Show customers born in {year}"
            with self.subTest(year=year):
                self.assertEqual(birthday_app._parse_customer_birthday_prompt(prompt)["birth_year"], year)

    def test_calendar_rejects_impossible_dates_but_not_valid_empty_searches(self):
        for prompt in ("Who has a birthday on February 30?", "Who has a birthday on 31/04?"):
            with self.subTest(prompt=prompt), self.assertRaises(birthday_app.HTTPException) as caught:
                birthday_app._parse_customer_birthday_prompt(prompt)
            self.assertEqual(caught.exception.detail, "birthday_date_invalid")

    def test_year_variants_and_month_plus_year(self):
        prompts = {
            "Show customers born in 1990": {"birth_year": 1990},
            "Find customers born 1990": {"birth_year": 1990},
            "List customers with birth year 2000": {"birth_year": 2000},
            "Show customers born in June 1990": {"birthday_month": 6, "birth_year": 1990},
        }
        for prompt, expected in prompts.items():
            with self.subTest(prompt=prompt):
                parsed = birthday_app._parse_customer_birthday_prompt(prompt)
                for key, value in expected.items():
                    self.assertEqual(parsed[key], value)

    def test_relative_single_days_are_exact_birthday_dates(self):
        for prompt in ("Who has a birthday today?", "Who has a birthday tomorrow?", "Who had a birthday yesterday?"):
            with self.subTest(prompt=prompt):
                parsed = birthday_app._parse_customer_birthday_prompt(prompt)
                self.assertIn("birthday_month", parsed)
                self.assertIn("birthday_day", parsed)

    def test_count_wording_keeps_the_date_filter_and_can_use_gis_total(self):
        for prompt, expected in (
            ("How many customers have birthdays on June 12?", (6, 12)),
            ("How many customer birthdays are there today?", None),
        ):
            with self.subTest(prompt=prompt):
                parsed = birthday_app._parse_customer_birthday_prompt(prompt)
                if expected:
                    self.assertEqual((parsed["birthday_month"], parsed["birthday_day"]), expected)
                else:
                    self.assertIn("birthday_month", parsed)
                    self.assertIn("birthday_day", parsed)

    def test_current_month_is_supported_and_ranges_are_not_broadened(self):
        current_month = date.today().month
        parsed = birthday_app._parse_customer_birthday_prompt("Find customers celebrating birthdays in the current month.")
        self.assertEqual(parsed["birthday_month"], current_month)
        for prompt in (
            "Find customers born during the first week of June",
            "Show customers with birthdays between January and March",
            "List birthdays happening in the last three months of the year",
        ):
            with self.subTest(prompt=prompt), self.assertRaises(birthday_app.HTTPException) as caught:
                birthday_app._parse_customer_birthday_prompt(prompt)
            self.assertEqual(caught.exception.detail, "birthday_range_not_supported_yet")

    @patch.object(birthday_app, "call_approved_mcp_tool")
    @patch.object(birthday_app, "list_approved_mcp_tool_specs", return_value=[{"name": "search_customers"}])
    def test_zero_matches_are_successful_empty_results(self, _list_specs, call_tool):
        call_tool.return_value = {"success": True, "result": {"customers": [], "total": 0, "limit": 100, "offset": 0, "has_more": False}}
        connection = birthday_app.MCPConnectionConfig(
            source_id=uuid.uuid4(), integration_key="gis", name="test", endpoint_url="https://gis.example/mcp",
            api_key="test-only", allowed_tools=["search_customers"],
        )
        request = birthday_app.CustomerBirthdayLookupRequest(
            tenant_id=uuid.uuid4(), correlation_id="birthday-test-0001", message="Show customers born in FEB",
            mcp_connection=connection,
        )
        response = birthday_app.customer_birthday_lookup(request)
        self.assertTrue(response["success"])
        self.assertEqual(response["data"]["customers"], [])
        self.assertEqual(response["data"]["total"], 0)


if __name__ == "__main__":
    unittest.main()
