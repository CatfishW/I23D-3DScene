#!/bin/bash
# UniRig Complete Pipeline - Fixed version

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

# Create working directories
WORK_DIR=$(mktemp -d)
EXTRACTED_DIR="$WORK_DIR/extracted"
SKELETON_DIR="$WORK_DIR/skeleton"

mkdir -p "$EXTRACTED_DIR"
mkdir -p "$SKELETON_DIR"

echo "Working in: $WORK_DIR"
echo "Input: $INPUT"

# Step 1: Extract mesh
echo "Step 1: Extract..."
cp "$INPUT" "$WORK_DIR/"
INPUT_COPY="$WORK_DIR/$INPUT_BASENAME"

bash launch/inference/extract.sh \
    --config configs/data/quick_inference.yaml \
    --require_suffix "glb,fbx,obj" \
    --force_override true \
    --input "$INPUT_COPY" \
    --output_dir "$EXTRACTED_DIR" 2>&1 | tail -3

# Step 2: Generate skeleton with npz export
echo "Step 2: Skeleton..."
# Use the generated npz from extract as raw_data.npz
# The skeleton model will read from raw_data.npz and create predict_skeleton.npz

# Copy raw_data to where skeleton expects it
if [ -f "$EXTRACTED_DIR/raw_data.npz" ]; then
    cp "$EXTRACTED_DIR/raw_data.npz" "$SKELETON_DIR/raw_data.npz"
fi

# Run skeleton inference (with proper npz output)
python run.py \
    --task=configs/task/quick_inference_skeleton_articulationxl_ar_256.yaml \
    --input="$INPUT_COPY" \
    --npz_dir="$SKELETON_DIR" \
    --output_dir="$SKELETON_DIR" \
    --seed=12345 2>&1 | tail -10

# Find the skeleton FBX
SKELETON_FBX=$(find "$SKELETON_DIR" -name "skeleton.fbx" 2>/dev/null | head -1)

# Copy skeleton
if [ -n "$SKELETON_FBX" ] && [ -f "$SKELETON_FBX" ]; then
    cp "$SKELETON_FBX" "$OUTPUT"
    echo "Skeleton saved to: $OUTPUT"
else
    # Fallback
    SKELETON_FBX=$(find "$EXTRACTED_DIR" -name "*skeleton*.fbx" 2>/dev/null | head -1)
    if [ -n "$SKELETON_FBX" ] && [ -f "$SKELETON_FBX" ]; then
        cp "$SKELETON_FBX" "$OUTPUT"
    else
        echo "ERROR: No skeleton found"
        rm -rf "$WORK_DIR"
        exit 1
    fi
fi

# Also check for predict_skeleton.npz in the skeleton dir
if [ -f "$SKELETON_DIR/predict_skeleton.npz" ]; then
    echo "Found predict_skeleton.npz, copying to extracted dir for skin step"
    cp "$SKELETON_DIR/predict_skeleton.npz" "$EXTRACTED_DIR/predict_skeleton.npz"
fi

# Step 3: Try to generate skin if npz is available
if [ -f "$EXTRACTED_DIR/predict_skeleton.npz" ]; then
    echo "Step 3: Skin..."
    SKIN_DIR="$WORK_DIR/skin"
    mkdir -p "$SKIN_DIR"
    
    # Copy the skeleton FBX to the same dir for skin inference
    cp "$OUTPUT" "$EXTRACTED_DIR/model_with_skeleton.fbx"
    
    # Run skin inference
    bash launch/inference/generate_skin.sh \
        --input "$EXTRACTED_DIR/model_with_skeleton.fbx" \
        --output_dir "$SKIN_DIR" \
        --data_name "predict_skeleton.npz" \
        --seed 12345 2>&1 | tail -10
    
    # Find skin result
    SKIN_FBX=$(find "$SKIN_DIR" -name "*result_fbx*.fbx" 2>/dev/null | head -1)
    if [ -z "$SKIN_FBX" ]; then
        SKIN_FBX=$(find "$SKIN_DIR" -name "*.fbx" 2>/dev/null | head -1)
    fi
    
    if [ -n "$SKIN_FBX" ] && [ -f "$SKIN_FBX" ]; then
        # Merge textures
        echo "Step 4: Merge..."
        MERGED="$WORK_DIR/merged.fbx"
        bash launch/inference/merge.sh \
            --source "$OUTPUT" \
            --target "$SKIN_FBX" \
            --output "$MERGED" 2>&1 | tail -3
        
        if [ -f "$MERGED" ]; then
            cp "$MERGED" "$OUTPUT"
        else
            cp "$SKIN_FBX" "$OUTPUT"
        fi
    fi
else
    echo "No predict_skeleton.npz - skipping skin step"
fi

# Cleanup
rm -rf "$WORK_DIR"

if [ -f "$OUTPUT" ]; then
    echo "OK: $(ls -lh $OUTPUT)"
else
    echo "ERROR: No output file"
    exit 1
fi

echo "Done!"
