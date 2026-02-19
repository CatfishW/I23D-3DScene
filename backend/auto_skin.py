#!/usr/bin/env python3
"""
Automatic skinning script using Blender.
Loads a mesh and skeleton, then automatically applies skin weights.
"""

import bpy
import os
import sys

# Get arguments from environment (for Blender 3.0.1 compatibility)
mesh_path = os.environ.get("AUTO_SKIN_MESH", "")
skeleton_path = os.environ.get("AUTO_SKIN_SKELETON", "")
output_path = os.environ.get("AUTO_SKIN_OUTPUT", "")

# Fallback to sys.argv if available
if not mesh_path and len(sys.argv) >= 4:
    mesh_path = sys.argv[-3]
    skeleton_path = sys.argv[-2]
    output_path = sys.argv[-1]


def clear_selection():
    bpy.ops.object.select_all(action="DESELECT")


def auto_skin(mesh_path, skeleton_path, output_path):
    """Apply automatic skin weights to mesh using skeleton"""

    # Clear scene
    clear_selection()
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()

    # Import mesh
    print(f"Importing mesh: {mesh_path}")
    bpy.ops.import_scene.gltf(filepath=mesh_path)

    # Get the mesh object
    mesh_obj = None
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            mesh_obj = obj
            break

    if not mesh_obj:
        raise RuntimeError("No mesh found in file")

    print(f"Found mesh: {mesh_obj.name}")

    # Import skeleton (FBX)
    print(f"Importing skeleton: {skeleton_path}")
    clear_selection()
    bpy.ops.import_scene.fbx(filepath=skeleton_path)

    # Find armature
    armature = None
    for obj in bpy.context.scene.objects:
        if obj.type == "ARMATURE":
            armature = obj
            break

    if not armature:
        raise RuntimeError("No armature found in skeleton file")

    print(f"Found armature: {armature.name}")

    # Parent mesh to armature with automatic weights
    clear_selection()
    mesh_obj.select_set(True)
    armature.select_set(True)
    bpy.context.view_layer.objects.active = armature

    # Parent with automatic weights
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")

    print("Applied automatic weights")

    # Find mesh and armature
    mesh_obj = None
    armature_obj = None
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            mesh_obj = obj
        if obj.type == "ARMATURE":
            armature_obj = obj

    if mesh_obj and armature_obj:
        # Detach mesh from armature if needed
        if mesh_obj.parent == armature_obj:
            mesh_obj.parent = None
            mesh_obj.matrix_world = armature_obj.matrix_world @ mesh_obj.matrix_local

        # Make armature active
        bpy.context.view_layer.objects.active = armature_obj

    # Export as GLB with proper skinning
    print(f"Exporting to: {output_path}")
    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format="GLB",
        export_apply=True,
        use_selection=False,
        export_extras=True,
        export_yup=True,
        export_skins=True,
        export_lights=False,
        export_cameras=False,
        export_texcoords=True,
        export_normals=True,
    )

    print("Done!")
    return output_path


if __name__ == "__main__":
    if not mesh_path or not skeleton_path or not output_path:
        print(
            "Usage: AUTO_SKIN_MESH=<mesh> AUTO_SKIN_SKELETON=<skel> AUTO_SKIN_OUTPUT=<out> blender -b -P auto_skin.py"
        )
        sys.exit(1)

    auto_skin(mesh_path, skeleton_path, output_path)
