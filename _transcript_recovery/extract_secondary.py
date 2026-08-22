import json
import os
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

path = r"C:\Users\Welcome\.cursor\projects\c-Users-Welcome-Desktop-mmtt\agent-transcripts\0308c88f-94cc-4f05-b31f-055d4703040b\0308c88f-94cc-4f05-b31f-055d4703040b.jsonl"
out_dir = r"C:\Users\Welcome\Desktop\mmtt\_transcript_recovery"

ops_secondary = {
    n: []
    for n in [
        "NativeChatChart.tsx",
        "App.tsx",
        "Sidebar.tsx",
        "CommandPalette.tsx",
        "brandLabels.ts",
        "marketApiService.ts",
        "tradingViewSymbols.ts",
        "index.css",
    ]
}
todos_all = []

line_no = 0
with open(path, "r", encoding="utf-8") as f:
    for line in f:
        line_no += 1
        try:
            obj = json.loads(line)
        except Exception:
            continue

        def walk(o, depth=0):
            if depth > 14:
                return
            if isinstance(o, dict):
                name = o.get("name") or o.get("toolName") or o.get("tool")
                if name in ("Write", "StrReplace", "write", "search_replace"):
                    args = o.get("arguments") or o.get("args") or o.get("input") or {}
                    if isinstance(args, str):
                        try:
                            args = json.loads(args)
                        except Exception:
                            args = {}
                    fpath = str(
                        args.get("path") or args.get("file_path") or ""
                    ).replace("\\", "/")
                    for n in ops_secondary:
                        if n.lower() in fpath.lower():
                            ops_secondary[n].append(
                                {
                                    "line": line_no,
                                    "tool": "Write"
                                    if name.lower() == "write"
                                    else "StrReplace",
                                    "path": fpath,
                                    "args": args,
                                }
                            )
                if name in ("TodoWrite", "todo_write"):
                    args = o.get("arguments") or o.get("args") or o.get("input") or {}
                    if isinstance(args, str):
                        try:
                            args = json.loads(args)
                        except Exception:
                            args = {}
                    todos_all.append(
                        {
                            "line": line_no,
                            "args": args,
                            "merge": args.get("merge")
                            if isinstance(args, dict)
                            else None,
                        }
                    )
                for v in o.values():
                    walk(v, depth + 1)
            elif isinstance(o, list):
                for i in o:
                    walk(i, depth + 1)

        walk(obj)


def todos_text(args):
    if isinstance(args, dict):
        return args.get("todos") or args.get("items") or []
    return []


# Prefer Wolf Terminal plan todos: ids like term-*, or contents mentioning Terminal page
def is_wolf_terminal_plan(todos):
    blob = json.dumps(todos).lower()
    keys = (
        "terminalpage",
        "terminal top",
        "wolf terminal",
        "term-",
        "tvembed",
        "tradestrip",
        "rightdock",
        "symbol catalog",
        "chart host",
        "watchlist panel",
        "nativechatchart fill",
        "needhistory",
        "onneedhistory",
        "fillheight",
    )
    return any(k in blob for k in keys)


term_todo_events = []
for t in todos_all:
    todos = todos_text(t["args"])
    if is_wolf_terminal_plan(todos):
        term_todo_events.append(t)
    else:
        # also catch ids starting with term
        for item in todos:
            if isinstance(item, dict):
                iid = str(item.get("id", "")).lower()
                content = str(item.get("content", "")).lower()
                if iid.startswith("term") or "wolf terminal" in content or (
                    "terminal" in content
                    and any(
                        x in content
                        for x in (
                            "page",
                            "watchlist",
                            "chart",
                            "topbar",
                            "dock",
                            "embed",
                            "catalog",
                        )
                    )
                ):
                    term_todo_events.append(t)
                    break

# dedupe by line
seen = set()
uniq = []
for t in term_todo_events:
    if t["line"] in seen:
        continue
    seen.add(t["line"])
    uniq.append(t)
term_todo_events = uniq

print(f"Wolf Terminal todo events: {len(term_todo_events)}")
for t in term_todo_events:
    todos = todos_text(t["args"])
    print(f"\n=== TodoWrite line {t['line']} merge={t.get('merge')} ===")
    for item in todos:
        if isinstance(item, dict):
            content = str(item.get("content", ""))[:160]
            print(f"  [{item.get('status', '?')}] {item.get('id', '')} :: {content}")

with open(os.path.join(out_dir, "_todos.json"), "w", encoding="utf-8") as wf:
    json.dump(
        [
            {
                "line": t["line"],
                "merge": t.get("merge"),
                "todos": todos_text(t["args"]),
            }
            for t in term_todo_events
        ],
        wf,
        indent=2,
    )

# Also dump last todo state in late window regardless
late_todos = [t for t in todos_all if t["line"] >= 9600]
print(f"\n\nAll TodoWrite events line>=9600: {len(late_todos)}")
for t in late_todos:
    todos = todos_text(t["args"])
    print(f"\n=== TodoWrite line {t['line']} merge={t.get('merge')} ===")
    for item in todos:
        if isinstance(item, dict):
            content = str(item.get("content", ""))[:160]
            print(f"  [{item.get('status', '?')}] {item.get('id', '')} :: {content}")

KEYWORDS = (
    "terminal",
    "Terminal",
    "wolf-term",
    "fillHeight",
    "onNeedHistory",
    "Wolf",
    "WOLF",
    "needHistory",
)

fragments = {}
for n, ops in ops_secondary.items():
    late = [o for o in ops if o["line"] >= 9600]
    relevant = []
    for o in late:
        blob = json.dumps(o["args"])
        if any(k in blob for k in KEYWORDS):
            relevant.append(o)

    print(f"\n{n}: total={len(ops)} late={len(late)} relevant={len(relevant)}")
    entries = []
    for o in relevant:
        a = o["args"]
        if o["tool"] == "Write":
            c = a.get("contents") or a.get("content") or ""
            entries.append(
                {"line": o["line"], "tool": "Write", "len": len(c), "contents": c}
            )
            print(f"  L{o['line']} Write len={len(c)}")
        else:
            old = a.get("old_string") or ""
            new = a.get("new_string") or ""
            entries.append(
                {
                    "line": o["line"],
                    "tool": "StrReplace",
                    "old": old,
                    "new": new,
                    "replace_all": bool(a.get("replace_all") or a.get("replaceAll")),
                }
            )
            preview = new[:120].replace("\n", "\\n")
            print(
                f"  L{o['line']} StrReplace old={len(old)} new={len(new)} :: {preview}"
            )
    fragments[n] = entries

    # Save individual fragment markdown
    frag_path = os.path.join(out_dir, f"_frag_{n}.md")
    with open(frag_path, "w", encoding="utf-8") as wf:
        wf.write(f"# Fragments for {n}\n\n")
        for e in entries:
            wf.write(f"## L{e['line']} {e['tool']}\n\n")
            if e["tool"] == "Write":
                wf.write(f"len={e['len']}\n\n```\n{e['contents']}\n```\n\n")
            else:
                wf.write("### old_string\n\n```\n" + e["old"] + "\n```\n\n")
                wf.write("### new_string\n\n```\n" + e["new"] + "\n```\n\n")

with open(os.path.join(out_dir, "_secondary_fragments.json"), "w", encoding="utf-8") as wf:
    json.dump(fragments, wf, indent=2)

# NativeChatChart detailed late ops
ncc = ops_secondary["NativeChatChart.tsx"]
late_ncc = [o for o in ncc if o["line"] >= 9600]
print(f"\nNativeChatChart late ops: {len(late_ncc)}")
for o in late_ncc:
    a = o["args"]
    if o["tool"] == "Write":
        c = a.get("contents") or a.get("content") or ""
        print(f"  L{o['line']} Write len={len(c)}")
        # check if fillHeight in write
        print(f"    fillHeight={'fillHeight' in c} onNeedHistory={'onNeedHistory' in c}")
    else:
        old = a.get("old_string") or ""
        new = a.get("new_string") or ""
        hit = any(
            k in old or k in new
            for k in ("fillHeight", "onNeedHistory", "needHistory", "loadMore")
        )
        print(
            f"  L{o['line']} StrReplace old={len(old)} new={len(new)} relevant={hit}"
        )

# index.css wolf-term section in late ops
css = ops_secondary["index.css"]
late_css = [o for o in css if o["line"] >= 9600]
print(f"\nindex.css late ops: {len(late_css)}")
wolf_css = []
for o in late_css:
    a = o["args"]
    blob = json.dumps(a)
    if "wolf-term" in blob or "wolf_term" in blob or ".wolf-term" in blob:
        wolf_css.append(o)
        new = a.get("new_string") or a.get("contents") or a.get("content") or ""
        print(f"  L{o['line']} {o['tool']} new_len={len(new)}")

# Save concatenated wolf-term css fragments
with open(os.path.join(out_dir, "_wolf_term_css_fragments.md"), "w", encoding="utf-8") as wf:
    for o in wolf_css:
        a = o["args"]
        wf.write(f"## L{o['line']} {o['tool']}\n\n")
        if o["tool"] == "Write":
            wf.write("```css\n" + (a.get("contents") or a.get("content") or "") + "\n```\n\n")
        else:
            wf.write("### old\n```css\n" + (a.get("old_string") or "") + "\n```\n\n")
            wf.write("### new\n```css\n" + (a.get("new_string") or "") + "\n```\n\n")

print("Done")
