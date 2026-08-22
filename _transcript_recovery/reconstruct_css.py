import json
import os
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

path = r"C:\Users\Welcome\.cursor\projects\c-Users-Welcome-Desktop-mmtt\agent-transcripts\0308c88f-94cc-4f05-b31f-055d4703040b\0308c88f-94cc-4f05-b31f-055d4703040b.jsonl"
out_dir = r"C:\Users\Welcome\Desktop\mmtt\_transcript_recovery"

# Collect all ops for specific files in late window, reconstruct CSS, dump secondary patches
targets = {
    "index.css": [],
    "NativeChatChart.tsx": [],
    "App.tsx": [],
    "Sidebar.tsx": [],
    "CommandPalette.tsx": [],
    "brandLabels.ts": [],
    "marketApiService.ts": [],
    "tradingViewSymbols.ts": [],
}

line_no = 0
with open(path, "r", encoding="utf-8") as f:
    for line in f:
        line_no += 1
        if line_no < 9600:
            # still collect marketApi earlier for bars if needed - actually collect all for marketApi from 9500
            pass
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
                    for n in targets:
                        if n.lower() in fpath.lower():
                            # gate by line for most; marketApi from 9600 too
                            if line_no >= 9600 or (
                                n == "marketApiService.ts" and line_no >= 9580
                            ):
                                targets[n].append(
                                    {
                                        "line": line_no,
                                        "tool": "Write"
                                        if name.lower() == "write"
                                        else "StrReplace",
                                        "args": args,
                                    }
                                )
                for v in o.values():
                    walk(v, depth + 1)
            elif isinstance(o, list):
                for i in o:
                    walk(i, depth + 1)

        walk(obj)

# Reconstruct wolf-term CSS by chaining StrReplace that mention wolf-term.
# Strategy: start empty synthetic file containing only the common old_string anchors from first patch,
# OR extract successive new_strings that replace the whole wolf-term block.

css_ops = targets["index.css"]
print(f"index.css late ops: {len(css_ops)}")

# Find wolf-term related and apply sequentially on a running buffer.
# We'll simulate: for each StrReplace, if old in buffer replace; else if old looks like pre-marker,
# set buffer to contain pre + new after matching.

buffer = None
# Seed: many ops start with light theme auth backdrop ending
for o in css_ops:
    a = o["args"]
    old = a.get("old_string") or ""
    new = a.get("new_string") or ""
    blob = old + new
    if "wolf-term" not in blob and "app-main--terminal" not in blob:
        print(f"  L{o['line']} skip non-terminal css")
        continue
    if buffer is None:
        # Initialize buffer as old_string content so first replace works,
        # then apply
        buffer = old
        if old in buffer:
            buffer = buffer.replace(old, new, 1)
            print(f"  L{o['line']} init+apply -> {len(buffer)}")
        else:
            buffer = new
            print(f"  L{o['line']} init as new -> {len(buffer)}")
    else:
        if old in buffer:
            buffer = buffer.replace(old, new, 1)
            print(f"  L{o['line']} apply hit -> {len(buffer)}")
        else:
            # try fuzzy: if new contains wolf-term fully, maybe replace from /* Wolf Terminal */
            marker = "/* ─── Wolf Terminal"
            if marker in buffer and marker in new:
                # replace from marker to end-ish
                idx = buffer.find(marker)
                # find marker in new
                nidx = new.find(marker)
                # This StrReplace often replaces a small tail AND appends large new section.
                # If miss, append approach: replace last N matching unique prefix
                print(f"  L{o['line']} MISS exact; old_len={len(old)} trying marker splice")
                # Often old_string is the END of previous wolf-term section
                # Search for unique start of old in buffer
                # Try first 80 chars of old
                tip = old[:80]
                pos = buffer.rfind(tip)
                if pos >= 0 and old in buffer[pos : pos + len(old) + 50]:
                    # find exact
                    if old in buffer[pos:]:
                        buffer = buffer[:pos] + buffer[pos:].replace(old, new, 1)
                        print(f"  L{o['line']} rfind apply -> {len(buffer)}")
                    else:
                        print(f"  L{o['line']} FAILED")
                else:
                    # Save miss as standalone fragment
                    print(f"  L{o['line']} FAILED - saving as fragment overlay")
                    with open(
                        os.path.join(out_dir, f"_css_miss_L{o['line']}.txt"),
                        "w",
                        encoding="utf-8",
                    ) as wf:
                        wf.write("OLD:\n")
                        wf.write(old)
                        wf.write("\n\nNEW:\n")
                        wf.write(new)
            else:
                tip = old[:100]
                pos = buffer.rfind(tip)
                if pos >= 0 and buffer[pos : pos + len(old)] == old:
                    buffer = buffer[:pos] + new + buffer[pos + len(old) :]
                    print(f"  L{o['line']} slice apply -> {len(buffer)}")
                else:
                    print(f"  L{o['line']} FAILED exact match")
                    with open(
                        os.path.join(out_dir, f"_css_miss_L{o['line']}.txt"),
                        "w",
                        encoding="utf-8",
                    ) as wf:
                        wf.write("OLD:\n")
                        wf.write(old)
                        wf.write("\n\nNEW:\n")
                        wf.write(new)

if buffer:
    # Extract wolf-term section and terminal immersive
    with open(os.path.join(out_dir, "_wolf_term_css_reconstructed.css"), "w", encoding="utf-8") as wf:
        wf.write(buffer)
    print(f"Wrote reconstructed CSS buffer len={len(buffer)}")

# Dump marketApiService late ops fully
print("\nmarketApiService late ops:")
for o in targets["marketApiService.ts"]:
    a = o["args"]
    old = a.get("old_string") or ""
    new = a.get("new_string") or ""
    c = a.get("contents") or a.get("content") or ""
    print(f"  L{o['line']} {o['tool']} old={len(old)} new={len(new)} write={len(c)}")
    if "bar" in (old + new + c).lower() or "history" in (old + new + c).lower():
        print("    -> history/bars related")
        with open(
            os.path.join(out_dir, f"_marketApi_L{o['line']}.md"), "w", encoding="utf-8"
        ) as wf:
            if o["tool"] == "Write":
                wf.write(c)
            else:
                wf.write("### old\n```\n" + old + "\n```\n### new\n```\n" + new + "\n```\n")

# Dump ALL NativeChatChart late strreplaces to a single recovery doc
with open(os.path.join(out_dir, "_NativeChatChart_late_patches.md"), "w", encoding="utf-8") as wf:
    wf.write("# NativeChatChart late StrReplace patches (apply order)\n\n")
    for o in targets["NativeChatChart.tsx"]:
        a = o["args"]
        old = a.get("old_string") or ""
        new = a.get("new_string") or ""
        c = a.get("contents") or a.get("content") or ""
        wf.write(f"## L{o['line']} {o['tool']}\n\n")
        if o["tool"] == "Write":
            wf.write(f"```tsx\n{c}\n```\n\n")
        else:
            wf.write(f"### old_string\n```tsx\n{old}\n```\n\n")
            wf.write(f"### new_string\n```tsx\n{new}\n```\n\n")

# Dump App/Sidebar/CommandPalette/brandLabels patches
for name in ("App.tsx", "Sidebar.tsx", "CommandPalette.tsx", "brandLabels.ts", "tradingViewSymbols.ts"):
    with open(os.path.join(out_dir, f"_{name}_late_patches.md"), "w", encoding="utf-8") as wf:
        wf.write(f"# {name} late patches\n\n")
        for o in targets[name]:
            a = o["args"]
            old = a.get("old_string") or ""
            new = a.get("new_string") or ""
            blob = old + new
            if name in ("App.tsx", "Sidebar.tsx", "CommandPalette.tsx", "brandLabels.ts"):
                if "terminal" not in blob.lower() and "Terminal" not in blob:
                    continue
            elif name == "tradingViewSymbols.ts":
                if "3m" not in blob and "month" not in blob.lower() and "terminal" not in blob.lower():
                    # keep if native study
                    if "NATIVE_STUDY" not in blob and "3" not in blob:
                        continue
            wf.write(f"## L{o['line']} {o['tool']}\n\n")
            wf.write(f"### old_string\n```\n{old}\n```\n\n")
            wf.write(f"### new_string\n```\n{new}\n```\n\n")

print("Done writing patch docs")
