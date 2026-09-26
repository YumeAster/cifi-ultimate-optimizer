"""Export resource icons from a supplied CIFI Unity APK without running it.

Usage: python scripts/extract-resource-assets.py --source PATH [--out PATH]
PATH contains base.apk and the local UnityPy tools/python directory used by the
existing Ship Install extractor. The APK is read-only; output PNGs are original
Unity Texture2D/Sprite pixels, not redrawn approximations.
"""

from argparse import ArgumentParser
from pathlib import Path
import hashlib
import json
import sys
import zipfile


ROOT = Path(__file__).resolve().parents[1]
TEXTURES = {
    "ResourceCells-128": "cells.png",
    "ModPoints-128": "mod-points.png",
    "Shards-128": "shards.png",
    "ResearchPoints-128": "research-points.png",
    "AcademyPoints-128": "academy-points.png",
    "AdTokens-128": "ad-tokens.png",
    "ResourceDiamond-128": "diamonds.png",
    "Resource-ArcadePoints-64": "arcade-points.png",
    "LevelPoints-128": "level-points.png",
    "LM-TickTime-128": "tick.png",
    "Operations-128": "operations.png",
    "LM-LoopMods-128": "loop-mods.png",
    "LM-GeneratorCost-128": "cost-reduction.png",
    "RankPoints-128": "rank-points.png",
    "RU-Tech1-128": "technology.png",
}
SPRITES = {"Materials": "materials.png", "AllGens": "generator.png"}


def main():
    parser = ArgumentParser()
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--out", type=Path, default=ROOT / "public/assets/resources")
    args = parser.parse_args()
    source = args.source.resolve()
    output = args.out.resolve()
    sys.path.insert(0, str(source / "tools/python"))
    import UnityPy

    env = UnityPy.Environment()
    archive_path = source / "base.apk"
    with zipfile.ZipFile(archive_path) as archive:
        for name in ("globalgamemanagers.assets", "sharedassets0.assets"):
            prefix = "assets/bin/Data/" + name + ".split"
            parts = sorted((entry for entry in archive.namelist() if entry.startswith(prefix)),
                           key=lambda entry: int(entry.rsplit("split", 1)[1]))
            if not parts:
                raise RuntimeError(f"Missing Unity asset: {name}")
            env.load_file(b"".join(archive.read(entry) for entry in parts), name=name)

    output.mkdir(parents=True, exist_ok=True)
    records = {}
    for asset in env.files.values():
        if not hasattr(asset, "objects"):
            continue
        for obj in asset.objects.values():
            if obj.type.name == "Texture2D":
                texture = obj.read()
                name = texture.m_Name
                if name in TEXTURES and name not in records:
                    filename = TEXTURES[name]
                    texture.image.save(output / filename)
                    records[name] = {"file": filename, "sourceType": "Texture2D", "sourceName": name, "pathId": obj.path_id}
            elif obj.type.name == "Sprite":
                sprite = obj.read()
                name = sprite.m_Name
                if name in SPRITES and name not in records:
                    filename = SPRITES[name]
                    sprite.image.save(output / filename)
                    records[name] = {"file": filename, "sourceType": "Sprite", "sourceName": name, "pathId": obj.path_id}

    missing = (set(TEXTURES) | set(SPRITES)) - records.keys()
    if missing:
        raise RuntimeError(f"APK resources missing: {sorted(missing)}")
    for record in records.values():
        record["sha256"] = hashlib.sha256((output / record["file"]).read_bytes()).hexdigest()
    provenance = {
        "apkSha256": hashlib.sha256(archive_path.read_bytes()).hexdigest(),
        "method": "Read-only Unity Texture2D/Sprite export; unmodified game pixels",
        "records": list(records.values()),
    }
    (output / "provenance.json").write_text(json.dumps(provenance, indent=2), encoding="utf-8")
    print(json.dumps({"exported": len(records), "files": sorted(item["file"] for item in records.values())}))


if __name__ == "__main__":
    main()
