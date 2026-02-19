#!/bin/bash
# Wrapper script to run UniRig skeleton generation

CUDA_DEVICE=${1:-1}
INPUT=$2
OUTPUT=$3

echo "UniRig Wrapper: CUDA=$CUDA_DEVICE INPUT=$INPUT OUTPUT=$OUTPUT"

cd /data/Yanlai/image-to-3d-web/UniRig

source ~/anaconda3/etc/profile.d/conda.sh
conda activate unirig

export CUDA_VISIBLE_DEVICES=$CUDA_DEVICE

# Generate skeleton - output goes to the input directory by default
OUTPUT_DIR=$(dirname "$INPUT")
echo "Generating skeleton in directory: $OUTPUT_DIR"
bash launch/inference/generate_skeleton.sh --input "$INPUT" --output_dir "$OUTPUT_DIR" --seed 12345

# Find and copy the skeleton file
SKELETON_FILE=$(find "$OUTPUT_DIR" -name "*skeleton*.fbx" 2>/dev/null | head -1)
if [ -n "$SKELETON_FILE" ] && [ -f "$SKELETON_FILE" ]; then
    cp "$SKELETON_FILE" "$OUTPUT"
    echo "Copied skeleton to: $OUTPUT"
else
    echo "ERROR: Could not find skeleton file"
    exit 1
fi
