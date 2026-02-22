#!/bin/bash
# Start the Unified 3D Backend Server (I23D + FlashWorld + UniRig)
# Uses the unified-3d conda environment

cd /data/Yanlai/image-to-3d-web/backend

source ~/anaconda3/etc/profile.d/conda.sh
conda activate unified-3d

echo "Starting Unified 3D Backend..."
python unified_server.py --port 23555
