---
name: image-to-3d
description: Converts 2D images into 3D models (.glb/.obj) using Hunyuan3D-2.1. Use this skill when the user explicitly asks to generate or create a 3D asset from a picture.
---
# Image to 3D Agent Skill

This skill allows you (the AI agent) to convert 2D images into 3D meshes with PBR textures. It is a wrapper around a state-of-the-art AI model (Hunyuan3D-2.1). 

## How to use this skill
You have two ways to interact with this skill:

### Option 1: CLI Wrapper (If running locally via terminal)
You can run the `npx` command from the root of this project:
```bash
# Generate a 3D model with background removal and textures (default)
npx image-to-3d /path/to/input.png -o /path/to/output.glb

# Disable background removal and textures (faster)
npx image-to-3d /path/to/input.png -o /path/to/output.glb --no-bg --no-texture
```
*Note: The CLI blocks and polls the backend API until completion. It takes 1-3 minutes. Do not interrupt it.*

### Option 2: Model Context Protocol (MCP) Server
If your agent framework supports MCP, you can connect to `node mcp.js` to expose the following tools:
1. `check_server_status`: Use this first to ensure the backend is running.
2. `generate_3d_model`: Takes an `imagePath` and an `outputPath`. Returns success or semantic error messages.

## Important Rules for the Agent
1. **Always check the backend:** The actual GPU computation happens on a Python FastAPI backend (usually `http://localhost:8081`). If the CLI or MCP tool fails, check that the user has started the backend server (`python api_server_enhanced.py`).
2. **Patience:** 3D generation is incredibly computationally heavy. Expect a single call to take anywhere from 60 seconds to 3 minutes depending on the user's GPU.
3. **Format:** Only `.glb` (glTF binary) format is officially supported for the output.
4. **Input Constraints:** The image should ideally feature a single, clear subject in the center. While the tool attempts background removal automatically, highly cluttered images might fail.
