"""Build the two userscript variants and Chrome extensions from eBirdHelper.js."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "eBirdHelper.js"


def read_json(name: str) -> object:
    return json.loads((ROOT / name).read_text(encoding="utf-8"))


def parse_version(source_text: str) -> str:
    m = re.search(r"@version\s+([^\s]+)", source_text)
    return m.group(1) if m else "0.0.0"


def refresh_inline_data(source: str) -> str:
    for name, path in [('birdMap', 'birdMap.json'), ('pinyin_map', 'pinyin_mapping.json')]:
        start = f"// @ebh-inline-{name}-start"
        end = f"// @ebh-inline-{name}-end"
        pattern = rf"{re.escape(start)}[\s\S]*?{re.escape(end)}"
        value = json.dumps(read_json(path), ensure_ascii=False, indent=4)
        block = f"{start}\nconst {name} = {value};\n{end}"
        source, count = re.subn(pattern, lambda _: block, source, count=1)
        if count != 1:
            raise RuntimeError(f"Inline marker block for {name} not found in eBirdHelper.js")
    return source


def rename_script(text: str, suffix: str) -> str:
    """Append suffix to @name, so Tampermonkey shows (and keeps) the bundle apart from eBirdHelper.js."""
    text, n = re.subn(r"^(//\s*@name\s+)(.*?)\s*$", lambda m: f"{m.group(1)}{m.group(2)}{suffix}", text, count=1, flags=re.MULTILINE)
    if n != 1:
        raise RuntimeError("@name not found in eBirdHelper.js")
    return text


def strip_userscript_header(text: str) -> str:
    return re.sub(
        r"// ==UserScript==[\s\S]*?// ==/UserScript==\s*",
        "",
        text,
        count=1,
    )


def build_single(branch: str, source: str) -> Path:
    bundle_name = "eBirdHelperSingleFile.js" if branch == "main" else "eBirdHelperSingleFile.dev.js"
    dest = ROOT / bundle_name

    output = rename_script(source, "（单文件版）" if branch == "main" else "（单文件 dev 版）")

    dest.write_text(output, encoding="utf-8", newline="\n")
    print(f"Wrote {branch} bundle to {dest}")
    return dest


def write_manifest(dest_dir: Path, version: str, branch: str) -> None:
    name = "eBird Helper" if branch == "main" else "eBird Helper (dev)"
    manifest = {
        "manifest_version": 3,
        "name": name,
        "version": version,
        "description": "Translate bird names and add @pinyin shortcuts on eBird.",
        "content_scripts": [
            {
                "matches": ["https://ebird.org/*"],
                "js": ["content.js"],
                "run_at": "document_idle",
            }
        ],
    }
    dest_dir.mkdir(parents=True, exist_ok=True)
    (dest_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


def build_extension(branch: str, source: str, version: str) -> Path:
    out_dir = ROOT / "dist" / f"chrome-extension-{branch}"
    out_dir.mkdir(parents=True, exist_ok=True)

    code = '(() => {\n' + strip_userscript_header(source) + '\n})();\n'
    (out_dir / "content.js").write_text(code, encoding="utf-8", newline="\n")
    write_manifest(out_dir, version, branch)

    print(f"Wrote Chrome extension ({branch}) to {out_dir}")
    return out_dir


def main() -> None:
    parser = argparse.ArgumentParser(description="Build single-file userscripts and Chrome extension")
    parser.add_argument(
        "--branch",
        choices=["main", "dev", "both"],
        default="both",
        help="Which named variants to build (default: both).",
    )
    parser.add_argument(
        "--extension-only",
        action="store_true",
        help="Only build Chrome extension outputs (skip userscripts).",
    )
    args = parser.parse_args()

    source_text = SOURCE.read_text(encoding="utf-8")
    source = refresh_inline_data(source_text)
    if source != source_text:
        SOURCE.write_text(source, encoding="utf-8", newline="\n")
    version = parse_version(source)

    branches = ["main", "dev"] if args.branch == "both" else [args.branch]

    for br in branches:
        if not args.extension_only:
            build_single(br, source)
        build_extension(br, source, version)


if __name__ == "__main__":
    main()
