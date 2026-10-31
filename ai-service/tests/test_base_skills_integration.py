import hashlib
import hmac
import json
import os
import time
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from faroai.app import (ChatRequest, GenerateProductDraftsRequest,
                        ModelConfig, ProcurementAssistantRequest, _is_inventory_receive_request,
                        _is_po_creation_request,
                        _is_read_only_po_lookup, _is_supplier_setup_request, _is_voucher_setup_request,
                        _prepare_voucher_confirmation, _procurement_history, _procurement_tool_allowed_for_request, _procurement_tool_result,
                        _required_procurement_read_tools, app, chat, deterministic_answer,
                        generate_product_drafts, procurement_assistant)
from faroai.base_skills import eligible_chat_skill
from faroai.routing import _route_from_jev


class DecisionResponse:
    def __init__(self, skill_id):
        self.skill_id = skill_id
        self.request = None

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def post(self, _url, *, headers, json):
        self.request = json
        return self

    def raise_for_status(self):
        return None

    def json(self):
        return {"answers": {
            "intent": {"choice": "product"},
            "mcp_route": {"choice": "gis-source:search_products"},
            "candidate": {"choice": "none"},
            "base_skill": {"choice": self.skill_id},
        }}


class BaseSkillsIntegrationTests(unittest.TestCase):
    def test_catalog_creation_loads_approved_base_skill_without_writing_gis(self):
        candidate = ModelConfig(candidate_id='00000000-0000-4000-8000-000000000002',
                                provider='openrouter', base_url='https://openrouter.ai/api/v1',
                                model='test/paid-model')
        request = GenerateProductDraftsRequest(
            tenant_id='00000000-0000-4000-8000-000000000001', correlation_id='catalog-skill-test',
            prompt='Create a dramatic ring concept', count=1, provider_candidates=[candidate],
        )
        description = ' '.join(['A richly imagined jewelry concept with distinct silhouette and styling intent.'] * 5)
        draft = {'name': 'A Distinctive Celestial Ring Design in Sculpted Silver', 'Matatag': 'Celestial',
                 'Description': description, 'product_tags': 'ring, celestial', 'item_hint': 'ring', 'stone_hint': None}

        class Response:
            def raise_for_status(self):
                return None

            def json(self):
                return {'choices': [{'message': {'content': json.dumps(draft)}}],
                        'usage': {'completion_tokens': 100}}

        class Client:
            payload = None

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def post(self, _url, *, headers, json):
                self.payload = json
                return Response()

        fake_client = Client()
        with patch('faroai.app.choose_product_generation_model', return_value=candidate.candidate_id), \
             patch('faroai.app.httpx.Client', return_value=fake_client):
            result = generate_product_drafts(request)

        self.assertEqual(result['base_skill']['id'], 'base.catalog-create')
        self.assertEqual(len(result['drafts']), 1)
        self.assertIn('<approved_base_skill>', fake_client.payload['messages'][0]['content'])
        self.assertEqual(result['drafts'][0]['status'], '0')

    def test_inventory_receive_route_loads_safe_instructions_without_mutating_gis(self):
        candidate = ModelConfig(candidate_id='00000000-0000-4000-8000-000000000003',
                                provider='openrouter', base_url='https://openrouter.ai/api/v1',
                                model='test/paid-model')
        request = ProcurementAssistantRequest(
            tenant_id='00000000-0000-4000-8000-000000000001', correlation_id='receive-skill-test',
            actor_email='tester@example.invalid',
            mcp_connection={'source_id':'00000000-0000-4000-8000-000000000004', 'name':'GIS',
                            'endpoint_url':'https://gis.example.test/mcp', 'api_key':'test-only',
                            'allowed_tools':['get_purchase_order']},
            message='Receive inventory for approved PO PO-32', provider_candidates=[candidate],
        )

        class Response:
            def raise_for_status(self):
                return None

            def json(self):
                return {'choices': [{'message': {'content': 'I need the receipt quantity before preparing a preview.'}}]}

        class Client:
            payload = None

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def post(self, _url, *, headers, json):
                self.payload = json
                return Response()

        fake_client = Client()
        with patch('faroai.app.list_approved_mcp_tool_specs', return_value=[]), \
             patch('faroai.app.choose_procurement_model', return_value=candidate.candidate_id), \
             patch('faroai.app.httpx.Client', return_value=fake_client):
            result = procurement_assistant(request)

        self.assertTrue(_is_inventory_receive_request(request.message))
        self.assertEqual(result['base_skill']['id'], 'base.inventory-receive')
        self.assertIn('GIS must report it approved', fake_client.payload['messages'][0]['content'])
        self.assertIsNone(result['pending_action'])

    def test_po_create_route_loads_generic_skill_and_waits_without_preview_or_write(self):
        candidate = ModelConfig(candidate_id='00000000-0000-4000-8000-000000000005',
                                provider='openrouter', base_url='https://openrouter.ai/api/v1',
                                model='test/paid-model')
        request = ProcurementAssistantRequest(
            tenant_id='00000000-0000-4000-8000-000000000001', correlation_id='po-create-skill-test',
            actor_email='tester@example.invalid',
            mcp_connection={'source_id':'00000000-0000-4000-8000-000000000004', 'name':'GIS',
                            'endpoint_url':'https://gis.example.test/mcp', 'api_key':'test-only',
                            'allowed_tools':['get_product_master_data', 'search_po_products',
                                             'preview_purchase_order', 'create_purchase_order']},
            message='Create a purchase order for 5 rings', provider_candidates=[candidate],
        )

        class Response:
            def raise_for_status(self):
                return None

            def json(self):
                return {'choices': [{'message': {'content': 'Which GIS supplier and location should I use?'}}]}

        class Client:
            payload = None

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def post(self, _url, *, headers, json):
                self.payload = json
                return Response()

        fake_client = Client()
        with patch('faroai.app.list_approved_mcp_tool_specs', return_value=[
                 {'name': name, 'description': name, 'input_schema': {'type': 'object', 'properties': {}}}
                 for name in request.mcp_connection.allowed_tools]), \
             patch('faroai.app._procurement_tool_result', return_value={
                 'success': True, 'result': {'masters': {'supplier': [], 'location': [], 'purchase_voucher': []}}
             }) as gis_call, \
             patch('faroai.app.choose_procurement_model', return_value=candidate.candidate_id), \
             patch('faroai.app.httpx.Client', return_value=fake_client):
            result = procurement_assistant(request)

        self.assertEqual(result['base_skill']['id'], 'base.po-create')
        self.assertIn('Never use test supplier', fake_client.payload['messages'][0]['content'])
        self.assertIsNone(result['pending_action'])
        self.assertEqual(gis_call.call_count, 1)
        self.assertEqual(gis_call.call_args.args[2], 'get_product_master_data')

    def test_po_read_lookup_requires_only_read_tools(self):
        prompt = "Show Ham's pending POs with item details."
        required = _required_procurement_read_tools(prompt)
        self.assertTrue(_is_read_only_po_lookup(prompt))
        self.assertEqual(required, {"get_product_master_data", "search_purchase_orders", "get_purchase_order"})
        self.assertNotIn("create_purchase_order", required)
        self.assertNotIn("receive_inventory", required)

    def test_po_write_or_receive_prompt_is_not_misclassified_as_read_only(self):
        self.assertFalse(_is_read_only_po_lookup("Create a PO for five rings"))
        self.assertFalse(_is_read_only_po_lookup("Receive the approved PO into inventory"))
        self.assertEqual(_required_procurement_read_tools("Create a PO for five rings"), set())

    def test_po_voucher_setup_requires_gis_location_and_voucher_tools(self):
        prompt = "Create a voucher for PO at Central World"
        self.assertTrue(_is_voucher_setup_request(prompt))
        self.assertFalse(_is_po_creation_request(prompt))
        self.assertEqual(_required_procurement_read_tools(prompt), {
            "get_product_master_data", "search_locations", "get_location", "create_voucher_type",
        })
        self.assertFalse(_is_voucher_setup_request("Create a PO for five rings"))
        explicit_prompt = "Create one active Purchase Order voucher for Central World"
        self.assertTrue(_is_voucher_setup_request(explicit_prompt))
        self.assertFalse(_is_po_creation_request(explicit_prompt))

    def test_po_creation_prompt_is_not_misclassified_as_voucher_setup(self):
        prompt = "Create a PO for 5 rings, model ABC"
        self.assertTrue(_is_po_creation_request(prompt))
        self.assertFalse(_is_voucher_setup_request(prompt))

    def test_voucher_create_tool_is_admitted_only_for_voucher_setup(self):
        self.assertTrue(_procurement_tool_allowed_for_request("create_voucher_type", True))
        self.assertFalse(_procurement_tool_allowed_for_request("create_voucher_type", False))
        self.assertTrue(_procurement_tool_allowed_for_request("search_purchase_orders", False))

    def test_voucher_tool_calls_survive_history_sanitization(self):
        history = [
            {"role": "assistant", "content": None, "tool_calls": [{"id": "c1", "type": "function",
             "function": {"name": "create_voucher_type", "arguments": "{}"}}]},
            {"role": "tool", "tool_call_id": "c1", "name": "create_voucher_type", "content": "staged"},
        ]
        cleaned = _procurement_history(history)
        self.assertEqual(len(cleaned), 2)
        self.assertEqual(cleaned[1]["name"], "create_voucher_type")

    def test_supplier_setup_request_is_classified_separately(self):
        self.assertTrue(_is_supplier_setup_request("Create 10 new suppliers"))
        self.assertTrue(_is_supplier_setup_request("สร้างผู้ขาย 10 ราย"))
        self.assertFalse(_is_supplier_setup_request("Create a purchase order for one item"))

    def test_voucher_mutation_is_staged_with_live_location_and_duplicate_checks(self):
        location_id = "6ae45335176b5da84aae1eb4"
        connection = {"allowed_tools": ["search_locations", "get_product_master_data"]}
        args = {
            "name": "Central World Purchase Order", "code": "CTW-PO-AI", "group": "Purchase order",
            "location_ids": [location_id], "conf_prefix": "PO-2026-", "conf_startno": "1",
            "width_start_number": "4", "prefill_with_zero": "1", "status": "1",
        }
        specs = [{"name": "create_voucher_type", "input_schema": {"properties": {
            "name": {}, "code": {}, "group": {"enum": ["Purchase order"]}, "location_ids": {},
            "conf_prefix": {}, "conf_startno": {}, "width_start_number": {},
            "prefill_with_zero": {}, "status": {},
        }}}]
        read_results = [
            {"success": True, "result": {"locations": [{"id": location_id, "name": "Central World", "code": "CTW", "Status": "1", "is_delete": 0}]}},
            {"success": True, "result": {"masters": {"purchase_voucher": []}}},
        ]
        with patch("faroai.app.call_approved_mcp_tool", side_effect=read_results) as mcp_call:
            pending, tool_result = _prepare_voucher_confirmation(
                "tenant", connection, args, specs,
                "Create one active Purchase Order voucher with PO-2026-#### numbering.",
            )

        self.assertEqual(pending["kind"], "create_voucher_type")
        self.assertEqual(pending["arguments"]["name"], "Central World Purchase Order (AI)")
        self.assertEqual(pending["arguments"]["conf_prefix"], "PO-2026-")
        self.assertEqual(pending["arguments"]["conf_startno"], "1")
        self.assertEqual(pending["arguments"]["width_start_number"], "4")
        self.assertEqual(pending["preview"]["voucher_type"]["locations"], [{"name": "Central World", "code": "CTW"}])
        self.assertTrue(tool_result["result"]["preview_prepared"])
        self.assertEqual([call.args[2] for call in mcp_call.call_args_list], ["search_locations", "get_product_master_data"])

    def test_procurement_adapter_never_executes_voucher_or_po_mutations_directly(self):
        for tool in ("create_purchase_order", "receive_inventory", "create_voucher_type"):
            with self.subTest(tool=tool), patch("faroai.app.call_approved_mcp_tool") as execute:
                result = _procurement_tool_result("tenant", {"allowed_tools": [tool]}, tool, {})
            self.assertFalse(result["success"])
            self.assertEqual(result["error"], "confirmation_required_in_faroai")
            execute.assert_not_called()

    def test_supplier_creation_prompt_reports_read_only_mcp_without_ai_write(self):
        candidate = ModelConfig(candidate_id='00000000-0000-4000-8000-000000000005',
                                provider='openrouter', base_url='https://openrouter.ai/api/v1',
                                model='test/paid-model')
        request = ProcurementAssistantRequest(
            tenant_id='00000000-0000-4000-8000-000000000001', correlation_id='supplier-setup-readonly-test',
            actor_email='tester@example.invalid',
            mcp_connection={'source_id':'00000000-0000-4000-8000-000000000004', 'name':'GIS',
                            'endpoint_url':'https://gis.example.test/mcp', 'api_key':'test-only',
                            'allowed_tools':['get_product_master_data']},
            message='Create 10 new suppliers', provider_candidates=[candidate],
        )
        with patch('faroai.app.list_approved_mcp_tool_specs', return_value=[{'name': 'get_product_master_data'}]), \
             patch('faroai.app._procurement_tool_result', return_value={
                 'success': True, 'result': {'masters': {'supplier': [{'name': 'Existing Supplier'}]}}
             }) as gis_call, \
             patch('faroai.app.choose_procurement_model') as model_call:
            result = procurement_assistant(request)

        self.assertFalse(result['model_used'])
        self.assertIsNone(result['pending_action'])
        self.assertIn('no supplier create or activate operation', result['answer'])
        self.assertEqual(gis_call.call_count, 1)
        self.assertEqual(gis_call.call_args.args[2], 'get_product_master_data')
        model_call.assert_not_called()

    def test_unrelated_knowledge_is_not_returned_as_a_verified_answer(self):
        answer = deterministic_answer([], [{'text': 'Unrelated product description'}], 'en')
        self.assertNotIn('Unrelated product description', answer)
        self.assertIn('could not find', answer.lower())

    def test_jev_selection_uses_same_decision_and_only_ready_read_skills(self):
        response = DecisionResponse("base.jewelry-search")
        sources = [{"id": "gis-source", "name": "GIS", "allowed_tools": ["search_products"]}]
        with patch("faroai.routing.httpx.Client", return_value=response):
            route = _route_from_jev("tenant", "ring", sources, [], "test-key")
        self.assertIsNotNone(route)
        self.assertEqual(eligible_chat_skill(route), "base.jewelry-search")
        choices = response.request["questions"]["base_skill"]["criteria"]
        self.assertIn("base.knowledge-answer", choices)
        self.assertNotIn("base.xlsx", choices)
        self.assertNotIn("base.po-create", choices)
        self.assertEqual(route["tool"], "search_products")

    def test_unapproved_jev_skill_does_not_activate(self):
        response = DecisionResponse("base.po-create")
        sources = [{"id": "gis-source", "name": "GIS", "allowed_tools": ["search_products"]}]
        with patch("faroai.routing.httpx.Client", return_value=response):
            route = _route_from_jev("tenant", "ring", sources, [], "test-key")
        self.assertIsNone(eligible_chat_skill(route))

    def test_internal_catalog_requires_signature_and_is_shared(self):
        client = TestClient(app)
        self.assertEqual(client.post('/internal/v1/skills/catalog', content=b'{}').status_code, 401)
        timestamp = str(int(time.time()))
        body = b'{}'
        secret = os.environ['FAROAI_INTERNAL_SECRET'].encode()
        signature = hmac.new(secret, timestamp.encode() + b'.' + body, hashlib.sha256).hexdigest()
        headers = {'x-faroai-timestamp': timestamp, 'x-faroai-signature': signature,
                   'content-type': 'application/json'}
        first = client.post('/internal/v1/skills/catalog', content=body, headers=headers)
        second = client.post('/internal/v1/skills/catalog', content=body, headers=headers)
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.json(), second.json())
        self.assertEqual(len(first.json()['skills']), 11)
        self.assertEqual(next(x for x in first.json()['skills'] if x['id'] == 'base.xlsx')['status'], 'planned')
        self.assertNotIn('instructions', json.dumps(first.json()))

    def test_chat_activates_only_a_skill_matching_the_actual_product_route(self):
        request = ChatRequest(tenant_id='00000000-0000-4000-8000-000000000001',
                              correlation_id='request-123', consent={}, message='ring')
        product = {'id': 'product-1', 'sku': 'SKU-1', 'name': 'Ring', 'productType': 'ring',
                   'currency': 'USD', 'price': 10, 'summary': 'Verified', 'path': None}
        route = {'intent': 'product', 'source_id': None, 'tool': None,
                 'candidate_id': None, 'skill_id': 'base.jewelry-search', 'decision_used': True}
        with patch('faroai.app.available_mcp_sources', return_value=[]), \
             patch('faroai.app.choose_route', return_value=route), \
             patch('faroai.app.search_products', return_value=([product], 1)), \
             patch('faroai.app.build_answer', return_value=('Found', False)) as answer:
            result = chat(request)
        self.assertEqual(result['base_skill']['id'], 'base.jewelry-search')
        self.assertIn('authorized catalog', answer.call_args.args[-1])

        route['skill_id'] = 'base.knowledge-answer'
        with patch('faroai.app.available_mcp_sources', return_value=[]), \
             patch('faroai.app.choose_route', return_value=route), \
             patch('faroai.app.search_products', return_value=([product], 1)), \
             patch('faroai.app.build_answer', return_value=('Found', False)) as answer:
            result = chat(request)
        self.assertIsNone(result['base_skill'])
        self.assertEqual(answer.call_args.args[-1], '')


if __name__ == '__main__':
    unittest.main()
