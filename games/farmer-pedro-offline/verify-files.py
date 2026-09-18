#!/usr/bin/env python3
"""Offline package integrity checks; uses only the Python standard library."""

from __future__ import annotations

import base64
import hashlib
import json
from pathlib import Path
import re
import struct
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
ERRORS: list[str] = []
WARNINGS: list[str] = []


def fail(message: str) -> None:
    ERRORS.append(message)


required = [
    "index.html",
    "game/game.js",
    "game/game.css",
    "game/media/babylon/scene.babylon",
    "game/media/babylon/farmer/farmer.glb",
    "game/media/babylon/island.glb",
    "game/vendor/babylon/draco_wasm_wrapper_gltf.js",
    "game/vendor/babylon/draco_decoder_gltf.wasm",
    "offline-adapter.js",
    "embedded-resources.js",
    "READ-ME.txt",
    "CODE-STRUCTURE.md",
    "file-manifest.json",
]
for relative in required:
    path = ROOT / relative
    if not path.is_file() or path.stat().st_size == 0:
        fail(f"Missing or empty required file: {relative}")

for forbidden in ("START-WINDOWS.bat", "START-MAC-LINUX.sh", "start-game.py", "start-game.js"):
    if (ROOT / forbidden).exists():
        fail(f"Forbidden launcher exists: {forbidden}")

# Every standalone JSON file must parse.
for path in ROOT.rglob("*.json"):
    try:
        json.loads(path.read_text(encoding="utf-8"))
    except Exception as error:
        fail(f"Invalid JSON {path.relative_to(ROOT)}: {error}")

# Babylon scene JSON and external texture references.
try:
    scene = json.loads((ROOT / "game/media/babylon/scene.babylon").read_text(encoding="utf-8"))
    scene_textures: set[str] = set()

    def walk(value: object) -> None:
        if isinstance(value, dict):
            for child in value.values():
                walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)
        elif isinstance(value, str) and re.search(r"\.(?:png|jpe?g|dds|env|hdr)$", value, re.I):
            scene_textures.add(value)

    walk(scene)
    for texture in scene_textures:
        if not (ROOT / "game/media/babylon" / texture).is_file():
            fail(f"Missing Babylon scene texture: {texture}")
except Exception as error:
    fail(f"Could not validate Babylon scene: {error}")

# GLB container, version, declared length, and Draco requirement.
for relative in ("game/media/babylon/farmer/farmer.glb", "game/media/babylon/island.glb"):
    path = ROOT / relative
    if not path.is_file():
        continue
    data = path.read_bytes()
    try:
        magic, version, declared = struct.unpack_from("<4sII", data, 0)
        if magic != b"glTF" or version != 2 or declared != len(data):
            fail(f"Invalid GLB header: {relative}")
            continue
        json_length, json_type = struct.unpack_from("<II", data, 12)
        if json_type != 0x4E4F534A:
            fail(f"Missing GLB JSON chunk: {relative}")
            continue
        document = json.loads(data[20 : 20 + json_length].rstrip(b"\0 ").decode("utf-8"))
        if "KHR_draco_mesh_compression" not in document.get("extensionsRequired", []):
            WARNINGS.append(f"Expected Draco extension not marked required: {relative}")
    except Exception as error:
        fail(f"Could not validate GLB {relative}: {error}")

# Basic signatures for original media.
signatures = {
    ".png": (b"\x89PNG\r\n\x1a\n",),
    ".jpg": (b"\xff\xd8\xff",),
    ".jpeg": (b"\xff\xd8\xff",),
    ".woff": (b"wOFF", b"wOF2"),
    ".ttf": (b"\x00\x01\x00\x00", b"OTTO"),
    ".wasm": (b"\x00asm",),
}
for path in (ROOT / "game").rglob("*"):
    if not path.is_file():
        continue
    expected = signatures.get(path.suffix.lower())
    if expected and not any(path.read_bytes().startswith(signature) for signature in expected):
        fail(f"Bad file signature: {path.relative_to(ROOT)}")
    if path.suffix.lower() == ".mp3":
        head = path.read_bytes()[:3]
        if head != b"ID3" and not (len(head) >= 2 and head[0] == 0xFF and head[1] & 0xE0 == 0xE0):
            fail(f"Bad MP3 signature: {path.relative_to(ROOT)}")

# Decode the embedded table and compare every byte against game/media and game/vendor.
embedded_path = ROOT / "embedded-resources.js"
if embedded_path.is_file():
    source = embedded_path.read_text(encoding="utf-8")
    prefix = "window.__FARMER_PEDRO_RESOURCES__="
    if not source.startswith(prefix):
        fail("Embedded resource table prefix is missing")
    else:
        table_end = source.find(";", len(prefix))
        try:
            table = json.loads(source[len(prefix) : table_end])
            disk_files = {
                path.relative_to(ROOT / "game").as_posix(): path
                for folder in (ROOT / "game/media", ROOT / "game/vendor")
                for path in folder.rglob("*")
                if path.is_file()
            }
            if set(table) != set(disk_files):
                fail(f"Embedded table/disk mismatch: embedded={len(table)}, disk={len(disk_files)}")
            for key, path in disk_files.items():
                try:
                    decoded = base64.b64decode(table[key]["base64"], validate=True)
                    if decoded != path.read_bytes():
                        fail(f"Embedded bytes differ: {key}")
                except Exception as error:
                    fail(f"Invalid embedded resource {key}: {error}")
        except Exception as error:
            fail(f"Embedded table is not valid JSON: {error}")

# Required public resource literals must be present on disk.
literal_sources = [ROOT / "game/game.js", ROOT / "game/game.css"]
for source_path in literal_sources:
    text = source_path.read_text(encoding="utf-8", errors="replace")
    for relative in set(re.findall(r"media/[A-Za-z0-9_./-]+\.(?:png|jpe?g|svg|mp3|woff|ttf|glb|babylon)", text, re.I)):
        if not (ROOT / "game" / relative).is_file():
            fail(f"Missing referenced asset: {relative}")

# Offline entry must not request a web host or localhost.
for relative in ("index.html", "offline-adapter.js"):
    text = (ROOT / relative).read_text(encoding="utf-8")
    if re.search(r"https?://|localhost|127\.0\.0\.1", text, re.I):
        fail(f"Network/server URL found in offline entry layer: {relative}")

# Run JavaScript syntax checks when Node is available; gameplay does not require Node.
try:
    scripts = [
        ROOT / "offline-adapter.js",
        ROOT / "embedded-resources.js",
        ROOT / "game/game.js",
        ROOT / "game/vendor/babylon/draco_wasm_wrapper_gltf.js",
        ROOT / "game/vendor/babylon/draco_decoder_gltf.js",
    ]
    for script in scripts:
        result = subprocess.run(["node", "--check", str(script)], capture_output=True, text=True, timeout=120)
        if result.returncode:
            fail(f"JavaScript syntax error in {script.relative_to(ROOT)}: {result.stderr.strip()}")
except FileNotFoundError:
    WARNINGS.append("Node is unavailable; JavaScript syntax checks were skipped")
except subprocess.TimeoutExpired as error:
    fail(f"JavaScript syntax check timed out: {error.cmd[-1]}")

# Verify the generated SHA-256 list if present.
checksum_path = ROOT / "checksums.sha256"
if checksum_path.is_file():
    for line in checksum_path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        digest, relative = line.split("  ", 1)
        path = ROOT / relative
        if not path.is_file():
            fail(f"Checksummed file is missing: {relative}")
        elif hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            fail(f"Checksum mismatch: {relative}")

print(f"Verification completed with {len(ERRORS)} error(s) and {len(WARNINGS)} warning(s).")
for warning in WARNINGS:
    print(f"WARNING: {warning}")
for error in ERRORS:
    print(f"ERROR: {error}")
sys.exit(1 if ERRORS else 0)
