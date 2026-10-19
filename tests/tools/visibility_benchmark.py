#!/usr/bin/env python3
"""Read-only PostgreSQL visibility probes against visibility-benchmark.sql's disposable fixture.

SQL identifiers only: excludes HTTP, ORM hydration, mapping and client process startup.
The inline reference mirrors InventoryAccessOrm.transactionScope; security regressions
independently exercise the actual application query.
"""
import argparse
import concurrent.futures
import json
import math
from pathlib import Path
import statistics
import subprocess

VIEWER = "'10000000-0000-0000-0000-000000000001'"


def visible(column):
    return f"""({column} is null or exists(
        select 1 from inventory_access_policies p where p.id={column} and (
          p.owner_user_id={VIEWER} or p.public_use or exists(
            select 1 from inventory_access_grants g where
              (g.policy_id=p.id or exists(select 1 from inventory_access_links k
                where k.policy_id=p.id and k.ancestor_policy_id=g.policy_id))
              and (g.user_id={VIEWER} or exists(select 1 from inventory_access_group_members m
                where m.group_id=g.group_id and m.user_id={VIEWER})))
          or exists(select 1 from inventory_access_links k join inventory_access_policies ancestor
            on ancestor.id=k.ancestor_policy_id where k.policy_id=p.id and ancestor.owner_user_id={VIEWER}))))"""


def source(mode):
    joins = " from stock_transactions t join items i on i.id=t.item_id join app_users u on u.id=t.user_id"
    if mode == "recursive":
        return joins + f" where inventory_resource_visible('transaction',t.id,{VIEWER},false,true)"
    return joins + " left join storage_locations source on source.id=t.source_location_id" \
        + " left join storage_locations destination on destination.id=t.destination_location_id where " \
        + visible("i.access_policy_id") \
        + " and (source.id is null or " + visible("source.access_policy_id") + ")" \
        + " and (destination.id is null or " + visible("destination.access_policy_id") + ")" \
        + f" and (t.order_id is null or inventory_resource_visible('order',t.order_id,{VIEWER},false,true))" \
        + f" and (t.damage_report_id is null or inventory_resource_visible('damage',t.damage_report_id,{VIEWER},false,true))"


def summarize(plans):
    values = sorted(plan["Execution Time"] for plan in plans)
    return {"samples": len(values), "p50_server_ms": statistics.median(values),
            "p95_server_ms": values[math.ceil(.95 * len(values)) - 1], "max_server_ms": max(values),
            "returned_rows": sorted({plan["Plan"]["Actual Rows"] for plan in plans})}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--container", required=True)
    parser.add_argument("--database", required=True)
    parser.add_argument("--user", required=True)
    parser.add_argument("--mode", choices=["recursive", "inline"], required=True)
    parser.add_argument("--samples", type=int, default=30)
    parser.add_argument("--deep-samples", type=int, default=3)
    parser.add_argument("--concurrency", type=int, default=10)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if not (1 <= args.samples <= 100 and 1 <= args.deep_samples <= 10 and 1 <= args.concurrency <= 20):
        parser.error("Probe bounds exceeded")
    args.output.mkdir(parents=True, exist_ok=True)

    def query(sql):
        result = subprocess.run(["docker", "exec", "-i", args.container, "psql", "-U", args.user,
                                 "-d", args.database, "-t", "-A", "-v", "ON_ERROR_STOP=1"],
                                input=sql, text=True, capture_output=True, check=True)
        value = json.loads(result.stdout)
        return value[0] if isinstance(value, list) else value

    def explain(offset):
        return query("explain (analyze,buffers,format json) select t.id" + source(args.mode)
                     + f" order by t.occurred_at desc,t.id desc offset {offset} limit 100")

    if args.mode == "inline" and query("select json_build_object('visible',count(*))" + source(args.mode))["visible"] != 82500:
        raise SystemExit("Expected the isolated 10,000-item/100,000-movement fixture")
    for _ in range(3):
        explain(0)
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        first = list(pool.map(lambda _: explain(0), range(args.samples)))
    print("First-page probes completed.", flush=True)
    deep = [explain(50000) for _ in range(args.deep_samples)]
    for name, plan in [("first-page-plan", first[0]), ("deep-page-plan", deep[0])]:
        (args.output / (name + ".json")).write_text(json.dumps(plan, indent=2), encoding="utf-8")
    result = {"mode": args.mode, "first_page": {"concurrency": args.concurrency, **summarize(first)},
              "offset_50000": {"concurrency": 1, **summarize(deep)}}
    (args.output / "results.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
