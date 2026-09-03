"""
Meshora headless Blender bridge.
Usage:
  blender -b input.blend -P blender_export.py -- --out /path/out.glb --format glb
  blender -b -P blender_export.py -- --in /path/in.glb --out /path/out.fbx --format fbx
"""
from __future__ import annotations

import argparse
import sys


def parse_args(argv):
    parser = argparse.ArgumentParser(description="Meshora Blender export bridge")
    parser.add_argument("--in", dest="inp", default=None, help="Input file (optional when opened via blender -b file)")
    parser.add_argument("--out", required=True, help="Output file path")
    parser.add_argument(
        "--format",
        choices=("fbx", "glb", "gltf"),
        default="glb",
        help="Export format",
    )
    return parser.parse_args(argv)


def clear_scene(bpy):
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_file(bpy, path: str):
    lower = path.lower()
    if lower.endswith(".blend"):
        bpy.ops.wm.open_mainfile(filepath=path)
        return
    if lower.endswith(".glb") or lower.endswith(".gltf"):
        bpy.ops.import_scene.gltf(filepath=path)
        return
    if lower.endswith(".fbx"):
        bpy.ops.import_scene.fbx(filepath=path)
        return
    if lower.endswith(".obj"):
        if hasattr(bpy.ops.wm, "obj_import"):
            bpy.ops.wm.obj_import(filepath=path)
        else:
            bpy.ops.import_scene.obj(filepath=path)
        return
    raise RuntimeError(f"Unsupported input for Blender bridge: {path}")


def export_file(bpy, path: str, fmt: str):
    if fmt == "fbx":
        # Prefer geometry as authored; no remesh/decimate.
        kwargs = dict(
            filepath=path,
            use_selection=False,
            apply_scale_options="FBX_SCALE_ALL",
            bake_space_transform=False,
            use_mesh_modifiers=True,
            mesh_smooth_type="FACE",
            add_leaf_bones=False,
        )
        try:
            bpy.ops.export_scene.fbx(**kwargs)
        except TypeError:
            bpy.ops.export_scene.fbx(filepath=path, use_selection=False)
        return
    if fmt == "glb":
        bpy.ops.export_scene.gltf(
            filepath=path,
            export_format="GLB",
            use_selection=False,
        )
        return
    if fmt == "gltf":
        bpy.ops.export_scene.gltf(
            filepath=path,
            export_format="GLTF_SEPARATE",
            use_selection=False,
        )
        return
    raise RuntimeError(f"Unknown format: {fmt}")


def main():
    import bpy  # only available inside Blender

    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    else:
        argv = []
    args = parse_args(argv)

    # If blender was launched with -b file.blend, that file is already loaded.
    # When --in is provided, reset and load/import explicitly.
    if args.inp:
        clear_scene(bpy)
        import_file(bpy, args.inp)

    export_file(bpy, args.out, args.format)
    print(f"[meshora] exported {args.format} -> {args.out}")


if __name__ == "__main__":
    main()
