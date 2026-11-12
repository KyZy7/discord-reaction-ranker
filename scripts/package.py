"""Build and verify a reproducible, allowlisted unpacked-extension ZIP (stdlib only)."""
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent.parent
RUNTIME = [
    "manifest.json", "background.js", "core.js", "core-main.js",
    "forum-names.js", "observer.js", "panel.js", "LICENSE", "INSTALL.md",
    *[f"icons/icon-{size}.png" for size in (16, 32, 48, 128)],
]


def build():
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    version = manifest["version"]
    assert version == json.loads((ROOT / "package.json").read_text())["version"], "Version mismatch"
    destination = ROOT / "dist"
    destination.mkdir(exist_ok=True)
    archive = destination / f"discord-reaction-ranker-{version}.zip"
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as package:
        for name in sorted(RUNTIME):
            source = ROOT / name
            if source.is_symlink():
                raise ValueError(f"Refusing symlink: {name}")
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            # Keep metadata identical on Windows and Linux release builders.
            info.create_system = 3
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            package.writestr(info, source.read_bytes())
    with zipfile.ZipFile(archive) as package:
        assert set(package.namelist()) == set(RUNTIME), "Unexpected archive contents"
        assert package.testzip() is None, "Corrupt archive"
        assert json.loads(package.read("manifest.json")) == manifest
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    (destination / f"{archive.name}.sha256").write_text(f"{digest}  {archive.name}\n", encoding="ascii")
    print(f"Created {archive.name}: {len(RUNTIME)} allowlisted files; SHA-256 {digest}")


if __name__ == "__main__":
    build()
