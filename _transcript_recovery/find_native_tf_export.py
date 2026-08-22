import json
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
path = r"C:\Users\Welcome\.cursor\projects\c-Users-Welcome-Desktop-mmtt\agent-transcripts\0308c88f-94cc-4f05-b31f-055d4703040b\0308c88f-94cc-4f05-b31f-055d4703040b.jsonl"
line_no = 0
with open(path, encoding="utf-8") as f:
    for line in f:
        line_no += 1
        if line_no < 9500:
            continue
        if "export const NATIVE_TIMEFRAMES" not in line:
            continue

        def walk(o, d=0):
            if d > 12:
                return
            if isinstance(o, dict):
                args = o.get("arguments") or o.get("args") or o.get("input") or {}
                if isinstance(args, str):
                    try:
                        args = json.loads(args)
                    except Exception:
                        args = {}
                new = args.get("new_string") or args.get("contents") or args.get("content") or ""
                old = args.get("old_string") or ""
                if "export const NATIVE_TIMEFRAMES" in new or "export const NATIVE_TIMEFRAMES" in old:
                    print("L", line_no)
                    # extract surrounding
                    for blob in (old, new):
                        i = blob.find("export const NATIVE_TIMEFRAMES")
                        if i >= 0:
                            print(blob[i : i + 600])
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
