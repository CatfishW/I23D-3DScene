"""
FlashWorld FastAPI Backend for Image-to-3D Scene Generation.
Wraps FlashWorld's GenerationSystem for 3D Gaussian generation and mesh conversion.
"""

import argparse
import asyncio
import base64
import io
import json
import logging
import math
import os
import sys
import threading
import time
import traceback
import uuid
from datetime import datetime
from typing import Dict, List, Optional, Any
from pathlib import Path

import numpy as np
import torch
import uvicorn
from fastapi import (
    FastAPI,
    File,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
    BackgroundTasks,
    HTTPException,
    Form,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel, Field
from PIL import Image

sys.path.insert(0, "/data/Yanlai/image-to-3d-web/FlashWorld")

from huggingface_hub import hf_hub_download
from pathlib import Path

HUGGINGFACE_HUB_CACHE = str(Path.home() / ".cache" / "huggingface")

API_TITLE = "FlashWorld API"
API_DESCRIPTION = "Image-to-3D Scene Generation with Gaussian Splatting"
API_VERSION = "1.0.0"

DEFAULT_SAVE_DIR = "./flashworld_cache"
DEFAULT_DEVICE = "cuda:1"
DEFAULT_RESOLUTION = [24, 480, 704]

generation_system = None
SAVE_DIR = DEFAULT_SAVE_DIR
worker_id = str(uuid.uuid4())[:6]


class GenerationRequest(BaseModel):
    image: str = Field(..., description="Base64 encoded input image")
    text_prompt: str = Field("", description="Optional text prompt for generation")
    num_frames: int = Field(24, description="Number of frames to generate", ge=1, le=64)
    image_height: int = Field(480, description="Image height", ge=128, le=1024)
    image_width: int = Field(704, description="Image width", ge=128, le=1024)
    convert_to_mesh: bool = Field(True, description="Convert Gaussians to mesh (GLB)")
    poisson_depth: int = Field(
        9, description="Poisson reconstruction depth", ge=6, le=12
    )
    opacity_threshold: float = Field(
        0.1, description="Opacity threshold for Gaussian filtering", ge=0.0, le=1.0
    )


class GenerationResponse(BaseModel):
    uid: str = Field(..., description="Unique identifier for the generation task")


class StatusResponse(BaseModel):
    status: str = Field(..., description="Status of the generation task")
    message: Optional[str] = Field(None, description="Error or info message")
    progress: Optional[float] = Field(None, description="Generation progress 0-100")
    stage: Optional[str] = Field(None, description="Current processing stage")
    glb_url: Optional[str] = Field(None, description="Download URL for GLB file")
    spz_url: Optional[str] = Field(None, description="Download URL for SPZ file")


class HealthResponse(BaseModel):
    status: str
    worker_id: str
    model_loaded: bool
    vram_usage: Dict[str, float]
    queue_length: int


generation_tasks: Dict[str, Dict[str, Any]] = {}
generation_progress: Dict[str, Dict] = {}


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, uid: str):
        await websocket.accept()
        self.active_connections[uid] = websocket

    def disconnect(self, uid: str):
        if uid in self.active_connections:
            del self.active_connections[uid]

    async def send_progress(self, uid: str, progress: float, stage: str):
        if uid in self.active_connections:
            try:
                await self.active_connections[uid].send_json(
                    {
                        "progress": progress,
                        "stage": stage,
                        "timestamp": datetime.now().isoformat(),
                    }
                )
            except:
                pass


manager = ConnectionManager()


def update_progress(uid: str, progress: float, stage: str):
    """Update generation progress (thread-safe)."""
    generation_progress[uid] = {
        "progress": progress,
        "stage": stage,
        "timestamp": datetime.now().isoformat(),
    }
    try:
        loop = asyncio.get_running_loop()
        asyncio.create_task(manager.send_progress(uid, progress, stage))
    except RuntimeError:
        pass


def create_orbit_cameras(
    n_frames: int = 24,
    radius: float = 3.0,
    elevation: float = 0.3,
    image_height: int = 480,
    image_width: int = 704,
    fov: float = 50.0,
) -> List[Dict]:
    """
    Create a simple camera orbit around the scene.

    Args:
        n_frames: Number of frames in the orbit
        radius: Distance from center
        elevation: Elevation angle in radians
        image_height: Image height in pixels
        image_width: Image width in pixels
        fov: Field of view in degrees

    Returns:
        List of camera dictionaries with quaternion, position, fx, fy, cx, cy
    """
    cameras = []

    fx = image_width / (2 * math.tan(math.radians(fov) / 2))
    fy = fx
    cx = image_width / 2
    cy = image_height / 2

    for i in range(n_frames):
        theta = 2 * math.pi * i / n_frames

        x = radius * math.cos(theta) * math.cos(elevation)
        y = radius * math.sin(elevation)
        z = radius * math.sin(theta) * math.cos(elevation)

        forward = np.array([-x, -y, -z])
        forward = forward / np.linalg.norm(forward)

        up = np.array([0, 1, 0])
        right = np.cross(up, forward)
        right = right / np.linalg.norm(right)
        up = np.cross(forward, right)

        rotation_matrix = np.stack([right, up, -forward], axis=1)

        trace = np.trace(rotation_matrix)
        if trace > 0:
            s = 0.5 / math.sqrt(trace + 1.0)
            qw = 0.25 / s
            qx = (rotation_matrix[2, 1] - rotation_matrix[1, 2]) * s
            qy = (rotation_matrix[0, 2] - rotation_matrix[2, 0]) * s
            qz = (rotation_matrix[1, 0] - rotation_matrix[0, 1]) * s
        elif (
            rotation_matrix[0, 0] > rotation_matrix[1, 1]
            and rotation_matrix[0, 0] > rotation_matrix[2, 2]
        ):
            s = 2.0 * math.sqrt(
                1.0
                + rotation_matrix[0, 0]
                - rotation_matrix[1, 1]
                - rotation_matrix[2, 2]
            )
            qw = (rotation_matrix[2, 1] - rotation_matrix[1, 2]) / s
            qx = 0.25 * s
            qy = (rotation_matrix[0, 1] + rotation_matrix[1, 0]) / s
            qz = (rotation_matrix[0, 2] + rotation_matrix[2, 0]) / s
        elif rotation_matrix[1, 1] > rotation_matrix[2, 2]:
            s = 2.0 * math.sqrt(
                1.0
                + rotation_matrix[1, 1]
                - rotation_matrix[0, 0]
                - rotation_matrix[2, 2]
            )
            qw = (rotation_matrix[0, 2] - rotation_matrix[2, 0]) / s
            qx = (rotation_matrix[0, 1] + rotation_matrix[1, 0]) / s
            qy = 0.25 * s
            qz = (rotation_matrix[1, 2] + rotation_matrix[2, 1]) / s
        else:
            s = 2.0 * math.sqrt(
                1.0
                + rotation_matrix[2, 2]
                - rotation_matrix[0, 0]
                - rotation_matrix[1, 1]
            )
            qw = (rotation_matrix[1, 0] - rotation_matrix[0, 1]) / s
            qx = (rotation_matrix[0, 2] + rotation_matrix[2, 0]) / s
            qy = (rotation_matrix[1, 2] + rotation_matrix[2, 1]) / s
            qz = 0.25 * s

        quaternion = [qx, qy, qz, qw]

        cameras.append(
            {
                "quaternion": quaternion,
                "position": [x, y, z],
                "fx": fx,
                "fy": fy,
                "cx": cx,
                "cy": cy,
            }
        )

    return cameras


def process_image(image_data: str, image_height: int, image_width: int) -> tuple:
    """
    Process input image and return torch tensor with camera scale.

    Returns:
        image_tensor: Processed image as torch tensor
        scale: Scale factor applied to image
    """
    if "," in image_data:
        image_data = image_data.split(",", 1)[1]

    image_bytes = base64.b64decode(image_data)
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

    w, h = image.size

    if image_height / h > image_width / w:
        scale = image_height / h
    else:
        scale = image_width / w

    new_h = int(image_height / scale)
    new_w = int(image_width / scale)

    image = image.crop(
        (
            (w - new_w) // 2,
            (h - new_h) // 2,
            new_w + (w - new_w) // 2,
            new_h + (h - new_h) // 2,
        )
    ).resize((image_width, image_height))

    image_tensor = (
        torch.from_numpy(np.array(image)).float().permute(2, 0, 1) / 255.0 * 2 - 1
    )

    return image_tensor, scale, w, h, new_w, new_h


def run_generation(uid: str, params: dict):
    """Run FlashWorld generation in a background thread."""
    global generation_system

    try:
        update_progress(uid, 5, "initializing")

        text_prompt = params.get("text_prompt", "")
        num_frames = params.get("num_frames", 24)
        image_height = params.get("image_height", 480)
        image_width = params.get("image_width", 704)
        convert_to_mesh = params.get("convert_to_mesh", True)
        poisson_depth = params.get("poisson_depth", 9)
        opacity_threshold = params.get("opacity_threshold", 0.1)
        image_data = params.get("image", "")

        update_progress(uid, 10, "processing_image")

        image_tensor, scale, orig_w, orig_h, new_w, new_h = process_image(
            image_data, image_height, image_width
        )

        update_progress(uid, 15, "creating_cameras")

        cameras = create_orbit_cameras(
            n_frames=num_frames, image_height=image_height, image_width=image_width
        )

        for camera in cameras:
            camera["fx"] = camera["fx"] * scale
            camera["fy"] = camera["fy"] * scale
            camera["cx"] = (camera["cx"] - (orig_w - new_w) // 2) * scale
            camera["cy"] = (camera["cy"] - (orig_h - new_h) // 2) * scale

        cameras_tensor = torch.stack(
            [
                torch.from_numpy(
                    np.array(
                        [
                            camera["quaternion"][0],
                            camera["quaternion"][1],
                            camera["quaternion"][2],
                            camera["quaternion"][3],
                            camera["position"][0],
                            camera["position"][1],
                            camera["position"][2],
                            camera["fx"] / image_width,
                            camera["fy"] / image_height,
                            camera["cx"] / image_width,
                            camera["cy"] / image_height,
                        ],
                        dtype=np.float32,
                    )
                )
                for camera in cameras
            ],
            dim=0,
        )

        update_progress(uid, 20, "generating_gaussians")

        start_time = time.time()

        with torch.amp.autocast(dtype=torch.bfloat16, device_type="cuda"):
            scene_params, ref_w2c, T_norm = generation_system.generate(
                cameras_tensor,
                num_frames,
                image=image_tensor.to(generation_system.device),
                text=text_prompt,
                image_index=0,
                image_height=image_height,
                image_width=image_width,
            )

        generation_time = time.time() - start_time
        print(f"FlashWorld generation time: {generation_time:.2f}s")

        scene_params = scene_params.detach().cpu()
        T_norm_value = T_norm.item() if T_norm is not None else 1.0

        update_progress(uid, 70, "saving_gaussians")

        spz_path = os.path.join(SAVE_DIR, f"{uid}.spz")
        ply_path = os.path.join(SAVE_DIR, f"{uid}.ply")

        from utils import export_gaussians

        export_gaussians(
            scene_params,
            opacity_threshold=opacity_threshold,
            T_norm=T_norm,
            spz_path=spz_path,
            ply_path=ply_path,
        )

        generation_tasks[uid]["spz_path"] = spz_path
        generation_tasks[uid]["ply_path"] = ply_path
        generation_tasks[uid]["generation_time"] = generation_time

        if convert_to_mesh:
            update_progress(uid, 80, "converting_to_mesh")

            glb_path = os.path.join(SAVE_DIR, f"{uid}.glb")

            from gaussian_to_mesh import gaussians_to_mesh

            gaussians_to_mesh(
                scene_params,
                glb_path,
                source_type="tensor",
                T_norm=T_norm_value,
                num_samples_per_gaussian=16,
                poisson_depth=poisson_depth,
                opacity_threshold=opacity_threshold,
            )

            generation_tasks[uid]["glb_path"] = glb_path

        update_progress(uid, 100, "completed")
        generation_tasks[uid]["status"] = "completed"
        generation_tasks[uid]["progress"] = 100

    except Exception as e:
        error_msg = str(e)
        print(f"Generation error: {error_msg}")
        traceback.print_exc()
        update_progress(uid, 0, f"error: {error_msg}")
        generation_tasks[uid]["status"] = "error"
        generation_tasks[uid]["error"] = error_msg


app = FastAPI(
    title=API_TITLE,
    description=API_DESCRIPTION,
    version=API_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", tags=["root"])
async def root():
    """Root endpoint with API info."""
    return {
        "name": API_TITLE,
        "version": API_VERSION,
        "docs": "/docs",
        "endpoints": {
            "generate": "/generate",
            "status": "/status/{uid}",
            "download": "/download/{uid}",
            "download_spz": "/download/{uid}/gaussians",
            "health": "/health",
            "websocket": "/ws/{uid}",
        },
    }


@app.get("/health", response_model=HealthResponse, tags=["status"])
async def health_check():
    """Health check endpoint."""
    model_loaded = generation_system is not None

    vram_usage = {"allocated_gb": 0, "reserved_gb": 0}
    if torch.cuda.is_available():
        vram_usage = {
            "allocated_gb": torch.cuda.memory_allocated() / 1024**3,
            "reserved_gb": torch.cuda.memory_reserved() / 1024**3,
        }

    return JSONResponse(
        {
            "status": "healthy",
            "worker_id": worker_id,
            "model_loaded": model_loaded,
            "vram_usage": vram_usage,
            "queue_length": len(
                [
                    t
                    for t in generation_tasks.values()
                    if t.get("status") == "processing"
                ]
            ),
        }
    )


@app.post("/generate", response_model=GenerationResponse, tags=["generation"])
async def generate_3d_scene(
    request: GenerationRequest, background_tasks: BackgroundTasks
):
    """
    Start 3D scene generation from an image.
    Returns task UID for status tracking.
    """
    global generation_system

    if generation_system is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    uid = str(uuid.uuid4())

    generation_tasks[uid] = {
        "status": "queued",
        "progress": 0,
        "created_at": datetime.now().isoformat(),
    }
    generation_progress[uid] = {"progress": 0, "stage": "queued"}

    params = request.dict()

    thread = threading.Thread(target=run_generation, args=(uid, params))
    thread.start()

    return JSONResponse({"uid": uid}, status_code=202)


@app.post("/generate/upload", response_model=GenerationResponse, tags=["generation"])
async def generate_from_upload(
    file: UploadFile = File(...),
    text_prompt: str = Form(""),
    num_frames: int = Form(24),
    convert_to_mesh: bool = Form(True),
    background_tasks: BackgroundTasks = None,
):
    """
    Generate 3D scene from uploaded image file.
    """
    global generation_system

    if generation_system is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    contents = await file.read()
    image_base64 = base64.b64encode(contents).decode("utf-8")

    uid = str(uuid.uuid4())

    generation_tasks[uid] = {
        "status": "queued",
        "progress": 0,
        "created_at": datetime.now().isoformat(),
    }
    generation_progress[uid] = {"progress": 0, "stage": "queued"}

    params = {
        "image": image_base64,
        "text_prompt": text_prompt,
        "num_frames": num_frames,
        "image_height": 480,
        "image_width": 704,
        "convert_to_mesh": convert_to_mesh,
    }

    thread = threading.Thread(target=run_generation, args=(uid, params))
    thread.start()

    return JSONResponse({"uid": uid}, status_code=202)


@app.get("/status/{uid}", response_model=StatusResponse, tags=["status"])
async def get_status(uid: str):
    """
    Get generation status and results.
    """
    if uid not in generation_tasks:
        raise HTTPException(status_code=404, detail="Task not found")

    task = generation_tasks[uid]
    progress_info = generation_progress.get(uid, {})

    status = task.get("status", "unknown")
    progress = progress_info.get("progress", task.get("progress", 0))
    stage = progress_info.get("stage", "unknown")

    response = {
        "status": status,
        "progress": progress,
        "stage": stage,
    }

    if status == "completed":
        if task.get("glb_path") and os.path.exists(task["glb_path"]):
            response["glb_url"] = f"/download/{uid}"
        if task.get("spz_path") and os.path.exists(task["spz_path"]):
            response["spz_url"] = f"/download/{uid}/gaussians"
        if task.get("generation_time"):
            response["generation_time"] = task["generation_time"]

    if status == "error":
        response["message"] = task.get("error", "Unknown error")

    return JSONResponse(response)


@app.get("/download/{uid}", tags=["download"])
async def download_glb(uid: str):
    """
    Download generated GLB mesh file.
    """
    if uid not in generation_tasks:
        raise HTTPException(status_code=404, detail="Task not found")

    task = generation_tasks[uid]

    if task.get("status") != "completed":
        raise HTTPException(
            status_code=400, detail=f"Generation not completed: {task.get('status')}"
        )

    glb_path = task.get("glb_path")
    if not glb_path or not os.path.exists(glb_path):
        raise HTTPException(status_code=404, detail="GLB file not found")

    return FileResponse(
        glb_path, media_type="model/gltf-binary", filename=f"flashworld_{uid}.glb"
    )


@app.get("/download/{uid}/gaussians", tags=["download"])
async def download_gaussians(uid: str):
    """
    Download generated Gaussian splat file (SPZ format).
    """
    if uid not in generation_tasks:
        raise HTTPException(status_code=404, detail="Task not found")

    task = generation_tasks[uid]

    if task.get("status") != "completed":
        raise HTTPException(
            status_code=400, detail=f"Generation not completed: {task.get('status')}"
        )

    spz_path = task.get("spz_path")
    if not spz_path or not os.path.exists(spz_path):
        raise HTTPException(status_code=404, detail="Gaussian file not found")

    return FileResponse(
        spz_path,
        media_type="application/octet-stream",
        filename=f"flashworld_{uid}.spz",
    )


@app.websocket("/ws/{uid}")
async def websocket_endpoint(websocket: WebSocket, uid: str):
    """
    WebSocket endpoint for real-time progress updates.
    """
    await manager.connect(websocket, uid)
    try:
        while True:
            progress_info = generation_progress.get(
                uid, {"progress": 0, "stage": "unknown"}
            )

            await websocket.send_json(
                {
                    "progress": progress_info.get("progress", 0),
                    "stage": progress_info.get("stage", "unknown"),
                    "timestamp": datetime.now().isoformat(),
                }
            )

            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=5.0)
                if data == "close":
                    break
            except asyncio.TimeoutError:
                pass

            if uid in generation_tasks:
                task = generation_tasks[uid]
                if task.get("status") == "completed":
                    response = {
                        "status": "completed",
                        "progress": 100,
                        "glb_url": f"/download/{uid}" if task.get("glb_path") else None,
                        "spz_url": f"/download/{uid}/gaussians"
                        if task.get("spz_path")
                        else None,
                    }
                    await websocket.send_json(response)
                    break
                elif task.get("status") == "error":
                    await websocket.send_json(
                        {
                            "status": "error",
                            "message": task.get("error", "Unknown error"),
                        }
                    )
                    break

    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(uid)


@app.delete("/tasks/{uid}", tags=["tasks"])
async def delete_task(uid: str):
    """Delete a generation task and its files."""
    deleted_files = []

    for ext in [".glb", ".spz", ".ply", ".json"]:
        path = os.path.join(SAVE_DIR, f"{uid}{ext}")
        if os.path.exists(path):
            os.remove(path)
            deleted_files.append(path)

    if uid in generation_tasks:
        del generation_tasks[uid]
    if uid in generation_progress:
        del generation_progress[uid]

    return JSONResponse({"status": "deleted", "files": deleted_files})


def cleanup_old_files():
    """Cleanup files older than 1 hour."""
    now = time.time()
    for filename in os.listdir(SAVE_DIR):
        filepath = os.path.join(SAVE_DIR, filename)
        if os.path.isfile(filepath):
            if now - os.path.getmtime(filepath) > 3600:
                try:
                    os.remove(filepath)
                except:
                    pass


def main():
    global generation_system, SAVE_DIR

    parser = argparse.ArgumentParser(description="FlashWorld API Server")
    parser.add_argument("--host", type=str, default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8082)
    parser.add_argument("--device", type=str, default="cuda:1")
    parser.add_argument("--cache-dir", type=str, default="./flashworld_cache")
    parser.add_argument("--ckpt", type=str, default=None)
    parser.add_argument("--offload-t5", action="store_true")
    parser.add_argument("--offload-vae", action="store_true")
    parser.add_argument("--offload-transformer", action="store_true")
    args = parser.parse_args()

    print(f"Starting FlashWorld API Server")
    print(f"Device: {args.device}")

    SAVE_DIR = args.cache_dir
    os.makedirs(SAVE_DIR, exist_ok=True)

    device = args.device

    ckpt_path = args.ckpt
    if ckpt_path is None:
        ckpt_path = os.path.join(
            HUGGINGFACE_HUB_CACHE,
            "models--imlixinyang--FlashWorld",
            "snapshots",
            "6a8e88c6f88678ac098e4c82675f0aee555d6e5d",
            "model.ckpt",
        )
        if not os.path.exists(ckpt_path):
            print("Downloading FlashWorld checkpoint from HuggingFace...")
            hf_hub_download(
                repo_id="imlixinyang/FlashWorld",
                filename="model.ckpt",
                local_dir_use_symlinks=False,
            )

    print(f"Loading FlashWorld model from {ckpt_path}...")

    from app import GenerationSystem

    generation_system = GenerationSystem(
        ckpt_path=ckpt_path,
        device=device,
        offload_t5=args.offload_t5,
        offload_vae=args.offload_vae,
        offload_transformer_during_vae=args.offload_transformer,
    )

    print("FlashWorld model loaded successfully!")

    def cleanup_loop():
        while True:
            time.sleep(300)
            try:
                cleanup_old_files()
            except:
                pass

    cleanup_thread = threading.Thread(target=cleanup_loop, daemon=True)
    cleanup_thread.start()

    print(f"\n{'=' * 60}")
    print(f"FlashWorld API Server Ready")
    print(f"API Docs: http://{args.host}:{args.port}/docs")
    print(f"{'=' * 60}\n")

    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
