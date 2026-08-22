import json
import re
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
path = r"C:\Users\Welcome\.cursor\projects\c-Users-Welcome-Desktop-mmtt\agent-transcripts\0308c88f-94cc-4f05-b31f-055d4703040b\0308c88f-94cc-4f05-b31f-055d4703040b.jsonl"
line_no = 0
with open(path, encoding="utf-8") as f:
    for line in f:
        line_no += 1
        if line_no < 9600 or line_no > 9760:
            continue
        if "NATIVE_TIMEFRAMES" not in line and "3m" not in line:
            continue

        def walk(o, d=0):
            if d > 12:
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
                    fp = str(args.get("path") or "")
                    old = args.get("old_string") or ""
                    new = args.get("new_string") or ""
                    if "tradingViewSymbols" in fp.replace("\\", "/") and (
                        "NATIVE_TIMEFRAMES" in old + new
                        or ("3m" in new and "NATIVE" in old + new)
                    ):
                        print(f"L{line_no} {name} {fp}")
                        print("OLD:\n", old[:1200])
                        print("NEW:\n", new[:1200])
                        print("---")
                for v in o.values():
                    walk(v, d + 1)
            elif isinstance(o, list):
                for i in o:
                    walk(i, d + 1)

        try:
            walk(json.loads(line))
        except Exception:
            pass
