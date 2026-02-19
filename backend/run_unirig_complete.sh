#!/bin/bash
# UniRig Complete Pipeline - Fixed version with proper skinning
# Based on README: skin step takes skeleton FBX as input

CUDA_DEVICE=${1:-1}
INPUT=$2
OUTPUT=$3

echo "UniRig Complete: INPUT=$INPUT OUTPUT=$OUTPUT"

cd /data/Yanlai/image-to-3d-web/UniRig

source ~/anaconda3/etc/profile.d/conda.sh
conda activate unirig

export CUDA_VISIBLE_DEVICES=$CUDA_DEVICE

# Work in same directory as input
INPUT_DIR=$(dirname "$INPUT")
INPUT_BASENAME=$(basename "$INPUT")
INPUT_NAME="${INPUT_BASENAME%.glb}"

echo "Working in: $INPUT_DIR"
echo "Input: $INPUT"

# Step 1: Extract mesh from original input
echo "Step 1: Extract mesh..."
bash launch/inference/extract.sh \
    --config configs/data/quick_inference.yaml \
    --require_suffix "glb,fbx,obj" \
    --force_override true \
    --input "$INPUT" \
    --output_dir "$INPUT_DIR" 2>&1 | tail -3

# Find extracted directory
EXTRACTED_DIR=""
for dir in "$INPUT_DIR/${INPUT_NAME}"*; do
    if [ -d "$dir" ] && [ -f "$dir/raw_data.npz" ]; then
        EXTRACTED_DIR="$dir"
        break
    fi
done
if [ -z "$EXTRACTED_DIR" ]; then
    EXTRACTED_DIR="$INPUT_DIR/${INPUT_NAME}_textured"
fi
echo "Using extracted dir: $EXTRACTED_DIR"

# Step 2: Generate skeleton
echo "Step 2: Generate skeleton..."
bash launch/inference/generate_skeleton.sh \
    --input "$INPUT" \
    --output_dir "$INPUT_DIR" \
    --seed 12345 2>&1 | tail -5

# Find skeleton FBX
SKELETON_FBX=$(find "$EXTRACTED_DIR" -name "skeleton.fbx" 2>/dev/null | head -1)
if [ -z "$SKELETON_FBX" ]; then
    # Try parent dir
    SKELETON_FBX=$(find "$INPUT_DIR" -name "skeleton.fbx" 2>/dev/null | head -1)
fi
echo "Skeleton: $SKELETON_FBX"

if [ -z "$SKELETON_FBX" ] || [ ! -f "$SKELETON_FBX" ]; then
    echo "ERROR: Skeleton not found"
    exit 1
fi

# Step 3: Try UniRig skinning
echo "Step 3: Try UniRig skinning..."
SKELETON_EXTRACTED="$EXTRACTED_DIR/skeleton"
mkdir -p "$SKELETON_EXTRACTED"
bash launch/inference/extract.sh \
    --config configs/data/quick_inference.yaml \
    --require_suffix "fbx,FBX" \
    --force_override true \
    --input "$SKELETON_FBX" \
    --output_dir "$SKELETON_EXTRACTED" 2>&1 | tail -3

# Copy skeleton data for skin step
if [ -f "$SKELETON_EXTRACTED/raw_data.npz" ]; then
    cp "$SKELETON_EXTRACTED/raw_data.npz" "$EXTRACTED_DIR/raw_data.npz"
    
    # Try skinning
    SKIN_DIR="$INPUT_DIR/skin_$$"
    mkdir -p "$SKIN_DIR"
    
    bash launch/inference/generate_skin.sh \
        --input "$SKELETON_FBX" \
        --output_dir "$SKIN_DIR" \
        --data_name "raw_data.npz" \
        --seed 12345 2>&1 | tail -5
    
    # Check for skin result
    SKIN_FBX=$(find "$SKELETON_EXTRACTED" -name "predict.fbx" 2>/dev/null | head -1)
    
    if [ -z "$SKIN_FBX" ] || [ ! -f "$SKIN_FBX" ]; then
        echo "UniRig skinning failed, using Blender fallback..."
        rm -rf "$SKIN_DIR"
    fi
fi

# Step 4: If no skin from UniRig, use Blender auto-skinning
if [ -z "$SKIN_FBX" ] || [ ! -f "$SKIN_FBX" ]; then
    echo "Step 4: Applying Blender auto-skinning..."
    
    # Create a temporary skinned output path
    SKINNED_OUTPUT="${OUTPUT%.fbx}_skinned.glb"
    
    # Use Blender to apply automatic skin weights
    export AUTO_SKIN_MESH="$INPUT"
    export AUTO_SKIN_SKELETON="$SKELETON_FBX"
    export AUTO_SKIN_OUTPUT="$SKINNED_OUTPUT"
    
    blender -b -P /data/Yanlai/image-to-3d-web/backend/auto_skin.py 2>&1 | tail -10
    
    if [ -f "$SKINNED_OUTPUT" ]; then
        # Copy to expected output location
        cp "$SKINNED_OUTPUT" "$OUTPUT"
    elif [ ! -f "$OUTPUT" ]; then
        # Fallback to skeleton only
        cp "$SKELETON_FBX" "$OUTPUT"
    fi
else
    # Merge with original mesh textures
    echo "Step 5: Merge with original textures..."
    MERGED="$INPUT_DIR/merged.fbx"
    bash launch/inference/merge.sh \
        --source "$SKELETON_FBX" \
        --target "$SKIN_FBX" \
        --output "$MERGED" 2>&1 | tail -3
    
    if [ -f "$MERGED" ]; then
        cp "$MERGED" "$OUTPUT"
    else
        cp "$SKIN_FBX" "$OUTPUT"
    fi
fi

# Cleanup
rm -rf "$SKIN_DIR" 2>/dev/null || true
rm -rf "$SKELETON_EXTRACTED" 2>/dev/null || true

if [ -f "$OUTPUT" ]; then
    echo "OK: $(ls -lh $OUTPUT)"
else
    echo "ERROR: No output file"
    exit 1
fi

echo "Done!"
