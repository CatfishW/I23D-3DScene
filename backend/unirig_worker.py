#!/usr/bin/env python3
"""
UniRig Worker - Auto-rigging for 3D models with automatic skinning
"""

import os
import subprocess
import shutil
import logging
import uuid
import sys

logger = logging.getLogger("unirig_worker")

UNIRIG_DIR = "/data/Yanlai/image-to-3d-web/UniRig"
UNIRIG_WRAPPER = "/data/Yanlai/image-to-3d-web/backend/run_unirig_complete.sh"
SAVE_DIR = "/data/Yanlai/image-to-3d-web/backend/gradio_cache"
BLENDER_SKIN_SCRIPT = "/data/Yanlai/image-to-3d-web/backend/auto_skin.py"


class UniRigWorker:
    def __init__(self, device="cuda:1"):
        self.device = device
        self.cuda_device = device.split(":")[-1] if "cuda" in device else "0"
        os.makedirs(SAVE_DIR, exist_ok=True)
        logger.info(f"UniRig worker initialized, device: {device}")

    def auto_skin(self, mesh_path, skeleton_path, output_path):
        """Apply automatic skin weights using Blender"""
        logger.info(f"Applying auto-skinning to {mesh_path}")

        env = os.environ.copy()
        env["AUTO_SKIN_MESH"] = mesh_path
        env["AUTO_SKIN_SKELETON"] = skeleton_path
        env["AUTO_SKIN_OUTPUT"] = output_path

        cmd = [
            "blender",
            "-b",
            "--python",
            BLENDER_SKIN_SCRIPT,
        ]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300,
            env=env,
        )

        logger.info(f"Blender auto-skin return: {result.returncode}")
        if result.returncode != 0:
            logger.error(f"Blender error: {result.stderr[-500:]}")
            raise RuntimeError(f"Auto-skinning failed: {result.stderr[-500:]}")

        if not os.path.exists(output_path):
            raise RuntimeError(f"Auto-skinned file not created: {output_path}")

        logger.info(f"Auto-skinned model saved to: {output_path}")
        return output_path

    def rig_mesh(self, mesh_path, output_path=None, uid=None):
        """Rig a 3D mesh using UniRig - skeleton + auto-skinning"""
        if not os.path.exists(mesh_path):
            raise FileNotFoundError(f"Input mesh not found: {mesh_path}")

        logger.info(f"Rigging mesh: {mesh_path}")

        task_id = uid or str(uuid.uuid4())[:8]

        if output_path is None:
            output_path = os.path.join(SAVE_DIR, f"{task_id}_rigged.fbx")

        skeleton_output = f"/tmp/{task_id}_skeleton.fbx"

        try:
            # Step 1: Generate skeleton using UniRig
            cmd = f"bash {UNIRIG_WRAPPER} {self.cuda_device} {os.path.abspath(mesh_path)} {skeleton_output}"
            logger.info(f"Running: {cmd}")

            result = subprocess.run(
                cmd,
                shell=True,
                capture_output=True,
                text=True,
                timeout=600,
                cwd=UNIRIG_DIR,
            )

            logger.info(f"Skeleton generation return: {result.returncode}")
            logger.info(f"Output: {(result.stdout + result.stderr)[-500:]}")

            if result.returncode != 0:
                raise RuntimeError(
                    f"Skeleton generation failed: {(result.stdout + result.stderr)[-500:]}"
                )

            if not os.path.exists(skeleton_output):
                raise RuntimeError(f"Skeleton not created at {skeleton_output}")

            # Step 2: Apply auto-skinning using Blender
            logger.info(f"Applying auto-skinning to skeleton...")
            skinned_output = f"/tmp/{task_id}_skinned.glb"

            try:
                self.auto_skin(mesh_path, skeleton_output, skinned_output)
                logger.info(f"Auto-skin succeeded, copying from: {skinned_output}")
                if os.path.exists(skinned_output):
                    shutil.copy(skinned_output, output_path)
                    logger.info(
                        f"Rigged model with skin weights saved to: {output_path}"
                    )
                else:
                    logger.warning(
                        f"Skinned file not found at {skinned_output}, falling back to skeleton"
                    )
                    # Skeleton is FBX, so use .fbx extension for the output
                    output_path = output_path.rsplit('.', 1)[0] + '.fbx'
                    shutil.copy(skeleton_output, output_path)
            except Exception as e:
                logger.warning(
                    f"Auto-skinning failed: {e}, falling back to skeleton only"
                )
                # Fallback: use skeleton without skin weights
                # Skeleton is FBX, so use .fbx extension for the output
                output_path = output_path.rsplit('.', 1)[0] + '.fbx'
                shutil.copy(skeleton_output, output_path)

            return output_path

        except Exception as e:
            logger.error(f"Rigging failed: {e}")
            raise


def rig_model(mesh_path, output_path=None, device="cuda:1"):
    worker = UniRigWorker(device=device)
    return worker.rig_mesh(mesh_path, output_path)


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
    )
    if len(sys.argv) < 2:
        print("Usage: python unirig_worker.py <input_mesh> [output_mesh]")
        sys.exit(1)
    input_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else None
    result = rig_model(input_path, output_path)
    print(f"Rigged model saved to: {result}")
