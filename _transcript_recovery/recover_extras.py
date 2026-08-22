import json
import os
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

path = r"C:\Users\Welcome\.cursor\projects\c-Users-Welcome-Desktop-mmtt\agent-transcripts\0308c88f-94cc-4f05-b31f-055d4703040b\0308c88f-94cc-4f05-b31f-055d4703040b.jsonl"
out = r"C:\Users\Welcome\Desktop\mmtt\_transcript_recovery"

names = ["TerminalBottomBar.tsx", "terminalState.ts"]
ops = {n: [] for n in names}

# Also extract NativeChatChart patches that mention history/loadOlder/bars/onNeed
ncc_hist = []
sidebar_import = []
market = []
tv_symbols = []

line_no = 0
with open(path, encoding="utf-8") as f:
    for line in f:
        line_no += 1
        try:
            obj = json.loads(line)
        except Exception:
            continue

        def walk(o, d=0):
            if d > 14:
                return
            if isinstance(o, dict):
                name = o.get("name") or o.get("toolName")
                if name in ("Write", "StrReplace", "write", "search_replace"):
                    args = o.get("arguments") or o.get("args") or o.get("input") or {}
                    if isinstance(args, str):
                        try:
                            args = json.loads(args)
                        except Exception:
                            args = {}
                    fp = str(args.get("path") or args.get("file_path") or "").replace(
                        "\\", "/"
                    )
                    for n in names:
                        if n.lower() in fp.lower():
                            ops[n].append(
                                {
                                    "line": line_no,
                                    "tool": "Write"
                                    if name.lower() == "write"
                                    else "StrReplace",
                                    "args": args,
                                }
                            )
                    if "NativeChatChart.tsx" in fp and line_no >= 9600:
                        blob = json.dumps(args)
                        keys = (
                            "enableHistoryScroll",
                            "loadingOlder",
                            "historyExhausted",
                            "fillHeight",
                            "loadOlder",
                            "bars",
                            "visibleLogicalRange",
                            "HISTORY",
                            "fetchOlder",
                            "prepend",
                        )
                        if any(k in blob for k in keys):
                            ncc_hist.append(
                                {
                                    "line": line_no,
                                    "tool": "Write"
                                    if name.lower() == "write"
                                    else "StrReplace",
                                    "args": args,
                                }
                            )
                    if "Sidebar.tsx" in fp and line_no >= 9600:
                        blob = json.dumps(args)
                        if "CandlestickChart" in blob or "terminal" in blob.lower():
                            sidebar_import.append(
                                {"line": line_no, "tool": name, "args": args}
                            )
                    if "marketApiService.ts" in fp and line_no >= 9580:
                        market.append(
                            {
                                "line": line_no,
                                "tool": "Write"
                                if name.lower() == "write"
                                else "StrReplace",
                                "args": args,
                            }
                        )
                    if "tradingViewSymbols.ts" in fp and line_no >= 9600:
                        blob = json.dumps(args)
                        if any(
                            k in blob
                            for k in (
                                "NATIVE_TIMEFRAMES",
                                "3m",
                                "1M",
                                "month",
                                "NATIVE_STUDY",
                            )
                        ):
                            tv_symbols.append(
                                {
                                    "line": line_no,
                                    "tool": "Write"
                                    if name.lower() == "write"
                                    else "StrReplace",
                                    "args": args,
                                }
                            )
                for v in o.values():
                    walk(v, d + 1)
            elif isinstance(o, list):
                for i in o:
                    walk(i, d + 1)

        walk(obj)

for n, ol in ops.items():
    print(n, "ops", len(ol))
    content = None
    for o in ol:
        a = o["args"]
        if o["tool"] == "Write":
            content = a.get("contents") or a.get("content")
            print(f"  L{o['line']} Write {len(content or '')}")
        else:
            old = a.get("old_string") or ""
            new = a.get("new_string") or ""
            if content is not None and old in content:
                content = content.replace(old, new, 1)
                print(f"  L{o['line']} StrReplace OK")
            else:
                print(f"  L{o['line']} StrReplace miss")
                # still save the write fragments
    if content:
        with open(os.path.join(out, n), "w", encoding="utf-8") as wf:
            wf.write(content)
        print("  saved", len(content))

# Dump NCC history-related
with open(os.path.join(out, "_NativeChatChart_history_patches.md"), "w", encoding="utf-8") as wf:
    wf.write("# NativeChatChart history/fillHeight related patches\n\n")
    for o in ncc_hist:
        a = o["args"]
        wf.write(f"## L{o['line']} {o['tool']}\n\n")
        if o["tool"] == "Write":
            wf.write("```tsx\n" + (a.get("contents") or a.get("content") or "") + "\n```\n\n")
        else:
            wf.write("### old_string\n```tsx\n" + (a.get("old_string") or "") + "\n```\n\n")
            wf.write("### new_string\n```tsx\n" + (a.get("new_string") or "") + "\n```\n\n")
print("ncc hist patches", len(ncc_hist))

with open(os.path.join(out, "_marketApi_patches.md"), "w", encoding="utf-8") as wf:
    for o in market:
        a = o["args"]
        wf.write(f"## L{o['line']} {o['tool']}\n\n")
        wf.write("### old\n```\n" + (a.get("old_string") or "") + "\n```\n\n")
        wf.write("### new\n```\n" + (a.get("new_string") or "") + "\n```\n\n")
print("market patches", len(market))

with open(os.path.join(out, "_tvSymbols_patches.md"), "w", encoding="utf-8") as wf:
    for o in tv_symbols:
        a = o["args"]
        wf.write(f"## L{o['line']} {o['tool']}\n\n")
        wf.write("### old\n```\n" + (a.get("old_string") or "") + "\n```\n\n")
        wf.write("### new\n```\n" + (a.get("new_string") or "") + "\n```\n\n")
print("tv patches", len(tv_symbols))

with open(os.path.join(out, "_sidebar_extra.md"), "w", encoding="utf-8") as wf:
    for o in sidebar_import:
        a = o["args"]
        wf.write(f"## L{o['line']}\n\n")
        wf.write("### old\n```\n" + (a.get("old_string") or "") + "\n```\n\n")
        wf.write("### new\n```\n" + (a.get("new_string") or "") + "\n```\n\n")

# Extract wolf-term section from reconstructed CSS
css_path = os.path.join(out, "_wolf_term_css_reconstructed.css")
with open(css_path, encoding="utf-8") as f:
    css = f.read()
# Find from Wolf Terminal comment
markers = ["/* ─── Wolf Terminal", "/* --- Wolf Terminal", ".wolf-term", "app-main--terminal"]
start = css.find("/* ─── Wolf Terminal")
if start < 0:
    start = css.find(".app-main--terminal")
if start < 0:
    start = css.find(".wolf-term")
print("css start", start, "len", len(css))
if start >= 0:
    section = css[start:]
    with open(os.path.join(out, "wolf-term.css"), "w", encoding="utf-8") as wf:
        wf.write(section)
    print("wolf-term section", len(section))

print("done")
