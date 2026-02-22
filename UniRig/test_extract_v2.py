import sys
import os
import yaml
from box import Box

# Add current dir to path
sys.path.append(os.getcwd())

print("Importing extract...")
from src.data.extract import extract_builtin, get_files
print("Imported modules")

input_file = "/data/Yanlai/image-to-3d-web/backend/gradio_cache/5da634d4-edb5-4818-955a-57646fc82bee_initial.glb"
output_dir = "/tmp/test_skin_direct"
config_path = "configs/data/quick_inference.yaml"

config = Box(yaml.safe_load(open(config_path, "r")))
config.output_dataset_dir = output_dir

print("Calling get_files...")
files = get_files(
    data_name='raw_data.npz',
    inputs=input_file,
    input_dataset_dir=config.input_dataset_dir,
    output_dataset_dir=config.output_dataset_dir,
    require_suffix=['glb'],
    force_override=True,
    warning=True,
)
print(f"Files to process: {files}")

extract_builtin(
    output_folder=output_dir,
    target_count=50000,
    num_runs=1,
    id=0,
    time="test_v2",
    files=files,
)
print("Done")
