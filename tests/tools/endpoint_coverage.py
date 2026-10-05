"""Audit successful REST dispatches; this is handler coverage, not branch coverage.

Run after a fresh Maven test run with inventory.test.endpoint-coverage enabled.
The streaming response bypasses the response filter, so its evidence is the
passing HTTP SSE test in Surefire's XML report. Uses only Python's standard library.
"""

import argparse
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path


def main():
    root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--trace", type=Path, default=root / "backend/target/endpoint-coverage.tsv")
    parser.add_argument("--markdown", type=Path)
    args = parser.parse_args()
    if not args.trace.is_file():
        parser.error("Missing dispatch trace. Run Maven with -Dinventory.test.endpoint-coverage=target/endpoint-coverage.tsv")
    seen = {}
    for line in args.trace.read_text(encoding="utf-8").splitlines():
        resource, method, verb, status = line.split("\t")
        seen.setdefault((resource, method, verb), set()).add(int(status))

    sse_verified = False
    for report in (root / "backend/target/surefire-reports").glob("TEST-*.xml"):
        for case in ET.parse(report).getroot().iter("testcase"):
            if (case.get("classname") == "org.ash.inventory.ArchitectureApiCoverageTest"
                    and case.get("name") == "sseDispatchesOnlyPublicEventClassification"
                    and not any(case.find(tag) is not None for tag in ("failure", "error", "skipped"))):
                sse_verified = True

    routes = []
    verbs = "GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS"
    for path in sorted((root / "backend/src/main/java/org/ash/inventory/resource").rglob("*Resource.java")):
        source = path.read_text(encoding="utf-8")
        base = re.search(r'@Path\("([^\"]+)"\)', source).group(1)
        for match in re.finditer(rf"@({verbs})\b(.*?)(?=@(?:{verbs})\b|\Z)", source, re.S):
            verb, chunk = match.groups()
            method = re.search(r"public\s+[\w<>,.? \[\]]+\s+(\w+)\s*\(", chunk).group(1)
            suffix = re.search(r'@Path\("([^\"]+)"\)', chunk.split("public ")[0])
            route = base.rstrip("/") + ("/" + suffix.group(1).lstrip("/") if suffix else "")
            statuses = sorted(seen.get((path.stem, method, verb), []))
            stream = path.stem == "EventStreamResource" and method == "stream"
            covered = any(200 <= status < 300 for status in statuses) or (stream and sse_verified)
            evidence = "HTTP SSE test passed" if stream and sse_verified else ", ".join(map(str, statuses)) or "none"
            routes.append((verb, route, f"{path.stem}.{method}", covered, evidence))

    missing = [row for row in routes if not row[3]]
    summary = f"REST handlers: {len(routes)}; verified: {len(routes) - len(missing)}; missing: {len(missing)}"
    print(summary)
    for verb, route, handler, _, evidence in missing:
        print(f"MISSING {verb} {route} ({handler}; evidence: {evidence})")
    if args.markdown:
        lines = ["# REST handler coverage", "", summary, "",
                 "Each ordinary handler requires an observed 2xx dispatch. SSE requires its passing HTTP test.",
                 "MCP is verified separately by InventoryMcpTest and InventoryMcpAuthenticationTest.", "",
                 "| Method | Path | Handler | Verified | HTTP status / evidence |",
                 "|---|---|---|:---:|---|"]
        lines.extend(f"| {verb} | `{route}` | `{handler}` | {'yes' if covered else 'NO'} | {evidence} |"
                     for verb, route, handler, covered, evidence in routes)
        args.markdown.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
