# Image to 3D Web Application

A full-stack web application that converts images to 3D models with PBR textures using Hunyuan3D-2.1.

## Features

- **Image to 3D**: Upload any image and generate a 3D model with textures
- **PBR Textures**: Physically-Based Rendering materials for realistic lighting
- **GLB Output**: Universal format compatible with Unity, Three.js, Blender
- **Real-time Progress**: WebSocket-based progress updates
- **VRAM Optimization**: Lazy model loading - models only loaded when needed, freed when idle

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Next.js 14 Frontend                      │
│  - Image Upload with preview                                │
│  - Three.js 3D Model Viewer                                 │
│  - Generation progress tracking                             │
│  - Download options (GLB)                                   │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼ HTTP/WebSocket
┌─────────────────────────────────────────────────────────────┐
│                   FastAPI Backend                           │
│  - Lazy model loading (load on request)                     │
│  - Idle timeout (free VRAM after 5 min)                     │
│  - WebSocket progress updates                               │
│  - Batch processing support                                 │
│                                                             │
│  Models:                                                    │
│  - Hunyuan3D-Shape-v2-1 (3.3B params) - Shape Generation    │
│  - Hunyuan3D-Paint-v2-1 (2B params) - PBR Texture Synthesis │
└─────────────────────────────────────────────────────────────┘
```

## Requirements

### Hardware
- **GPU**: NVIDIA GPU with 24GB+ VRAM recommended
- **RAM**: 32GB+ recommended
- **Storage**: ~20GB for models and dependencies

### Software
- Python 3.10
- Node.js 18+
- CUDA 12.4

## Quick Start

### 1. Setup Backend

```bash
# Create and activate conda environment
conda create -n hunyuan3d-web python=3.10 -y
conda activate hunyuan3d-web

# Install PyTorch
pip install torch==2.5.1 torchvision==0.20.1 torchaudio==2.5.1 --index-url https://download.pytorch.org/whl/cu124

# Go to backend directory
cd backend

# Install dependencies
pip install -r requirements.txt

# Build custom rasterizer
cd hy3dpaint/custom_rasterizer
pip install -e .
cd ../..

# Build differentiable renderer
cd hy3dpaint/DifferentiableRenderer
bash compile_mesh_painter.sh
cd ../..

# Download RealESRGAN model
wget https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth -P hy3dpaint/ckpt
```

### 2. Start Backend Server

```bash
# Activate conda environment
conda activate hunyuan3d-web

# Start the enhanced API server
cd backend
python api_server_enhanced.py --host 0.0.0.0 --port 8081 --idle-timeout 300
```

The API will be available at http://localhost:8081
- API Docs: http://localhost:8081/docs
- Health Check: http://localhost:8081/health

### 3. Setup Frontend

```bash
# Go to frontend directory
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

The web app will be available at http://localhost:3000

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/generate` | POST | Synchronous generation (returns GLB) |
| `/send` | POST | Start async generation |
| `/status/{uid}` | GET | Check generation status |
| `/ws/{uid}` | WebSocket | Real-time progress updates |
| `/models` | GET | List generated models |
| `/download/{uid}` | GET | Download generated model |
| `/health` | GET | Service health and VRAM status |

### Example: Generate 3D Model

```python
import requests
import base64

# Read and encode image
with open("input.png", "rb") as f:
    image_b64 = base64.b64encode(f.read()).decode()

# Start generation
response = requests.post("http://localhost:8081/send", json={
    "image": image_b64,
    "remove_background": True,
    "texture": True
})
uid = response.json()["uid"]

# Poll for status
import time
while True:
    status = requests.get(f"http://localhost:8081/status/{uid}").json()
    if status["status"] == "completed":
        model_b64 = status["model_base64"]
        with open("output.glb", "wb") as f:
            f.write(base64.b64decode(model_b64))
        break
    time.sleep(2)
```

## Configuration

### Backend Arguments

| Argument | Default | Description |
|----------|---------|-------------|
| `--host` | 0.0.0.0 | Server host |
| `--port` | 8081 | Server port |
| `--model_path` | tencent/Hunyuan3D-2.1 | Model path |
| `--idle-timeout` | 300 | Seconds before unloading models |
| `--low_vram_mode` | False | Enable low VRAM mode |
| `--cache-path` | ./gradio_cache | Cache directory |

### Environment Variables

Create `.env` file in frontend directory:

```env
NEXT_PUBLIC_API_URL=http://localhost:8081
```

## VRAM Management

Models are loaded lazily and freed when idle:

1. **Idle State**: No models loaded, minimal VRAM usage
2. **On Request**: Models loaded into VRAM
3. **After Generation**: Models stay loaded for faster subsequent requests
4. **After Idle Timeout** (default 5 min): Models unloaded to free VRAM

Check current status:
```bash
curl http://localhost:8081/health | jq
```

## Output Format

- **Format**: GLB (GL Transmission Format Binary)
- **Textures**: PBR materials embedded
  - Base Color (Albedo)
  - Normal Map
  - Metallic-Roughness
  - Ambient Occlusion (optional)

## Unity Integration

1. Download the generated `.glb` file
2. Drag into Unity's Assets folder
3. Unity automatically imports with PBR materials
4. Drag into your scene

## Three.js Integration

```javascript
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

const loader = new GLTFLoader();
loader.load('model.glb', (gltf) => {
  scene.add(gltf.scene);
});
```

## License

- **Hunyuan3D-2.1**: [Tencent Hunyuan Non-Commercial License](https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1/blob/main/LICENSE)
- **This Project**: For non-commercial use only

## Troubleshooting

### CUDA Out of Memory
- Use `--low_vram_mode` flag
- Reduce `--idle-timeout` to free VRAM faster
- Process one image at a time

### Build Errors
- Ensure CUDA 12.4 is installed
- Check PyTorch CUDA version matches system CUDA
- Install Visual Studio Build Tools (Windows)

### Model Download Issues
- Models download automatically from HuggingFace on first run
- Ensure stable internet connection
- Check HuggingFace access (no token required for public models)

## Credits

- [Hunyuan3D-2.1](https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1) by Tencent
- [Three.js](https://threejs.org/)
- [React Three Fiber](https://docs.pmnd.rs/react-three-fiber/)
