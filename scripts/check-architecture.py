#!/usr/bin/env python3
"""Static module/import/data-ownership gate. Does not build or run the application."""
from __future__ import annotations

import collections
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
JAVA = ROOT / "backend/src/main/java"
BASE = "org.ash.inventory."
POLICY = json.loads((ROOT / "backend/architecture/modules.json").read_text(encoding="utf-8"))["modules"]
LITERALS = re.compile(r'"""[\s\S]*?"""|"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|/\*[\s\S]*?\*/|//[^\n]*')
PLATFORM_EXPORTS = {
    "platform.persistence.BaseEntity", "platform.persistence.ConsistentRead",
    "platform.runtime.WorkerRoles", "platform.telemetry.InventoryTelemetry",
    "platform.ratelimit.ApiBudget", "platform.ratelimit.RateLimiter",
}


def cycles(graph):
    active, done, path, found = set(), set(), [], []
    def visit(node):
        if node in active:
            found.append(path[path.index(node):] + [node])
            return
        if node in done:
            return
        active.add(node); path.append(node)
        for target in sorted(graph.get(node, ())):
            visit(target)
        path.pop(); active.remove(node); done.add(node)
    for node in sorted(graph):
        visit(node)
    return found


def main():
    errors, sources, entity_tables = [], {}, {}
    for path in sorted(JAVA.rglob("*.java")):
        source = path.read_text(encoding="utf-8")
        declaration = re.search(r"\bpackage\s+([\w.]+);", source)
        if not declaration:
            errors.append(f"{path.relative_to(ROOT)}: missing package"); continue
        package = declaration[1]
        expected = JAVA / Path(package.replace(".", "/")) / path.name
        if path != expected or not package.startswith(BASE):
            errors.append(f"{path.relative_to(ROOT)}: package/path mismatch"); continue
        module = package[len(BASE):].split(".")[0]
        if module not in POLICY:
            errors.append(f"{path.relative_to(ROOT)}: undeclared module {module}"); continue
        if path.name != "package-info.java":
            sources[package + "." + path.stem] = (path, source, module)
        table = re.search(r'@Table\(name\s*=\s*"(\w+)"', source)
        if table:
            entity_tables[path.stem] = table[1]
    owners = {}
    for module, config in POLICY.items():
        for table in config["tables"]:
            if table in owners:
                errors.append(f"Table {table} has more than one owner")
            owners[table] = module
    baseline = (ROOT / "backend/src/main/resources/db/migration/V1.0.0__init.sql").read_text(encoding="utf-8")
    tables = set(re.findall(r"create\s+table\s+(\w+)", baseline, re.I))
    if tables != set(owners):
        errors.append(f"Table owner map differs from baseline: unowned={sorted(tables-set(owners))}, absent={sorted(set(owners)-tables)}")

    foreign_keys = []
    for table, body in re.findall(r"create\s+table\s+(\w+)\s*\(([\s\S]*?)\);", baseline, re.I):
        foreign_keys.extend((table, target) for target in re.findall(r"\breferences\s+(\w+)", body, re.I))
    for table, body in re.findall(r"alter\s+table\s+(?:if\s+exists\s+)?(\w+)\s+([^;]+);", baseline, re.I):
        foreign_keys.extend((table, target) for target in re.findall(r"\breferences\s+(\w+)", body, re.I))
    for table, target in foreign_keys:
        if table in owners and target in owners and owners[table] != owners[target]:
            errors.append(f"Cross-module foreign key: {table} ({owners[table]}) -> {target} ({owners[target]})")

    bean_types = {name for name, (_, source, _) in sources.items() if re.search(r"@(?:[\w.]+\.)?(?:ApplicationScoped|RequestScoped|Singleton|Dependent)\b", source)}
    module_graph = {name: set() for name in POLICY}
    bean_graph, implementations = {}, collections.defaultdict(list)
    symbols = {}
    for fqn, (path, source, module) in sources.items():
        code = LITERALS.sub(" ", source)
        imports = re.findall(r"\bimport\s+(?:static\s+)?(org\.ash\.inventory\.[\w.*]+);", code)
        references = set(imports) | set(re.findall(r"\borg\.ash\.inventory\.(?:\w+\.)*[A-Z]\w*(?:\.\w+)*", re.sub(r"\bimport[^;]*;", "", code)))
        lookup = {name.rsplit(".", 1)[1]: name for name in sources if name.rsplit(".", 1)[0] == fqn.rsplit(".", 1)[0]}
        for reference in references:
            if reference.endswith(".*"):
                errors.append(f"{path.relative_to(ROOT)}: project wildcard import hides boundary: {reference}"); continue
            resolved = next((name for name in sorted(sources, key=len, reverse=True) if reference == name or reference.startswith(name + ".")), None)
            if not resolved:
                errors.append(f"{path.relative_to(ROOT)}: unknown project type {reference}"); continue
            lookup[resolved.rsplit(".", 1)[1]] = resolved
            target = sources[resolved][2]
            if target == module:
                if module == "operations" and ".internal." in fqn and ".adapter." in resolved:
                    errors.append(f"{path.relative_to(ROOT)}: internal application/persistence depends on transport {reference}")
                continue
            module_graph[module].add(target)
            relative = resolved[len(BASE):]
            exported = relative.startswith(target + ".api.") or target == "platform" and relative in PLATFORM_EXPORTS
            if target not in POLICY[module]["requires"] or not exported:
                errors.append(f"{path.relative_to(ROOT)}: forbidden dependency on {reference}")
        # Public API records may not exchange persistence entities, even from their own module.
        if ".api." in fqn:
            signatures = re.findall(r"public\s+record\s+\w+\s*\((.*?)\)\s*(?:\{|implements)", code, re.S)
            signatures += re.findall(r"public\s+(?:(?:static|final|synchronized)\s+)*(?:<[^>]+>\s+)?[\w<>,?.\[\] ]+\s+\w+\s*\([^)]*\)", code)
            for signature in signatures:
                for token in re.findall(r"\b[A-Z]\w*\b", signature):
                    target = lookup.get(token)
                    if target and re.search(r"@Entity\b", sources[target][1]):
                        errors.append(f"{path.relative_to(ROOT)}: API record exposes entity {token}")
        # Explicit SQL/HQL ownership. Generic mechanics cannot bypass the import/entity boundary.
        for token in set(re.findall(r"\b(?:from|join|update|into)\s+([a-zA-Z_]\w*)", source, re.I)):
            table = entity_tables.get(token, token.lower())
            if table in owners and owners[table] != module:
                errors.append(f"{path.relative_to(ROOT)}: queries {table} owned by {owners[table]}")
        fields = re.findall(r"(?:@(?:[\w.]+)(?:\([^;]*?\))?\s+|\b(?:private|protected|public|final)\s+)+([\w.]+)(?:<[^;\n]+>)?\s+\w+\s*[;=]", code)
        bean_graph[fqn] = {lookup[t.rsplit('.', 1)[-1]] for t in fields if t.rsplit('.', 1)[-1] in lookup and lookup[t.rsplit('.', 1)[-1]] != fqn} if fqn in bean_types else set()
        for interface in re.findall(r"\bimplements\s+(\w+)", code):
            if interface in lookup and fqn in bean_types:
                implementations[lookup[interface]].append(fqn)
        symbols[fqn] = lookup
    for interface, implementers in implementations.items():
        if len(implementers) == 1:
            bean_graph[interface] = {implementers[0]}
    for cycle in cycles(module_graph):
        errors.append("Module dependency cycle: " + " -> ".join(cycle))
    for cycle in cycles(bean_graph):
        errors.append("Injected dependency cycle: " + " -> ".join(name.rsplit('.', 1)[-1] for name in cycle))
    if errors:
        print("Architecture boundary violations:")
        for error in sorted(set(errors)):
            print("  " + error)
        return 1
    print(f"Architecture boundaries OK: {len(POLICY)} modules, {len(sources)} production types, {len(tables)} owned tables; no module or injected-dependency cycles.")
    for module, dependencies in sorted(module_graph.items()):
        print(f"  {module} -> {', '.join(sorted(dependencies)) or '(none)'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
