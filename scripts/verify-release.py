"""Verify a fresh source copy and its extracted runtime ZIP without parent files."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent


def run(*arguments, cwd, env=None):
    subprocess.run(arguments, cwd=cwd, env=env, check=True)


with tempfile.TemporaryDirectory(prefix="reaction-ranker-release-") as temporary:
    directory = Path(temporary)
    source = directory / "source"
    shutil.copytree(ROOT, source, ignore=shutil.ignore_patterns(".git", "dist", "artifacts", "node_modules", "__pycache__"))
    run("node", "scripts/check.cjs", cwd=source)
    run("node", "--test", "tests/ranker.test.cjs", "tests/release.test.cjs", "tests/publication.test.cjs", cwd=source)
    run("python", "scripts/package.py", cwd=source)
    version = json.loads((source / "manifest.json").read_text())["version"]
    archive = source / "dist" / f"discord-reaction-ranker-{version}.zip"
    with zipfile.ZipFile(archive) as package:
        names = package.namelist()
        assert all(not Path(name).is_absolute() and ".." not in Path(name).parts for name in names)
        package.extractall(directory / "extension")
    environment = os.environ.copy()
    environment["EXTENSION_PATH"] = str(directory / "extension")
    environment.pop("SCREENSHOT_DIR", None)
    run("node", "tests/browser-smoke.cjs", cwd=source, env=environment)
    print("PASS: isolated source copy and extracted installation ZIP need no parent workspace files.")
