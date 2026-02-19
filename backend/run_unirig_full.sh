#!/bin/bash
# Complete UniRig pipeline: skeleton + auto-skinning + texture merge

CUDA_DEVICE=${1:-1}
INPUT=$2
OUTPUT=$3

echo "UniRig Complete Pipeline: CUDA=$CUDA_DEVICE INPUT=$INPUT OUTPUT=$OUTPUT"

cd /data/Yanlai/image-to-3d-web/UniRig

source ~/anaconda3/etc/profile.d/conda.sh
conda activate unirig

export CUDA_VISIBLE_DEVICES=$CUDA_DEVICE

TEMP_DIR="/tmp/unirig_$$"
mkdir -p "$TEMP_DIR"
NPZ_DIR="$TEMP_DIR/npz"
mkdir -p "$NPZ_DIR"

echo "Step 1: Extract mesh..."
# Extract creates npz in 'tmp' subdir
mkdir -p "$TEMP_DIR/tmp"
cp -r "$INPUT" "$TEMP_DIR/tmp/input.glb"
bash launch/inference/extract.sh \
    --config configs/data/quick_inference.yaml \
    --require_suffix "glb,fbx,obj" \
    --force_override true \
    --input "$TEMP_DIR/tmp/input.glb" \
    --output_dir "$TEMP_DIR/tmp"

echo "Step 2: Generate skeleton..."
SKELETON_DIR="$TEMP_DIR/skeleton"
mkdir -p "$SKELETON_DIR"
# Copy extracted data to npz dir
cp -r "$TEMP_DIR/tmp/"*".npz" "$NPZ_DIR/" 2>/dev/null || true
bash launch/inference/generate_skeleton.sh \
    --input "$TEMP_DIR/tmp/input.glb" \
    --output_dir "$SKELETON_DIR" \
    --seed 12345

echo "Step 3: Generate skin (auto-rig + weights)..."
SKIN_DIR="$TEMP_DIR/skin"
mkdir -p "$SKIN_DIR"
# Update npz with skeleton data
cp -r "$SKELETON_DIR/"*".npz" "$NPZ_DIR/" 2>/dev/null || true
bash launch/inference/generate_skin.sh \
    --input "$TEMP_DIR/tmp/input.glb" \
    --output_dir "$SKIN_DIR" \
    --seed 12345

# Find the result_fbx file
RESULT_FBX=$(find "$SKIN_DIR" -name "result_fbx*.fbx" 2>/dev/null | head -1)
if [ -z "$RESULT_FBX" ]; then
    RESULT_FBX=$(find "$SKIN_DIR" -name "*.fbx" 2>/dev/null | head -1)
fi

if [ -n "$RESULT_FBX" ] && [ -f "$RESULT_FBX" ]; then
    echo "Step 4: Merge textures..."
    # Merge original textures onto rigged model
    MERGED_FBX="$TEMP_DIR/merged.fbx"
    bash launch/inference/merge.sh \
        --source "$INPUT" \
        --target "$RESULT_FBX" \
        --output "$MERGED_FBX"
    
    if [ -f "$MERGED_FBX" ]; then
        cp "$MERGED_FBX" "$OUTPUT"
    else
        cp "$RESULT_FBX" "$OUTPUT"
    fi
else
    echo "Warning: Could not find skinned result, using original skeleton"
    SKELETON_FBX=$(find "$SKELETON_DIR" -name "skeleton*.fbx" 2>/dev/null | head -1)
    if [ -n "$SKELETON_FBX" ]; then
        cp "$SKELETON_FBX" "$OUTPUT"
    fi
fi

echo "Final output: $OUTPUT"
rm -rf "$TEMP_DIR"
echo "Done!"
