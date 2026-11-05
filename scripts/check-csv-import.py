#!/usr/bin/env python3
"""CSV API regression smoke test against a running image and disposable database."""
import argparse
import json
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8080")
    args = parser.parse_args()
    base = args.base_url.rstrip("/")
    owner = "csv-native-" + str(uuid.uuid4())

    def request(path, body=None, expected=200):
        headers = {"Content-Type": "application/json", "X-Actor-Id": owner, "X-Actor-Role": "admin"}
        data = None if body is None else json.dumps(body).encode()
        try:
            with urllib.request.urlopen(urllib.request.Request(base + path, data=data, headers=headers), timeout=10) as response:
                check(response.status == expected, f"{path}: expected HTTP {expected}, got {response.status}")
                return json.load(response)
        except urllib.error.HTTPError as error:
            raise AssertionError(f"{path}: HTTP {error.code}: {error.read().decode(errors='replace')}") from error

    deadline = time.monotonic() + 90
    while True:
        try:
            request("/q/health/ready")
            break
        except (AssertionError, OSError):
            if time.monotonic() >= deadline:
                raise
            time.sleep(1)

    def plan(tab):
        result = {"tabType": tab, "updateExistingItems": False, "autoCreateLocations": True}
        for section in ("newFactions", "parsedItems", "parsedAssemblies", "parsedEvents", "parsedOrders",
                        "parsedGeneralOrders", "parsedReturns", "parsedCheckouts", "parsedOperations"):
            result[section] = []
        return result

    def item(index, suffix):
        return {"index": index, "status": "valid", "isExisting": False,
                "data": {"name": owner + suffix, "category": "CSV smoke", "trackingMode": "bulk", "amount": 0}}

    def submit(work):
        upload = {"commandId": str(uuid.uuid4()), "filename": "native-smoke.csv",
                  "timezone": "Europe/Berlin", "plan": work}
        job = request("/api/csv-imports", upload, 202)
        check(request("/api/csv-imports", upload, 202)["id"] == job["id"], "Upload must be idempotent")
        return job["id"]

    def completed(job_id):
        deadline = time.monotonic() + 45
        while True:
            job = request("/api/csv-imports/" + job_id)
            check(job["status"] != "failed", f"Import failed: {job}")
            if job["status"] == "completed":
                check(job["progress"] == 100, f"Incomplete progress: {job}")
                recent = next(row for row in request("/api/csv-imports") if row["id"] == job_id)
                check(recent["result"] == job["result"], "Recent jobs must load the persisted result")
                return job
            check(time.monotonic() < deadline, f"Import did not complete: {job}")
            time.sleep(0.25)

    combined = plan("combined")
    combined["parsedItems"] = [item(1, " first"), item(2, " second")]
    combined["parsedAssemblies"] = [{"index": 3, "status": "valid",
        "data": {"name": owner + " assembly", "category": "CSV smoke"},
        "components": [{"itemId": "csv-new-1", "quantity": 2}]}]
    job = completed(submit(combined))
    check(job["processedRows"] == 3, f"Wrong completed row count: {job}")
    check(job["result"]["successItems"] == 2 and job["result"]["successAssemblies"] == 1,
          f"Items and cross-row assembly references must persist: {job}")
    check(job["result"]["errors"] == [], f"Unexpected import errors: {job}")

    rollback = plan("items")
    invalid = item(1, " invalid")
    invalid["lots"] = [{"lotNumber": "cannot-book-on-bulk", "quantity": 1}]
    rollback["parsedItems"] = [invalid, item(2, " valid")]
    job = completed(submit(rollback))
    check(job["processedRows"] == 2 and job["result"]["successItems"] == 1,
          f"The worker must continue after a failed row: {job}")
    check(len(job["result"]["errors"]) == 1, f"The failed row must be checkpointed: {job}")
    check("Inventory lots require an item with lot_tracked tracking mode" in job["result"]["errors"][0],
          f"The invalid row must fail validation, not crash: {job}")
    query = urllib.parse.urlencode({"search": owner + " invalid"})
    check(request("/api/items?" + query) == [], "The failed row must roll back its item")
    lots = plan("items")
    tracked = item(1, " tracked")
    tracked["data"]["trackingMode"] = "lot_tracked"
    tracked["storageLocationPath"] = [owner + " building", "shelf"]
    tracked["lots"] = [{"lotNumber": "opening-lot", "quantity": 3}]
    lots["parsedItems"] = [tracked]
    job = completed(submit(lots))
    check(job["result"]["successItems"] == 1 and job["result"]["errors"] == [],
          f"Lot opening stock must import: {job}")
    query = urllib.parse.urlencode({"search": owner + " tracked"})
    saved = request("/api/items?" + query)
    check(len(saved) == 1, "The lot-tracked item must persist")
    saved_lots = request("/api/inventory-lots?" + urllib.parse.urlencode({"itemId": saved[0]["id"]}))
    check(len(saved_lots) == 1 and saved_lots[0]["stock"][0]["onHand"] == 3,
          f"Lot opening stock must persist at its location: {saved_lots}")
    print("CSV image smoke passed: upload, idempotency, checkpoints, references, rollback, lot stock and status reads")


def check(condition, message):
    if not condition:
        raise AssertionError(message)


if __name__ == "__main__":
    main()
