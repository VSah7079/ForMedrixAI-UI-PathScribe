# functions/test_main.py
# ─────────────────────────────────────────────────────────────────────────────
# Real, per direct guidance ("Local Testing & Verification... verify both:
# Default/Explicit PDF payload generation... outputFormat: 'text' returning
# expected narrative string format" — and, for receive_interface_message,
# "we can setup just the receiving end for now and look to see that the
# json packages coming out of PS are correct"). No pre-existing test
# infrastructure in this repo (only third-party test utilities under
# venv/) — plain assertions, run directly via `python test_main.py`, no
# new test-framework dependency added for this, matching the repo's own
# minimal requirements.txt.
#
# receive_interface_message's own real Firestore write is the one real
# thing this file can't verify end-to-end — this sandbox's network
# doesn't allow downloading the real Firestore emulator binary
# (storage.googleapis.com isn't on the allowed egress list). Its own
# firestore.client() call is swapped for a small, real, in-file fake
# (see _FakeFirestoreClient/_FailingFirestoreClient below) — everything
# this function actually controls (envelope validation, request/response
# handling, both success and failure paths) is tested for real, without
# any mock, exactly like every render_report test above.
#
# Run: python test_main.py   (needs the same real deps as main.py itself —
# see requirements.txt — installed into whatever environment runs this)
# ─────────────────────────────────────────────────────────────────────────────

import json
import sys

import main
from firebase_functions import https_fn
from flask import Flask

# Real, needed only for the HTTP-entrypoint tests below: the
# @https_fn.on_request decorator's own CORS handling (flask_cors) reads
# both current_app.config and the live flask.request proxy, which need a
# real Flask app/request context — normally provided by functions-framework's
# own real server. This app is purely test scaffolding, never part of
# main.py or its real runtime behavior.
_test_app = Flask(__name__)
_test_app.app_context().push()

PASS_COUNT = 0


def check(condition: bool, description: str):
    global PASS_COUNT
    if not condition:
        print(f"FAILED: {description}")
        sys.exit(1)
    PASS_COUNT += 1
    print(f"  ok — {description}")


# ── Realistic payload covering every real node_type both renderers handle ──
PAYLOAD = {
    "templateName": "Skin Punch Biopsy",
    "resolvedBy": "template-matcher",
    "institution": {
        "name": "PathScribe General Hospital",
        "dept": "Department of Pathology",
        "address": "123 Main St, Springfield, USA",
    },
    "caseHeader": {
        "accession": "S26-1001-BX-001", "patient": "Jane Doe", "mrn": "MRN-12345",
        "dob": "1980-01-01", "referring": "Dr. Smith", "clinician": "Dr. Jones",
    },
    "renderScope": {
        "patient": {"age": 45, "sex": "F"},
        "specimen": {"laterality": "left"},
        "specimens": [{"label": "A1 - Left arm"}, {"label": "A2 - Right leg"}],
    },
    "synopticAnswers": [
        {"fieldId": "f1", "fieldLabel": "Tumor Size", "displayValue": "2.3 cm"},
        {"fieldId": "f2", "fieldLabel": "Margins", "displayValue": "Clear"},
    ],
    "sections": [
        {"id": "sec-diag", "label": "Diagnosis",
         "text": "<p>Basal cell carcinoma, <b>nodular type</b>.</p><p>Margins clear.</p>",
         "committed": True, "userEdited": True, "aiGenerated": False, "required": True},
    ],
    "bodyAssembly": [
        {"slotId": "slot-1", "partId": "part-1", "partName": "Clinical", "order": 1, "nodes": [
            {"type": "static-label", "text": "CLINICAL HISTORY", "variant": "h2", "bold": True},
            {"type": "expression-value", "label": "Age", "template": "{{patient.age}}", "labelConfig": {"position": "adjacent"}},
            {"type": "expression-value", "label": "Hidden Field", "template": "{{patient.sex}}",
             "showWhen": {"clauses": [{"field": "patient.sex", "operator": "==", "value": "M"}]}},
            {"type": "paragraph", "label": "Notes", "freeformContent": "Routine excision.", "labelConfig": {"position": "above"}},
            {"type": "dropdown", "label": "Laterality", "bindingKey": "specimen.laterality",
             "options": [{"value": "left", "label": "Left"}, {"value": "right", "label": "Right"}]},
            {"type": "synoptic-block"},
        ]},
        {"slotId": "slot-2", "partId": "part-2", "partName": "Diagnosis", "order": 2, "nodes": [
            {"type": "section", "id": "sec-diag", "printHeading": "FINAL DIAGNOSIS", "ai": {"enabled": True}},
            {"type": "repeat-group", "iterateOver": "specimens", "itemAlias": "spec", "children": [
                {"type": "expression-value", "label": "Specimen", "template": "{{spec.label}}"},
            ]},
            {"type": "if-block",
             "condition": {"clauses": [{"field": "patient.age", "operator": ">", "value": 18}]},
             "children": [{"type": "static-label", "text": "Adult patient."}],
             "elseChildren": [{"type": "static-label", "text": "Pediatric patient."}]},
            {"type": "column-layout", "numColumns": 2, "children": [
                {"type": "expression-value", "label": "A", "template": "1"},
                {"type": "expression-value", "label": "B", "template": "2"},
            ]},
        ]},
    ],
}


def test_pdf_path_unchanged():
    print("test_pdf_path_unchanged")
    pdf_bytes = main.build_report_pdf(PAYLOAD)
    check(isinstance(pdf_bytes, bytes), "returns bytes")
    check(pdf_bytes[:4] == b'%PDF', "starts with a real PDF header")


def test_text_path_every_node_type():
    print("test_text_path_every_node_type")
    text = main.build_report_text(PAYLOAD)
    check("PathScribe General Hospital" in text, "institution name present")
    check("S26-1001-BX-001" in text, "accession present")
    check("Patient: Jane Doe" in text, "case header field present")
    check("CLINICAL HISTORY" in text, "static-label present")
    check("Age: 45" in text, "expression-value resolved")
    check("Hidden Field" not in text, "showWhen correctly suppressed a hidden field")
    check("Notes: Routine excision." in text, "paragraph field present")
    check("Laterality: Left" in text, "dropdown option label resolved")
    check("Tumor Size: 2.3 cm" in text and "Margins: Clear" in text, "synoptic-block answers present")
    check("FINAL DIAGNOSIS" in text, "AI section heading present")
    check("Basal cell carcinoma, nodular type." in text, "AI section HTML stripped, content preserved")
    check("<p>" not in text and "<b>" not in text, "no raw HTML tags leaked into plain text")
    check("A1 - Left arm" in text and "A2 - Right leg" in text, "repeat-group iterated both items")
    check("Adult patient." in text and "Pediatric patient." not in text, "if-block picked the correct branch")
    check("A: 1" in text and "B: 2" in text, "column-layout flattened correctly")
    check("CONFIDENTIAL" in text, "footer line present")


def _make_request(body: dict):
    return https_fn.Request.from_values(method='POST', content_type='application/json', data=json.dumps(body))


def _call_entrypoint(req):
    return _call_entrypoint_generic(main.render_report, req)


def _call_entrypoint_generic(fn, req):
    # Real, needed for the same real reason as the app-context push above:
    # flask_cors also reads the live flask.request proxy, which needs a
    # real request context pushed, matching this exact request's environ.
    with _test_app.request_context(req.environ):
        return fn(req)


def test_entrypoint_default_is_pdf():
    print("test_entrypoint_default_is_pdf")
    resp = _call_entrypoint(_make_request(PAYLOAD))
    check(resp.status_code == 200, "200 OK")
    check(resp.headers['Content-Type'] == 'application/pdf', "Content-Type: application/pdf, unchanged")
    check(resp.data[:4] == b'%PDF', "real PDF bytes")
    check('S26-1001-BX-001.pdf' in resp.headers['Content-Disposition'], "filename set from real accession")


def test_entrypoint_explicit_pdf_same_as_default():
    print("test_entrypoint_explicit_pdf_same_as_default")
    resp = _call_entrypoint(_make_request({**PAYLOAD, "outputFormat": "pdf"}))
    check(resp.status_code == 200 and resp.headers['Content-Type'] == 'application/pdf', "explicit outputFormat='pdf' behaves identically to omitting it")


def test_entrypoint_text_format():
    print("test_entrypoint_text_format")
    resp = _call_entrypoint(_make_request({**PAYLOAD, "outputFormat": "text"}))
    check(resp.status_code == 200, "200 OK")
    check(resp.headers['Content-Type'] == 'application/json', "Content-Type: application/json for text mode")
    body = json.loads(resp.data)
    check('text' in body and isinstance(body['text'], str), 'response shape is {"text": str}')
    check('S26-1001-BX-001' in body['text'], "real accession present in the real text body")


def test_entrypoint_malformed_json():
    print("test_entrypoint_malformed_json")
    req = https_fn.Request.from_values(method='POST', content_type='application/json', data='not json')
    resp = _call_entrypoint(req)
    check(resp.status_code == 400, "real 400 for malformed JSON, same as before this change")


def test_entrypoint_text_error_returns_clean_500():
    print("test_entrypoint_text_error_returns_clean_500")
    # Deliberately malformed node (missing required 'template' key) to
    # trigger a real internal error in the text path specifically.
    bad_payload = {"outputFormat": "text", "bodyAssembly": [{"nodes": [{"type": "expression-value"}]}]}
    resp = _call_entrypoint(_make_request(bad_payload))
    check(resp.status_code == 500, "real 500, not a leaked traceback, same posture as the PDF path")


# ── receive_interface_message tests ─────────────────────────────────────────
# Real, per direct guidance (the real receiving end for PathScribe's real
# outbound interface dispatch). firestore.client() itself is mocked below
# — this sandbox's network doesn't allow downloading the real Firestore
# emulator binary (storage.googleapis.com isn't on the allowed egress
# list), so the real Firestore write can't be tested end-to-end here.
# Everything this function actually controls — envelope validation,
# request/response handling, error paths — is tested for real, without
# any mock, exactly like the render_report tests above.

VALID_ENVELOPE = {
    "queueEntryId": "queue-abc-123",
    "transactionType": "A08",
    "dispatchedAt": "2026-08-31T12:00:00.000Z",
    "payload": {
        "messageId": "adt08-p1-abc",
        "eventType": "A08_DEMOGRAPHIC_UPDATE",
        "eventTimestamp": "2026-08-31T12:00:00.000Z",
        "organisationId": "ORG-A",
        "patient": {"patientId": "p1", "mrn": "MRN-1", "firstName": "Jane", "lastName": "Doe", "dateOfBirth": "1980-01-01", "identifiers": []},
    },
}


class _FakeDocRef:
    id = 'fake-doc-id-123'

    def set(self, data):
        self.set_data = data


class _FakeCollection:
    def document(self):
        return _FakeDocRef()


class _FakeFirestoreClient:
    def collection(self, name):
        assert name == 'received_interface_messages'
        return _FakeCollection()


class _FailingFirestoreClient:
    def collection(self, name):
        raise RuntimeError('simulated Firestore outage')


def test_validate_envelope_accepts_real_valid_envelope():
    print("test_validate_envelope_accepts_real_valid_envelope")
    check(main.validate_envelope(VALID_ENVELOPE) is None, "a real, complete, valid envelope passes validation")


def test_validate_envelope_rejects_missing_fields():
    print("test_validate_envelope_rejects_missing_fields")
    for field in ('queueEntryId', 'transactionType', 'dispatchedAt', 'payload'):
        bad = {**VALID_ENVELOPE}
        del bad[field]
        err = main.validate_envelope(bad)
        check(err is not None and field in err, f"missing '{field}' is rejected with a real, specific error message")


def test_validate_envelope_rejects_unknown_transaction_type():
    print("test_validate_envelope_rejects_unknown_transaction_type")
    bad = {**VALID_ENVELOPE, "transactionType": "A99_MADE_UP"}
    err = main.validate_envelope(bad)
    check(err is not None and 'A99_MADE_UP' in err, "an unknown transactionType is rejected by name")


def test_validate_envelope_accepts_all_six_real_transaction_types():
    print("test_validate_envelope_accepts_all_six_real_transaction_types")
    for t in ('A08', 'A40', 'A47', 'ORU_R01', 'LIS_SYNC', 'ORDER_CREATED'):
        ok = main.validate_envelope({**VALID_ENVELOPE, "transactionType": t}) is None
        check(ok, f"real transaction type {t} is accepted")


def test_validate_envelope_rejects_non_object_payload():
    print("test_validate_envelope_rejects_non_object_payload")
    bad = {**VALID_ENVELOPE, "payload": "not an object"}
    err = main.validate_envelope(bad)
    check(err is not None, "a string payload is rejected")


def test_receive_interface_message_success():
    print("test_receive_interface_message_success")
    original_client = main.firestore.client
    main.firestore.client = lambda: _FakeFirestoreClient()
    try:
        resp = _call_entrypoint_generic(main.receive_interface_message, _make_request(VALID_ENVELOPE))
    finally:
        main.firestore.client = original_client
    check(resp.status_code == 200, "200 OK for a real, valid envelope")
    check(resp.headers['Content-Type'] == 'application/json', "Content-Type: application/json")
    body = json.loads(resp.data)
    check(body.get('ok') is True, "response shape has ok: true")
    check(body.get('id') == 'fake-doc-id-123', "response includes the real document id")


def test_receive_interface_message_validation_failure():
    print("test_receive_interface_message_validation_failure")
    bad = {**VALID_ENVELOPE}
    del bad['transactionType']
    resp = _call_entrypoint_generic(main.receive_interface_message, _make_request(bad))
    check(resp.status_code == 422, "real 422 for a real validation failure")
    body = json.loads(resp.data)
    check(body.get('ok') is False and 'transactionType' in body.get('error', ''), "error message names the real missing field")


def test_receive_interface_message_malformed_json():
    print("test_receive_interface_message_malformed_json")
    req = https_fn.Request.from_values(method='POST', content_type='application/json', data='not json')
    resp = _call_entrypoint_generic(main.receive_interface_message, req)
    check(resp.status_code == 400, "real 400 for malformed JSON")


def test_receive_interface_message_method_not_allowed():
    print("test_receive_interface_message_method_not_allowed")
    req = https_fn.Request.from_values(method='GET')
    resp = _call_entrypoint_generic(main.receive_interface_message, req)
    check(resp.status_code == 405, "real 405 for a non-POST method")


def test_receive_interface_message_storage_failure_returns_clean_500():
    print("test_receive_interface_message_storage_failure_returns_clean_500")
    original_client = main.firestore.client
    main.firestore.client = lambda: _FailingFirestoreClient()
    try:
        resp = _call_entrypoint_generic(main.receive_interface_message, _make_request(VALID_ENVELOPE))
    finally:
        main.firestore.client = original_client
    check(resp.status_code == 500, "a genuine Firestore failure returns a real, clean 500")
    body = json.loads(resp.data)
    check(body.get('ok') is False, "response shape has ok: false on real storage failure")


if __name__ == '__main__':
    test_pdf_path_unchanged()
    test_text_path_every_node_type()
    test_entrypoint_default_is_pdf()
    test_entrypoint_explicit_pdf_same_as_default()
    test_entrypoint_text_format()
    test_entrypoint_malformed_json()
    test_entrypoint_text_error_returns_clean_500()
    test_validate_envelope_accepts_real_valid_envelope()
    test_validate_envelope_rejects_missing_fields()
    test_validate_envelope_rejects_unknown_transaction_type()
    test_validate_envelope_accepts_all_six_real_transaction_types()
    test_validate_envelope_rejects_non_object_payload()
    test_receive_interface_message_success()
    test_receive_interface_message_validation_failure()
    test_receive_interface_message_malformed_json()
    test_receive_interface_message_method_not_allowed()
    test_receive_interface_message_storage_failure_returns_clean_500()
    print(f"\nALL {PASS_COUNT} REAL CHECKS PASSED")
