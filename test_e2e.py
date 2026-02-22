import requests
import base64
import time
import os
import sys

BASE_URL = "http://localhost:23555"
TEST_IMAGE_PATH = "/data/Yanlai/image-to-3d-web/test_simple.png"
GRADIO_CACHE_DIR = "/data/Yanlai/image-to-3d-web/backend/gradio_cache"


def encode_image(image_path):
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def test_image_to_3d(image_b64):
    print("\n--- Testing Image-to-3D ---")
    payload = {
        "image": image_b64,
        "remove_background": True,
        "texture": True,
    }
    response = requests.post(f"{BASE_URL}/I23D/api/send", json=payload)
    if response.status_code != 200:
        print(f"Failed to start task: {response.text}")
        return None

    uid = response.json()["uid"]
    print(f"Task started with UID: {uid}")

    while True:
        status_resp = requests.get(f"{BASE_URL}/I23D/api/status/{uid}")
        status_data = status_resp.json()
        status = status_data.get("status")
        progress = status_data.get("progress", 0)
        print(f"Status: {status}, Progress: {progress}%")

        if status == "completed":
            print("Image-to-3D completed successfully!")
            return uid
        elif status == "error":
            print(f"Image-to-3D failed: {status_data.get('message')}")
            return None

        time.sleep(5)


def test_rigging(uid):
    print("\n--- Testing Rigging ---")
    mesh_path = os.path.join(GRADIO_CACHE_DIR, f"{uid}_textured.glb")
    if not os.path.exists(mesh_path):
        # Fallback to initial if textured doesn't exist
        mesh_path = os.path.join(GRADIO_CACHE_DIR, f"{uid}_initial.glb")

    print(f"Using mesh path: {mesh_path}")
    payload = {"mesh_path": mesh_path}
    response = requests.post(f"{BASE_URL}/I23D/api/rig/generate", json=payload)
    if response.status_code != 200:
        print(f"Failed to start rigging task: {response.text}")
        return False

    rig_uid = response.json()["uid"]
    print(f"Rigging task started with UID: {rig_uid}")

    while True:
        status_resp = requests.get(f"{BASE_URL}/I23D/api/rig/status/{rig_uid}")
        status_data = status_resp.json()
        status = status_data.get("status")
        print(f"Rigging Status: {status}")

        if status == "completed":
            print("Rigging completed successfully!")
            return True
        elif status == "failed":
            print(f"Rigging failed: {status_data.get('error')}")
            return False

        time.sleep(5)


def test_flashworld(image_b64):
    print("\n--- Testing FlashWorld ---")
    payload = {
        "image": image_b64,
        "generate_video": False,
        "image_height": 480,
        "image_width": 704,
        "convert_to_mesh": True,
    }
    response = requests.post(f"{BASE_URL}/I23D/api/flashworld/generate", json=payload)
    if response.status_code != 202:
        print(f"Failed to start FlashWorld task: {response.text}")
        return False

    fw_uid = response.json()["uid"]
    print(f"FlashWorld task started with UID: {fw_uid}")

    while True:
        status_resp = requests.get(f"{BASE_URL}/I23D/api/flashworld/status/{fw_uid}")
        status_data = status_resp.json()
        status = status_data.get("status")
        progress = status_data.get("progress", 0)
        stage = status_data.get("stage", "unknown")
        print(f"FlashWorld Status: {status}, Progress: {progress}%, Stage: {stage}")

        if status == "completed":
            print("FlashWorld completed successfully!")
            return True
        elif status == "error":
            print(f"FlashWorld failed: {status_data.get('message')}")
            return False

        time.sleep(5)


def main():
    if not os.path.exists(TEST_IMAGE_PATH):
        print(f"Error: Test image not found at {TEST_IMAGE_PATH}")
        sys.exit(1)

    image_b64 = encode_image(TEST_IMAGE_PATH)

    # 1. Image-to-3D
    uid = test_image_to_3d(image_b64)
    if not uid:
        print("Aborting due to Image-to-3D failure.")
        sys.exit(1)

    # 2. Rigging
    rig_success = test_rigging(uid)
    if not rig_success:
        print("Rigging failed, but continuing to FlashWorld...")

    # 3. FlashWorld
    fw_success = test_flashworld(image_b64)

    print("\n" + "=" * 30)
    print("E2E Test Summary:")
    print(f"Image-to-3D: SUCCESS (UID: {uid})")
    print(f"Rigging:      {'SUCCESS' if rig_success else 'FAILED'}")
    print(f"FlashWorld:   {'SUCCESS' if fw_success else 'FAILED'}")
    print("=" * 30)


if __name__ == "__main__":
    main()
