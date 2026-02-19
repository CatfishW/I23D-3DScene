"""
Model worker for Hunyuan3D API server with lazy loading and VRAM offloading.
Models are loaded only when needed and unloaded after idle timeout.
"""

import os
import time
import uuid
import base64
import threading
import trimesh
from io import BytesIO
from PIL import Image
import torch
import gc

# Apply torchvision compatibility fix before other imports
import sys

sys.path.insert(0, "./hy3dshape")
sys.path.insert(0, "./hy3dpaint")

try:
    from torchvision_fix import apply_fix

    apply_fix()
except ImportError:
    print(
        "Warning: torchvision_fix module not found, proceeding without compatibility fix"
    )
except Exception as e:
    print(f"Warning: Failed to apply torchvision fix: {e}")

from hy3dshape import Hunyuan3DDiTFlowMatchingPipeline, FaceReducer
from hy3dshape.rembg import BackgroundRemover
from hy3dshape.utils import logger
from textureGenPipeline import Hunyuan3DPaintPipeline, Hunyuan3DPaintConfig
from hy3dpaint.convert_utils import create_glb_with_pbr_materials


def quick_convert_with_obj2gltf(obj_path: str, glb_path: str):
    textures = {
        "albedo": obj_path.replace(".obj", ".jpg"),
        "metallic": obj_path.replace(".obj", "_metallic.jpg"),
        "roughness": obj_path.replace(".obj", "_roughness.jpg"),
    }
    create_glb_with_pbr_materials(obj_path, textures, glb_path)


def load_image_from_base64(image):
    """
    Load an image from base64 encoded string.

    Args:
        image (str): Base64 encoded image string

    Returns:
        PIL.Image: Loaded image
    """
    return Image.open(BytesIO(base64.b64decode(image)))


class LazyModelWorker:
    """
    Worker class for handling 3D model generation tasks with lazy loading.
    Models are only loaded into VRAM when a request comes in and unloaded after idle timeout.
    """

    def __init__(
        self,
        model_path="tencent/Hunyuan3D-2.1",
        subfolder="hunyuan3d-dit-v2-1",
        device="cuda",
        low_vram_mode=False,
        worker_id=None,
        model_semaphore=None,
        save_dir="gradio_cache",
        mc_algo="mc",
        enable_flashvdm=False,
        compile=False,
        idle_timeout=300,
        cuda_device=1,
        preload_on_cpu=False,
    ):
        """
        Initialize the lazy model worker.

        Args:
            model_path (str): Path to the shape generation model
            subfolder (str): Subfolder containing the model files
            device (str): Device to run the model on ('cuda' or 'cpu')
            low_vram_mode (bool): Whether to use low VRAM mode
            worker_id (str): Unique identifier for this worker
            model_semaphore: Semaphore for controlling model concurrency
            save_dir (str): Directory to save generated files
            idle_timeout (int): Seconds to wait before unloading models (default: 5 minutes)
            cuda_device (int): CUDA device index to use (default: 1 for second GPU)
            preload_on_cpu (bool): Preload models to CPU at startup (reduces first request latency)
        """
        self.cuda_device = cuda_device
        # Set CUDA_VISIBLE_DEVICES to use specific GPU
        os.environ["CUDA_VISIBLE_DEVICES"] = str(cuda_device)

        self.model_path = model_path
        self.subfolder = subfolder
        self.device = device
        self.low_vram_mode = low_vram_mode
        self.worker_id = worker_id or str(uuid.uuid4())[:6]
        self.model_semaphore = model_semaphore
        self.save_dir = save_dir
        self.mc_algo = mc_algo
        self.enable_flashvdm = enable_flashvdm
        self.compile = compile
        self.idle_timeout = idle_timeout
        self.preload_on_cpu = preload_on_cpu

        # Models are None initially (lazy loading)
        self._pipeline = None
        self._paint_pipeline = None
        self._rembg = None

        # Lock for thread-safe model loading
        self._model_lock = threading.Lock()

        # Last activity timestamp
        self._last_activity = time.time()

        # Flag to indicate generation is in progress
        self._generating = False

        # Preload models if requested
        if preload_on_cpu:
            self._preload_models()

        logger.info(
            f"LazyModelWorker initialized on worker {self.worker_id} (models will be loaded on demand)"
        )

        # Create save directory
        os.makedirs(self.save_dir, exist_ok=True)

    def _preload_models(self):
        """Preload models to GPU at startup."""
        logger.info("Preloading models to GPU...")
        preload_start = time.time()

        # Load shape pipeline to GPU
        logger.info("Preloading shape pipeline to GPU...")
        self._pipeline = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(
            self.model_path, subfolder=self.subfolder
        )
        self._pipeline.to(self.device)
        logger.info(
            f"Shape pipeline preloaded to GPU ({time.time() - preload_start:.2f}s)"
        )

        # Load paint pipeline to GPU
        logger.info("Preloading paint pipeline to GPU (max quality: 9 views, 768p)...")
        max_num_view = 9  # Increased from 6 to 9 for better texture quality
        resolution = 768  # Increased from 512 to 768 for higher resolution textures
        conf = Hunyuan3DPaintConfig(max_num_view, resolution)
        conf.realesrgan_ckpt_path = "hy3dpaint/ckpt/RealESRGAN_x4plus.pth"
        conf.multiview_cfg_path = "hy3dpaint/cfgs/hunyuan-paint-pbr.yaml"
        conf.custom_pipeline = "hy3dpaint/hunyuanpaintpbr"
        conf.device = self.device
        self._paint_pipeline = Hunyuan3DPaintPipeline(conf)
        logger.info(
            f"Paint pipeline preloaded to GPU ({time.time() - preload_start:.2f}s)"
        )

        # Load rembg
        logger.info("Preloading background remover...")
        self._rembg = BackgroundRemover()

        total_time = time.time() - preload_start
        logger.info(f"All models preloaded to GPU in {total_time:.2f}s")

    def _idle_monitor(self):
        """Monitor for idle timeout and unload models to free VRAM."""
        while self._idle_monitor_running:
            time.sleep(30)  # Check every 30 seconds
            with self._model_lock:
                # Don't unload if generation is in progress
                if self._generating:
                    continue
                if self._pipeline is not None or self._paint_pipeline is not None:
                    idle_time = time.time() - self._last_activity
                    if idle_time > self.idle_timeout:
                        logger.info(
                            f"Idle timeout ({self.idle_timeout}s) reached, unloading models to free VRAM"
                        )
                        self._unload_models()

    def _unload_models(self):
        """Unload models from VRAM."""
        logger.info("Unloading models from VRAM...")

        if self._pipeline is not None:
            del self._pipeline
            self._pipeline = None

        if self._paint_pipeline is not None:
            del self._paint_pipeline
            self._paint_pipeline = None

        # Force garbage collection
        gc.collect()
        torch.cuda.empty_cache()
        torch.cuda.synchronize()

        logger.info("Models unloaded, VRAM freed")

    def _load_shape_pipeline(self):
        """Load shape generation pipeline if not already loaded."""
        if self._pipeline is None:
            logger.info("Loading shape generation pipeline...")
            start_time = time.time()

            self._pipeline = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(
                self.model_path, subfolder=self.subfolder
            )
            self._pipeline.to(self.device)

            if self.enable_flashvdm:
                mc_algo = "mc" if self.device in ["cpu", "mps"] else self.mc_algo
                self._pipeline.enable_flashvdm(mc_algo=mc_algo)
            if self.compile:
                self._pipeline.compile()

            logger.info(f"Shape pipeline loaded in {time.time() - start_time:.2f}s")

    def _load_paint_pipeline(self):
        """Load texture generation pipeline if not already loaded."""
        if self._paint_pipeline is None:
            logger.info(
                "Loading texture generation pipeline (max quality: 9 views, 768p)..."
            )
            start_time = time.time()

            max_num_view = 9  # Up to 9 views for better texture coverage
            resolution = 768  # 768p for higher resolution textures
            conf = Hunyuan3DPaintConfig(max_num_view, resolution)
            conf.realesrgan_ckpt_path = "hy3dpaint/ckpt/RealESRGAN_x4plus.pth"
            conf.multiview_cfg_path = "hy3dpaint/cfgs/hunyuan-paint-pbr.yaml"
            conf.custom_pipeline = "hy3dpaint/hunyuanpaintpbr"
            conf.device = self.device

            self._paint_pipeline = Hunyuan3DPaintPipeline(conf)
            logger.info(f"Paint pipeline loaded in {time.time() - start_time:.2f}s")

    def _load_rembg(self):
        """Load background remover if not already loaded."""
        if self._rembg is None:
            logger.info("Loading background remover...")
            self._rembg = BackgroundRemover()

    @property
    def pipeline(self):
        """Get shape pipeline, loading if necessary."""
        with self._model_lock:
            self._last_activity = time.time()
            self._load_shape_pipeline()
            return self._pipeline

    @property
    def paint_pipeline(self):
        """Get paint pipeline, loading if necessary."""
        with self._model_lock:
            self._last_activity = time.time()
            self._load_paint_pipeline()
            return self._paint_pipeline

    @property
    def rembg(self):
        """Get background remover, loading if necessary."""
        with self._model_lock:
            self._last_activity = time.time()
            self._load_rembg()
            return self._rembg

    def get_vram_usage(self):
        """Get current VRAM usage."""
        if torch.cuda.is_available():
            allocated = torch.cuda.memory_allocated() / 1024**3
            reserved = torch.cuda.memory_reserved() / 1024**3
            return {
                "allocated_gb": round(allocated, 2),
                "reserved_gb": round(reserved, 2),
            }
        return {"allocated_gb": 0, "reserved_gb": 0}

    def get_model_status(self):
        """Get current model loading status."""
        return {
            "shape_pipeline_loaded": self._pipeline is not None,
            "paint_pipeline_loaded": self._paint_pipeline is not None,
            "rembg_loaded": self._rembg is not None,
            "vram_usage": self.get_vram_usage(),
        }

    def get_queue_length(self):
        """
        Get the current queue length for model processing.

        Returns:
            int: Number of tasks in the queue
        """
        if self.model_semaphore is None:
            return 0
        else:
            return (
                self.model_semaphore._value
                if hasattr(self.model_semaphore, "_value")
                else 0
            ) + (
                len(self.model_semaphore._waiters)
                if hasattr(self.model_semaphore, "_waiters")
                and self.model_semaphore._waiters is not None
                else 0
            )

    def get_status(self):
        """
        Get the current status of the worker.

        Returns:
            dict: Status information including speed and queue length
        """
        return {
            "speed": 1,
            "queue_length": self.get_queue_length(),
            "model_status": self.get_model_status(),
        }

    @torch.inference_mode()
    def generate(self, uid, params):
        """
        Generate a 3D model from the given parameters.

        Args:
            uid: Unique identifier for this generation task
            params (dict): Generation parameters including image and options

        Returns:
            tuple: (file_path, uid) - Path to generated file and task ID
        """
        start_time = time.time()
        logger.info(f"Generating 3D model for uid: {uid}")

        # Set generating flag to prevent idle unloading
        self._generating = True

        # Update activity timestamp
        self._last_activity = time.time()

        # Handle input image
        if "image" in params:
            image = params["image"]
            image = load_image_from_base64(image)
        else:
            raise ValueError("No input image provided")

        # Remove background if needed (before converting to RGBA)
        remove_background = params.get("remove_background", True)
        original_mode = image.mode
        if remove_background:
            if image.mode == "RGB":
                image = self.rembg(image)
                logger.info("Background removed from RGB image")
            elif image.mode == "RGBA":
                # Check if image already has transparency
                # Still run rembg to ensure proper background removal
                image = self.rembg(image)
                logger.info("Background removed from RGBA image")

        # Convert to RGBA for processing
        image = image.convert("RGBA")

        # Generate mesh
        try:
            mesh = self.pipeline(image=image)[0]
            logger.info(
                "---Shape generation takes %s seconds ---" % (time.time() - start_time)
            )
        except Exception as e:
            logger.error(f"Shape generation failed: {e}")
            self._generating = False
            raise ValueError(f"Failed to generate 3D mesh: {str(e)}")

        # Apply face reduction if target_face_num is specified
        target_face_num = params.get("target_face_num", 0)
        if target_face_num > 0:
            try:
                face_reducer = FaceReducer()
                mesh = face_reducer(mesh, max_facenum=target_face_num)
                logger.info(f"Reduced mesh to target face count: {target_face_num}")
            except Exception as e:
                logger.warning(f"Face reduction failed, using original mesh: {e}")

        # Export initial mesh without texture
        initial_save_path = os.path.join(self.save_dir, f"{str(uid)}_initial.glb")
        mesh.export(initial_save_path)

        # Generate textured mesh
        texture = params.get("texture", True)
        if texture:
            try:
                # Update texture settings from params if provided
                texture_resolution = params.get("texture_resolution", 768)
                texture_views = params.get("texture_views", 9)

                if hasattr(self._paint_pipeline, "config"):
                    old_res = self._paint_pipeline.config.resolution
                    old_views = self._paint_pipeline.config.max_selected_view_num
                    self._paint_pipeline.config.resolution = texture_resolution
                    self._paint_pipeline.config.max_selected_view_num = texture_views
                    logger.info(
                        f"Texture settings: resolution {old_res}->{texture_resolution}, views {old_views}->{texture_views}"
                    )

                output_mesh_path_obj = os.path.join(
                    self.save_dir, f"{str(uid)}_texturing.obj"
                )
                textured_path_obj = self.paint_pipeline(
                    mesh_path=initial_save_path,
                    image_path=image,
                    output_mesh_path=output_mesh_path_obj,
                    save_glb=False,
                )
                logger.info(
                    "---Texture generation takes %s seconds ---"
                    % (time.time() - start_time)
                )

                # Convert textured OBJ to GLB with PBR support
                logger.info("Converting textured OBJ to GLB")
                glb_path_textured = os.path.join(
                    self.save_dir, f"{str(uid)}_texturing.glb"
                )
                quick_convert_with_obj2gltf(textured_path_obj, glb_path_textured)

                final_save_path = os.path.join(
                    self.save_dir, f"{str(uid)}_textured.glb"
                )
                os.rename(glb_path_textured, final_save_path)
                logger.info(f"Final save path: {final_save_path}")

            except Exception as e:
                logger.error(f"Texture generation failed: {e}")
                # Fall back to untextured mesh
                final_save_path = initial_save_path
                logger.warning(f"Using untextured mesh as fallback: {final_save_path}")
                self._generating = False
        else:
            final_save_path = initial_save_path
            self._generating = False

        if self.low_vram_mode:
            torch.cuda.empty_cache()

        logger.info(
            "---Total generation takes %s seconds ---" % (time.time() - start_time)
        )

        # Clear generating flag and update activity timestamp
        self._generating = False
        self._last_activity = time.time()

        return final_save_path, uid

    def cleanup_cache(self, max_files=100):
        """Clean up old cached files to prevent disk space issues."""
        files = [os.path.join(self.save_dir, f) for f in os.listdir(self.save_dir)]
        if len(files) > max_files:
            files.sort(key=lambda x: os.path.getmtime(x))
            for f in files[:-max_files]:
                try:
                    os.remove(f)
                    logger.info(f"Removed old cache file: {f}")
                except Exception as e:
                    logger.warning(f"Failed to remove {f}: {e}")

    def __del__(self):
        """Cleanup on destruction."""
        self._idle_monitor_running = False
        self._unload_models()


# Keep backward compatibility with original ModelWorker
ModelWorker = LazyModelWorker
