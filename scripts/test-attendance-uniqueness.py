"""Integration test: use a minted local session; all test school rows are removed."""
import asyncio
import json
import os
import uuid
from urllib.request import Request, urlopen
from urllib.error import HTTPError


def run_test():
    with open(os.path.expanduser("~/.cache/lovable-auth/session.json")) as source:
        minted = json.load(source)
    base = os.environ["VITE_SUPABASE_URL"] + "/rest/v1/"
    headers = {
        "apikey": os.environ["VITE_SUPABASE_PUBLISHABLE_KEY"],
        "Authorization": "Bearer " + minted["session"]["access_token"],
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

    def call(method, path, body=None):
        request = Request(base + path, data=json.dumps(body).encode() if body else None,
                          headers=headers, method=method)
        try:
            with urlopen(request) as response:
                raw = response.read()
                return response.status, json.loads(raw) if raw else None
        except HTTPError as error:
            return error.code, json.loads(error.read())

    class_id = str(uuid.uuid4())
    status, _ = call("POST", "classes", {"id": class_id, "name": "__attendance_test_" + class_id})
    assert status == 201, "Test class could not be created"
    try:
        row = {"class_id": class_id, "teacher_id": minted["user_id"],
               "session_date": "2026-10-19", "period": "1", "session_type": "regular"}

        async def concurrent():
            return await asyncio.gather(asyncio.to_thread(call, "POST", "attendance_sessions", row),
                                        asyncio.to_thread(call, "POST", "attendance_sessions", row))

        outcomes = asyncio.run(concurrent())
        assert sorted(status for status, _ in outcomes) == [201, 409], "Same class/date/period must not duplicate"
        conflicts = [body for status, body in outcomes if status == 409]
        assert conflicts[0]["code"] == "23505", "Conflict must be database uniqueness protection"
        status, saved = call("GET", "attendance_sessions?class_id=eq." + class_id)
        assert status == 200 and len(saved) == 1, "Exactly one session must remain"
        other = {**row, "period": "2"}
        status, _ = call("POST", "attendance_sessions", other)
        assert status == 201, "A different period must remain available"
        print("PASS: concurrent duplicate rejected; one saved session; different period allowed")
    finally:
        status, _ = call("DELETE", "attendance_sessions?class_id=eq." + class_id)
        assert status in (200, 204), "Test sessions cleanup failed"
        status, _ = call("DELETE", "classes?id=eq." + class_id)
        assert status in (200, 204), "Test class cleanup failed"


if __name__ == "__main__":
    run_test()