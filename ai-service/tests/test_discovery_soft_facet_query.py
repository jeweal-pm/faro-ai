import unittest

from faroai.app import _discovery_candidate_query


class DiscoverySoftFacetQueryTests(unittest.TestCase):
    def test_soft_only_occasion_browses_candidates_for_ranking(self):
        query = _discovery_candidate_query(
            "Find jewelry for a birthday.",
            "birthday jewelry gift",
            {"Occasion": "Birthday"},
            {},
        )

        self.assertEqual(query, "jewelry")

    def test_soft_preferences_keep_catalog_query_when_hard_filter_exists(self):
        query = _discovery_candidate_query(
            "Find a necklace for a birthday.",
            "necklace birthday gift",
            {"Occasion": "Birthday", "Jewelry Type": "Necklace"},
            {"item": "Necklace"},
        )

        self.assertEqual(query, "Find a necklace for a birthday.")

    def test_unfaceted_search_keeps_jevs_query(self):
        query = _discovery_candidate_query(
            "I need a ring.",
            "ring",
            {},
            {"item": "Ring"},
        )

        self.assertEqual(query, "ring")

    def test_soft_facet_does_not_broaden_a_price_filter(self):
        query = _discovery_candidate_query(
            "Find jewelry for a birthday within a budget of $500–$1,500.",
            "birthday jewelry",
            {"Occasion": "Birthday", "Budget": "$500–$1,500"},
            {"price": {"min": 500, "max": 1500, "currency": "USD"}},
        )

        self.assertEqual(query, "Find jewelry for a birthday within a budget of $500–$1,500.")


if __name__ == "__main__":
    unittest.main()
