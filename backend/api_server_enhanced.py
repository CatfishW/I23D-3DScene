# Hunyuan 3D is licensed under the TENCENT HUNYUAN NON-COMMERCIAL LICENSE AGREEMENT
# except for the third-party components listed below.
# Hunyuan 3D does not impose any additional limitations beyond what is outlined
# in the repsective licenses of these third-party components.
# Users must comply with all terms and conditions of original licenses of these third-party
# components and must ensure that the usage of the third party components adheres to
# all relevant laws and regulations.

"""
Enhanced API server with WebSocket support, batch processing, and text-to-3D.
Models are lazy-loaded and freed when idle.
"""

import argparse
import asyncio
import base64
import json
import logging
import os
import sys
import threading
import traceback
import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from pathlib import Path

import torch
import uvicorn
from fastapi import (
    FastAPI,
    WebSocket,
    WebSocketDisconnect,
    BackgroundTasks,
    HTTPException,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

# Import lazy model worker
from model_worker_lazy import LazyModelWorker

# ============== Configuration ==============
DEFAULT_SAVE_DIR = "./gradio_cache"
API_TITLE = "Hunyuan3D-2.1 API"
API_DESCRIPTION = (
    "Production-ready API for image-to-3D and text-to-3D generation with PBR textures"
)
API_VERSION = "2.1.0"

# ============== Pydantic Models ==============


class GenerationRequest(BaseModel):
    """Request model for 3D generation API"""

    image: str = Field(..., description="Base64 encoded input image for 3D generation")
    remove_background: bool = Field(
        True, description="Whether to automatically remove background from input image"
    )
    texture: bool = Field(
        True, description="Whether to generate textures for the 3D model"
    )
    seed: int = Field(
        1234, description="Random seed for reproducible generation", ge=0, le=2**32 - 1
    )
    octree_resolution: int = Field(
        256, description="Resolution of the octree for mesh generation", ge=64, le=512
    )
    num_inference_steps: int = Field(
        5, description="Number of inference steps for generation", ge=1, le=20
    )
    guidance_scale: float = Field(
        5.0, description="Guidance scale for generation", ge=0.1, le=20.0
    )
    target_face_num: int = Field(
        10000,
        description="Target number of faces for mesh simplification",
        ge=100,
        le=1000000,
    )
    texture_resolution: int = Field(
        768,
        description="Texture resolution (512 or 768)",
        ge=512,
        le=768,
    )
    texture_views: int = Field(
        9,
        description="Number of views for texture generation (6-9)",
        ge=6,
        le=9,
    )


class TextTo3DRequest(BaseModel):
    """Request model for text-to-3D generation"""

    text: str = Field(..., description="Text prompt for 3D generation")
    texture: bool = Field(True, description="Whether to generate textures")
    seed: int = Field(1234, ge=0, le=2**32 - 1)
    num_inference_steps: int = Field(5, ge=1, le=20)


class BatchGenerationRequest(BaseModel):
    """Request model for batch generation"""

    images: List[str] = Field(..., description="List of base64 encoded images")
    remove_background: bool = Field(True)
    texture: bool = Field(True)


class GenerationResponse(BaseModel):
    """Response model for generation status"""

    uid: str = Field(..., description="Unique identifier for the generation task")


class StatusResponse(BaseModel):
    """Response model for status endpoint"""

    status: str = Field(..., description="Status of the generation task")
    model_base64: Optional[str] = Field(
        None, description="Base64 encoded generated model file"
    )
    message: Optional[str] = Field(None, description="Error or info message")
    progress: Optional[float] = Field(None, description="Generation progress 0-100")


class ModelInfo(BaseModel):
    """Model information response"""

    uid: str
    created_at: str
    file_size: int
    has_texture: bool


class HealthResponse(BaseModel):
    """Response model for health check"""

    status: str
    worker_id: str
    model_status: Dict[str, Any]
    vram_usage: Dict[str, float]
    queue_length: int


# ============== Global State ==============
SAVE_DIR = DEFAULT_SAVE_DIR
worker_id = str(uuid.uuid4())[:6]
worker: Optional[LazyModelWorker] = None
model_semaphore = None

# Try to initialize worker immediately
try:
    from model_worker_lazy import LazyModelWorker
    import argparse

    default_args = argparse.Namespace(
        model_path="tencent/Hunyuan3D-2.1",
        subfolder="hunyuan3d-dit-v2-1",
        device="cuda",
        low_vram_mode=False,
        mc_algo="mc",
        enable_flashvdm=False,
        compile=False,
        idle_timeout=300,
        cuda_device=1,
        preload_on_cpu=False,
        limit_model_concurrency=1,
    )
    model_semaphore = asyncio.Semaphore(default_args.limit_model_concurrency)
    worker = LazyModelWorker(
        model_path=default_args.model_path,
        subfolder=default_args.subfolder,
        device=default_args.device,
        low_vram_mode=default_args.low_vram_mode,
        worker_id=worker_id,
        model_semaphore=model_semaphore,
        save_dir=SAVE_DIR,
        mc_algo=default_args.mc_algo,
        enable_flashvdm=default_args.enable_flashvdm,
        compile=default_args.compile,
        idle_timeout=default_args.idle_timeout,
        cuda_device=default_args.cuda_device,
        preload_on_cpu=default_args.preload_on_cpu,
    )
    print(f"Worker initialized: {worker}")
except Exception as e:
    print(f"Failed to initialize worker: {e}")


# WebSocket connection manager for progress updates
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

# Progress tracking
generation_progress: Dict[str, Dict] = {}

# ============== FastAPI App ==============
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


# ============== Helper Functions ==============


def update_progress(uid: str, progress: float, stage: str):
    """Update generation progress (thread-safe)."""
    generation_progress[uid] = {
        "progress": progress,
        "stage": stage,
        "timestamp": datetime.now().isoformat(),
    }
    # Try to send async notification, but don't fail if no event loop
    # This function is called from a thread, so asyncio may not work
    try:
        loop = asyncio.get_running_loop()
        asyncio.create_task(manager.send_progress(uid, progress, stage))
    except RuntimeError:
        pass  # No event loop in this thread, that's OK


def run_generation(uid: str, params: dict):
    """Run generation in a thread with progress updates."""
    try:
        update_progress(uid, 10, "loading_models")
        # Force load the pipeline first
        _ = worker.pipeline
        update_progress(uid, 20, "loaded_shape")
        _ = worker.paint_pipeline
        update_progress(uid, 30, "loaded_paint")
        file_path, uid = worker.generate(uid, params)
        update_progress(uid, 100, "completed")
    except Exception as e:
        import traceback

        tb = traceback.format_exc()
        print(f"ERROR in run_generation: {tb}")
        update_progress(uid, 0, f"error: {str(e)}")


# ============== API Endpoints ==============


@app.get("/", tags=["root"])
async def root():
    """Root endpoint with API info."""
    return {
        "name": API_TITLE,
        "version": API_VERSION,
        "docs": "/docs",
        "endpoints": {
            "generate": "/generate",
            "generate_async": "/send",
            "text_to_3d": "/generate/text",
            "batch": "/batch",
            "status": "/status/{uid}",
            "websocket": "/ws/{uid}",
            "models": "/models",
            "health": "/health",
        },
    }


@app.get("/health", response_model=HealthResponse, tags=["status"])
async def health_check():
    """Health check with model and VRAM status."""
    model_status = worker.get_model_status() if worker else {}
    return JSONResponse(
        {
            "status": "healthy",
            "worker_id": worker_id,
            "model_status": model_status.get("model_status", model_status),
            "vram_usage": model_status.get(
                "vram_usage", {"allocated_gb": 0, "reserved_gb": 0}
            ),
            "queue_length": worker.get_queue_length() if worker else 0,
        }
    )


@app.post("/generate", tags=["generation"])
async def generate_3d_model(request: GenerationRequest):
    """
    Generate a 3D model from an input image (synchronous).
    Returns the GLB file directly.
    """
    params = request.dict()
    uid = uuid.uuid4()

    try:
        file_path, uid = worker.generate(uid, params)
        return FileResponse(
            file_path, media_type="model/gltf-binary", filename=f"model_{uid}.glb"
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except torch.cuda.CudaError as e:
        raise HTTPException(status_code=500, detail=f"CUDA error: {str(e)}")
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/send", response_model=GenerationResponse, tags=["generation"])
async def send_generation_task(
    request: GenerationRequest, background_tasks: BackgroundTasks
):
    """
    Start asynchronous generation task.
    Returns task ID for status tracking via /status/{uid} or WebSocket.
    """
    params = request.dict()
    uid = str(uuid.uuid4())

    generation_progress[uid] = {"progress": 0, "stage": "queued"}

    # Start generation in background
    thread = threading.Thread(target=run_generation, args=(uid, params))
    thread.start()

    return JSONResponse({"uid": uid}, status_code=200)


class RemoveBackgroundRequest(BaseModel):
    """Request model for background removal"""

    image: str = Field(..., description="Base64 encoded input image")


class RemoveBackgroundResponse(BaseModel):
    """Response model for background removal"""

    image: str = Field(..., description="Base64 encoded image with background removed")


@app.post("/remove-background", response_model=RemoveBackgroundResponse, tags=["image"])
async def remove_background(request: RemoveBackgroundRequest):
    """
    Remove background from an image.
    Returns the processed image with transparent background.
    """
    try:
        import base64
        from io import BytesIO
        from PIL import Image

        # Decode image
        image_data = base64.b64decode(request.image)
        image = Image.open(BytesIO(image_data))

        # Remove background using worker's rembg
        if worker._rembg is None:
            worker._load_rembg()

        # Remove background
        processed = worker.rembg(image)

        # Encode back to base64
        output_buffer = BytesIO()
        processed.save(output_buffer, format="PNG")
        output_base64 = base64.b64encode(output_buffer.getvalue()).decode("utf-8")

        return {"image": output_base64}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/generate/text", tags=["generation"])
async def text_to_3d(request: TextTo3DRequest):
    """
    Generate a 3D model from text prompt.
    Uses text-to-image then image-to-3D pipeline.
    """
    # Note: Requires additional text-to-image model integration
    # For now, return an informative error
    raise HTTPException(
        status_code=501,
        detail="Text-to-3D requires additional model setup. Please use image-to-3D endpoint.",
    )


@app.post("/batch", tags=["generation"])
async def batch_generate(
    request: BatchGenerationRequest, background_tasks: BackgroundTasks
):
    """
    Batch generation from multiple images.
    Returns list of task IDs for each image.
    """
    if len(request.images) > 10:
        raise HTTPException(status_code=400, detail="Maximum 10 images per batch")

    task_ids = []
    for i, image in enumerate(request.images):
        uid = str(uuid.uuid4())
        params = {
            "image": image,
            "remove_background": request.remove_background,
            "texture": request.texture,
        }
        generation_progress[uid] = {"progress": 0, "stage": "queued", "batch_index": i}

        thread = threading.Thread(target=run_generation, args=(uid, params))
        thread.start()
        task_ids.append(uid)

    return JSONResponse({"uids": task_ids, "count": len(task_ids)})


@app.get("/status/{uid}", response_model=StatusResponse, tags=["status"])
async def get_status(uid: str):
    """
    Check generation status and retrieve result.
    """
    textured_file = os.path.join(SAVE_DIR, f"{uid}_textured.glb")
    initial_file = os.path.join(SAVE_DIR, f"{uid}_initial.glb")

    progress_info = generation_progress.get(uid, {})

    # Completed
    if os.path.exists(textured_file):
        try:
            with open(textured_file, "rb") as f:
                model_data = base64.b64encode(f.read()).decode()
            return JSONResponse(
                {"status": "completed", "model_base64": model_data, "progress": 100}
            )
        except Exception as e:
            return JSONResponse({"status": "error", "message": str(e)}, status_code=500)

    # Texturing in progress
    elif os.path.exists(initial_file):
        return JSONResponse(
            {
                "status": "texturing",
                "progress": progress_info.get("progress", 70),
                "message": "Generating textures",
            }
        )

    # Processing or queued
    else:
        return JSONResponse(
            {
                "status": progress_info.get("stage", "processing"),
                "progress": progress_info.get("progress", 0),
            }
        )


@app.delete("/models/{uid}", tags=["models"])
async def delete_model(uid: str):
    """Delete a generated model."""
    deleted = False
    for suffix in ["_textured.glb", "_initial.glb", "_texturing.obj", "_texturing.glb"]:
        path = os.path.join(SAVE_DIR, f"{uid}{suffix}")
        if os.path.exists(path):
            os.remove(path)
            deleted = True

    if uid in generation_progress:
        del generation_progress[uid]

    if deleted:
        return JSONResponse({"status": "deleted", "uid": uid})
    else:
        raise HTTPException(status_code=404, detail="Model not found")


@app.get("/models", tags=["models"])
async def list_models(limit: int = 50, offset: int = 0):
    """List all generated models."""
    models = []
    if os.path.exists(SAVE_DIR):
        files = sorted(
            Path(SAVE_DIR).glob("*_textured.glb"),
            key=lambda x: x.stat().st_mtime,
            reverse=True,
        )[offset : offset + limit]

        for f in files:
            uid = f.stem.replace("_textured", "")
            models.append(
                {
                    "uid": uid,
                    "file_name": f.name,
                    "file_size": f.stat().st_size,
                    "created_at": datetime.fromtimestamp(f.stat().st_mtime).isoformat(),
                    "download_url": f"/download/{uid}",
                }
            )

    return JSONResponse({"models": models, "count": len(models)})


@app.get("/download/{uid}", tags=["models"])
async def download_model(uid: str):
    """Download a generated model."""
    textured_file = os.path.join(SAVE_DIR, f"{uid}_textured.glb")
    if not os.path.exists(textured_file):
        raise HTTPException(status_code=404, detail="Model not found")

    return FileResponse(
        textured_file, media_type="model/gltf-binary", filename=f"model_{uid}.glb"
    )


class RiggingRequest(BaseModel):
    model_uid: str = Field(..., description="UID of the model to rig")
    device: str = Field("cuda:1", description="Device to use for rigging")


class RiggingResponse(BaseModel):
    uid: str
    status: str
    rigged_url: Optional[str] = None
    message: Optional[str] = None


rigging_tasks: Dict[str, Dict[str, Any]] = {}


@app.post("/rig", response_model=RiggingResponse, tags=["rigging"])
async def rig_model(request: RiggingRequest, background_tasks: BackgroundTasks):
    """
    Add skeleton and skinning weights to an existing 3D model.
    """
    uid = request.model_uid

    # Find the model file
    textured_file = os.path.join(SAVE_DIR, f"{uid}_textured.glb")
    if not os.path.exists(textured_file):
        raise HTTPException(status_code=404, detail="Model not found")

    # Create task ID for rigging
    rig_uid = f"{uid}_rigged"
    rigging_tasks[rig_uid] = {"status": "queued", "progress": 0}

    # Run rigging in background
    def run_rigging():
        try:
            from unirig_worker import UniRigWorker

            rigging_tasks[rig_uid]["status"] = "running"
            rigging_tasks[rig_uid]["progress"] = 10

            worker = UniRigWorker(device=request.device)
            rigging_tasks[rig_uid]["progress"] = 30

            output_path = os.path.join(SAVE_DIR, f"{uid}_rigged.glb")
            actual_output = worker.rig_mesh(textured_file, output_path, uid=uid)
            rigging_tasks[rig_uid]["progress"] = 100
            rigging_tasks[rig_uid]["status"] = "completed"
            rigging_tasks[rig_uid]["output_path"] = actual_output

        except Exception as e:
            rigging_tasks[rig_uid]["status"] = f"error: {str(e)}"
            traceback.print_exc()

    background_tasks.add_task(run_rigging)

    return RiggingResponse(uid=rig_uid, status="queued", message="Rigging task started")


@app.get("/rig/{rig_uid}/status", tags=["rigging"])
async def get_rigging_status(rig_uid: str):
    """Get status of rigging task."""
    if rig_uid not in rigging_tasks:
        raise HTTPException(status_code=404, detail="Rigging task not found")

    task = rigging_tasks[rig_uid]
    return {
        "uid": rig_uid,
        "status": task["status"],
        "progress": task.get("progress", 0),
    }


@app.get("/rig/{rig_uid}/download", tags=["rigging"])
async def download_rigged_model(rig_uid: str):
    """Download rigged model (GLB with skeleton)."""
    output_path = None

    # First check if task is in memory
    if rig_uid in rigging_tasks:
        task = rigging_tasks[rig_uid]
        if task["status"] != "completed":
            raise HTTPException(
                status_code=400, detail=f"Rigging not completed: {task['status']}"
            )
        output_path = task.get("output_path")

    # If not in memory or no path, check if file exists on disk
    if not output_path or not os.path.exists(output_path):
        # Try to find the file directly (rig_uid might be like "uid_rigged")
        # Check both .glb and .fbx extensions
        for ext in [".glb", ".fbx"]:
            potential_path = os.path.join(SAVE_DIR, f"{rig_uid}{ext}")
            if os.path.exists(potential_path):
                output_path = potential_path
                break
        if not output_path or not os.path.exists(output_path):
            raise HTTPException(status_code=404, detail="Rigged model not found")

    if not output_path or not os.path.exists(output_path):
        raise HTTPException(status_code=404, detail="Rigged model not found")

    # Detect actual format by checking file magic bytes (FBX starts with "Kaydara")
    is_fbx = output_path.endswith(".fbx")
    if not is_fbx:
        try:
            with open(output_path, "rb") as f:
                header = f.read(20)
            if header.startswith(b"Kaydara"):
                is_fbx = True
        except Exception:
            pass

    if is_fbx:
        media_type = "application/octet-stream"
        ext = "fbx"
    else:
        media_type = "model/gltf-binary"
        ext = "glb"

    return FileResponse(
        output_path, media_type=media_type, filename=f"rigged_{rig_uid}.{ext}"
    )


# ============== History ==============


class ModelHistoryItem(BaseModel):
    uid: str
    created_at: str
    type: str  # "textured" or "rigged"
    model_url: str
    rigged_from: Optional[str] = None


@app.get("/history", tags=["history"])
async def get_history(limit: int = 50):
    """Get generation history."""
    history = []

    if not os.path.exists(SAVE_DIR):
        return JSONResponse({"history": [], "count": 0})

    files = sorted(
        os.listdir(SAVE_DIR),
        key=lambda x: os.path.getmtime(os.path.join(SAVE_DIR, x)),
        reverse=True,
    )

    for f in files:
        if not f.endswith(".glb"):
            continue

        uid = f.replace("_textured.glb", "").replace("_rigged.glb", "")

        # Skip if not matching our pattern
        if "_rigged.glb" in f:
            model_type = "rigged"
            original_uid = uid.replace("_rigged", "")
        elif "_textured.glb" in f:
            model_type = "textured"
            original_uid = uid
        else:
            continue

        file_path = os.path.join(SAVE_DIR, f)
        created_at = datetime.fromtimestamp(os.path.getctime(file_path)).isoformat()

        if model_type == "rigged":
            model_url = f"/rig/{original_uid}_rigged/download"
        else:
            model_url = f"/download/{original_uid}"

        history.append(
            {
                "uid": uid,
                "created_at": created_at,
                "type": model_type,
                "model_url": model_url,
                "rigged_from": original_uid if model_type == "rigged" else None,
            }
        )

        if len(history) >= limit:
            break

    return JSONResponse({"history": history, "count": len(history)})


# ============== WebSocket Endpoint ==============


@app.websocket("/ws/{uid}")
async def websocket_endpoint(websocket: WebSocket, uid: str):
    """
    WebSocket endpoint for real-time progress updates.
    Connect with task UID to receive progress events.
    """
    await manager.connect(websocket, uid)
    try:
        while True:
            # Send current status
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

            # Wait for client message or timeout
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=5.0)
                if data == "close":
                    break
            except asyncio.TimeoutError:
                pass

            # Check if completed
            textured_file = os.path.join(SAVE_DIR, f"{uid}_textured.glb")
            if os.path.exists(textured_file):
                with open(textured_file, "rb") as f:
                    model_data = base64.b64encode(f.read()).decode()
                await websocket.send_json(
                    {"status": "completed", "model_base64": model_data, "progress": 100}
                )
                break

    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(uid)


# ============== Main Entry Point ==============

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", type=str, default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8081)
    parser.add_argument("--model_path", type=str, default="tencent/Hunyuan3D-2.1")
    parser.add_argument("--subfolder", type=str, default="hunyuan3d-dit-v2-1")
    parser.add_argument("--device", type=str, default="cuda")
    parser.add_argument("--mc_algo", type=str, default="mc")
    parser.add_argument("--limit-model-concurrency", type=int, default=5)
    parser.add_argument("--enable_flashvdm", action="store_true")
    parser.add_argument("--compile", action="store_true")
    parser.add_argument("--low_vram_mode", action="store_true")
    parser.add_argument("--cache-path", type=str, default="./gradio_cache")
    parser.add_argument(
        "--idle-timeout",
        type=int,
        default=300,
        help="Seconds before unloading idle models",
    )
    parser.add_argument(
        "--cuda-device",
        type=int,
        default=1,
        help="CUDA device index to use (default: 1 for second GPU)",
    )
    parser.add_argument(
        "--preload-on-cpu",
        action="store_true",
        help="Preload models to CPU at startup to reduce first request latency",
    )
    args = parser.parse_args()

    print(f"Starting Hunyuan3D-2.1 API Server")
    print(f"Args: {args}")

    # Setup save directory
    SAVE_DIR = args.cache_path
    os.makedirs(SAVE_DIR, exist_ok=True)

    # Create semaphore for concurrency control
    model_semaphore = asyncio.Semaphore(args.limit_model_concurrency)

    # Initialize lazy model worker
    worker = LazyModelWorker(
        model_path=args.model_path,
        subfolder=args.subfolder,
        device=args.device,
        low_vram_mode=args.low_vram_mode,
        worker_id=worker_id,
        model_semaphore=model_semaphore,
        save_dir=SAVE_DIR,
        mc_algo=args.mc_algo,
        enable_flashvdm=args.enable_flashvdm,
        compile=args.compile,
        idle_timeout=args.idle_timeout,
        cuda_device=args.cuda_device,
        preload_on_cpu=args.preload_on_cpu,
    )

    print(f"\n{'=' * 60}")
    print(f"Hunyuan3D-2.1 API Server Ready")
    print(f"API Docs: http://{args.host}:{args.port}/docs")
    print(f"Models will be loaded on demand and freed after {args.idle_timeout}s idle")
    print(f"{'=' * 60}\n")

    uvicorn.run(app, host=args.host, port=args.port, log_level="info")
