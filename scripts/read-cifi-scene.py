"""Read only packaged Unity scene configuration; never opens player save data."""
from pathlib import Path
import sys
import json
import zipfile
from collections import Counter

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "work/cifi-static-0.7.3.63"
sys.path.insert(0, str(WORK / "tools/python"))
import UnityPy
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator

env = UnityPy.Environment()
generator = TypeTreeGenerator("6000.3.22f1")
generator.load_local_dll_folder(str(WORK / "dummy-attributes"))
with zipfile.ZipFile(WORK / "base.apk") as archive:
    for name in ("globalgamemanagers.assets", "level0"):
        parts = sorted((p for p in archive.namelist() if p.startswith("assets/bin/Data/" + name + ".split")), key=lambda p: int(p.rsplit("split", 1)[1]))
        payload = b"".join(archive.read(p) for p in parts)
        env.load_file(payload, name=name)
print(Counter(o.type.name for o in env.objects))
scripts = {}
for obj in env.objects:
    if obj.type.name == "MonoScript":
        data = obj.read()
        scripts[(obj.assets_file.name, obj.path_id)] = data.m_ClassName
        if data.m_ClassName in ("LoopModifiers", "TextHandlerLoopMods", "LoopModsAssist"):
            print("SCRIPT", obj.assets_file.name, obj.path_id, data.m_ClassName)
for obj in env.objects:
    if obj.type.name != "MonoBehaviour":
        continue
    data = obj.read(check_read=False)
    try:
        script = data.m_Script.read()
    except Exception:
        continue
    if script.m_ClassName not in ("LoopModifiers", "TextHandlerLoopMods", "LoopModsAssist"):
        continue
    print("COMPONENT", obj.assets_file.name, obj.path_id, script.m_ClassName, "size", obj.byte_size)
    target = WORK / "scene"
    target.mkdir(exist_ok=True)
    (target / (script.m_ClassName + ".bin")).write_bytes(obj.get_raw_data())
    try:
        env.typetree_generator = generator
        tree = obj.read_typetree()
        (target / (script.m_ClassName + ".json")).write_text(json.dumps(tree, ensure_ascii=False, indent=2), encoding="utf-8")
        print("TREE", len(tree), list(tree)[:10])
    except Exception as exc:
        print("TREE ERROR", type(exc).__name__, str(exc)[:300])
    finally:
        env.typetree_generator = None

# Resolve only Mod Tree UI references. The JSON is analysis evidence, not a
# redistributable localization dump; raw packaged text remains under work/.
scene = env.files["level0"]
def read_object(path_id):
    obj = scene.objects[path_id]
    env.typetree_generator = generator
    try:
        return obj.read_typetree()
    finally:
        env.typetree_generator = None

def component_ids(go_id):
    return [x["component"]["m_PathID"] for x in read_object(go_id)["m_Component"]]

def transform_id(go_id):
    return next(i for i in component_ids(go_id) if scene.objects[i].type.name in ("RectTransform", "Transform"))

def child_texts(transform, depth=0):
    data = read_object(transform)
    go = data["m_GameObject"]["m_PathID"]
    texts = []
    for cid in component_ids(go):
        if scene.objects[cid].type.name != "MonoBehaviour":
            continue
        head = scene.objects[cid].read(check_read=False)
        if head.m_Script.read().m_ClassName not in ("Text", "TextMeshProUGUI"):
            continue
        text = read_object(cid).get("m_Text")
        if text:
            texts.append({"object": read_object(go)["m_Name"], "text": text, "component": cid})
    if depth < 2:
        for child in data.get("m_Children", []):
            texts += child_texts(child["m_PathID"], depth + 1)
    return texts

ui = {}
text_fields = json.loads((WORK / "scene/TextHandlerLoopMods.json").read_text(encoding="utf-8"))
for name, pointer in text_fields.items():
    if "Bonus" not in name or not isinstance(pointer, dict) or not pointer.get("m_PathID"):
        continue
    data = read_object(pointer["m_PathID"])
    transform = transform_id(data["m_GameObject"]["m_PathID"])
    parent = read_object(transform)["m_Father"]["m_PathID"]
    ui[name] = child_texts(parent)
(WORK / "scene/ModBonusLabels.json").write_text(json.dumps(ui, ensure_ascii=False, indent=2), encoding="utf-8")
print("UI", len(ui))
