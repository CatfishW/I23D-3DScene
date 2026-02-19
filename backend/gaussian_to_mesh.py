"""
Gaussian to Mesh conversion utilities for FlashWorld.
Converts 3D Gaussians (PLY/SPZ format) to mesh using Open3D Poisson reconstruction.
"""

import numpy as np
import torch
from pathlib import Path
from typing import Optional, Tuple
import open3d as o3d
from plyfile import PlyData, PlyElement


def load_gaussians_from_ply(
    ply_path: str,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """
    Load Gaussian parameters from PLY file.

    Returns:
        xyz: (N, 3) positions
        opacity: (N, 1) opacity values
        scale: (N, 3) scale values
        rotation: (N, 4) rotation quaternions
        color: (N, 3) RGB colors
    """
    plydata = PlyData.read(ply_path)
    vertex = plydata["vertex"]

    xyz = np.stack([vertex["x"], vertex["y"], vertex["z"]], axis=-1).astype(np.float32)

    f_dc = (
        np.stack(
            [vertex["f_dc_0"], vertex["f_dc_1"], vertex["f_dc_2"]], axis=-1
        ).astype(np.float32)
        if "f_dc_0" in vertex.dtype.names
        else np.zeros((len(vertex), 3), dtype=np.float32)
    )

    opacity = (
        vertex["opacity"].reshape(-1, 1).astype(np.float32)
        if "opacity" in vertex.dtype.names
        else np.ones((len(vertex), 1), dtype=np.float32)
    )

    scale = (
        np.stack(
            [vertex["scale_0"], vertex["scale_1"], vertex["scale_2"]], axis=-1
        ).astype(np.float32)
        if "scale_0" in vertex.dtype.names
        else np.ones((len(vertex), 3), dtype=np.float32)
    )

    rotation = (
        np.stack(
            [vertex["rot_0"], vertex["rot_1"], vertex["rot_2"], vertex["rot_3"]],
            axis=-1,
        ).astype(np.float32)
        if "rot_0" in vertex.dtype.names
        else np.tile(np.array([1, 0, 0, 0]), (len(vertex), 1)).astype(np.float32)
    )

    color = (f_dc[:, :3] + 0.5).clip(0, 1)

    return xyz, opacity, scale, rotation, color


def load_gaussians_from_tensor(
    gaussians: torch.Tensor, T_norm: Optional[float] = None
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """
    Load Gaussian parameters from FlashWorld tensor output.

    Args:
        gaussians: (N, D) tensor with [xyz, opacity, scale, rotation, features]
        T_norm: Optional normalization factor for scaling

    Returns:
        xyz, opacity, scale, rotation, color as numpy arrays
    """
    sh_degree = (
        int(np.sqrt((gaussians.shape[-1] - 11) / 3 - 1))
        if gaussians.shape[-1] > 11
        else 0
    )

    xyz, opacity, scale, rotation, feature = gaussians.float().split(
        [3, 1, 3, 4, (sh_degree + 1) ** 2 * 3], dim=-1
    )

    xyz = xyz.detach().cpu().numpy()
    opacity = opacity.detach().cpu().numpy()
    scale = scale.detach().cpu().numpy()
    rotation = rotation.detach().cpu().numpy()
    color = feature[..., :3].detach().cpu().numpy()
    color = (color + 1) / 2

    if T_norm is not None:
        xyz = xyz * T_norm
        scale = scale * T_norm

    return xyz, opacity, scale, rotation, color


def sample_points_from_gaussians(
    xyz: np.ndarray,
    scale: np.ndarray,
    rotation: np.ndarray,
    opacity: np.ndarray,
    color: np.ndarray,
    num_samples_per_gaussian: int = 8,
    opacity_threshold: float = 0.1,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Sample points from 3D Gaussians probabilistically.

    Args:
        xyz: (N, 3) positions
        scale: (N, 3) scale values (log scale)
        rotation: (N, 4) rotation quaternions (w, x, y, z)
        opacity: (N, 1) opacity values (logit)
        color: (N, 3) RGB colors
        num_samples_per_gaussian: Number of points to sample per Gaussian
        opacity_threshold: Minimum opacity to include Gaussian

    Returns:
        points: (M, 3) sampled point positions
        colors: (M, 3) point colors
    """
    opacity_sigmoid = 1 / (1 + np.exp(-opacity.squeeze(-1)))
    mask = opacity_sigmoid > opacity_threshold

    xyz = xyz[mask]
    scale = scale[mask]
    rotation = rotation[mask]
    opacity_sigmoid = opacity_sigmoid[mask]
    color = color[mask]

    if len(xyz) == 0:
        return np.zeros((0, 3), dtype=np.float32), np.zeros((0, 3), dtype=np.float32)

    scale_exp = np.exp(scale)

    def quaternion_to_rotation_matrix(q):
        w, x, y, z = q[..., 0], q[..., 1], q[..., 2], q[..., 3]
        R = np.stack(
            [
                np.stack(
                    [
                        1 - 2 * y * y - 2 * z * z,
                        2 * x * y - 2 * w * z,
                        2 * x * z + 2 * w * y,
                    ],
                    axis=-1,
                ),
                np.stack(
                    [
                        2 * x * y + 2 * w * z,
                        1 - 2 * x * x - 2 * z * z,
                        2 * y * z - 2 * w * x,
                    ],
                    axis=-1,
                ),
                np.stack(
                    [
                        2 * x * z - 2 * w * y,
                        2 * y * z + 2 * w * x,
                        1 - 2 * x * x - 2 * y * y,
                    ],
                    axis=-1,
                ),
            ],
            axis=-2,
        )
        return R

    R = quaternion_to_rotation_matrix(rotation)

    all_points = []
    all_colors = []

    for i in range(len(xyz)):
        local_samples = (
            np.random.randn(num_samples_per_gaussian, 3) * scale_exp[i : i + 1] * 0.3
        )
        world_samples = (local_samples @ R[i].T) + xyz[i]

        all_points.append(world_samples)
        all_colors.append(np.tile(color[i], (num_samples_per_gaussian, 1)))

    points = np.concatenate(all_points, axis=0).astype(np.float32)
    colors = np.concatenate(all_colors, axis=0).astype(np.float32)

    return points, colors


def estimate_normals_from_points(points: np.ndarray) -> np.ndarray:
    """
    Estimate normals from point cloud using Open3D.

    Args:
        points: (N, 3) point positions

    Returns:
        normals: (N, 3) estimated normals
    """
    pcd = o3d.geometry.PointCloud()
    pcd.points = o3d.utility.Vector3dVector(points)

    pcd.estimate_normals(
        search_param=o3d.geometry.KDTreeSearchParamHybrid(radius=0.1, max_nn=30)
    )

    normals = np.asarray(pcd.normals)
    return normals


def poisson_reconstruction(
    points: np.ndarray,
    normals: np.ndarray,
    colors: Optional[np.ndarray] = None,
    depth: int = 9,
    width: float = 0,
    scale: float = 1.1,
    linear_fit: bool = False,
) -> o3d.geometry.TriangleMesh:
    """
    Run Poisson surface reconstruction.

    Args:
        points: (N, 3) point positions
        normals: (N, 3) normal vectors
        colors: (N, 3) point colors (optional)
        depth: Maximum depth of the octree (higher = more detail)
        width: Target width of the finest level octree cells
        scale: Ratio between reconstruction cube and bounding box
        linear_fit: Use linear interpolation for color

    Returns:
        mesh: Open3D TriangleMesh
    """
    pcd = o3d.geometry.PointCloud()
    pcd.points = o3d.utility.Vector3dVector(points)
    pcd.normals = o3d.utility.Vector3dVector(normals)

    if colors is not None:
        pcd.colors = o3d.utility.Vector3dVector(colors)

    mesh, densities = o3d.geometry.TriangleMesh.create_from_point_cloud_poisson(
        pcd, depth=depth, width=width, scale=scale, linear_fit=linear_fit
    )

    densities = np.asarray(densities)
    density_threshold = np.quantile(densities, 0.05)
    vertices_to_remove = densities < density_threshold
    mesh.remove_vertices_by_mask(vertices_to_remove)

    mesh.compute_vertex_normals()

    return mesh


def mesh_to_glb(mesh: o3d.geometry.TriangleMesh, output_path: str) -> str:
    """
    Export mesh to GLB format.

    Args:
        mesh: Open3D TriangleMesh
        output_path: Output file path (should end with .glb)

    Returns:
        output_path: Path to the saved GLB file
    """
    mesh_path = output_path.replace(".glb", ".obj")
    o3d.io.write_triangle_mesh(mesh_path, mesh)

    import trimesh

    mesh_trimesh = trimesh.load(mesh_path)

    if output_path.endswith(".glb"):
        mesh_trimesh.export(output_path, file_type="glb")
    else:
        mesh_trimesh.export(output_path)

    import os

    if os.path.exists(mesh_path):
        os.remove(mesh_path)

    return output_path


def gaussians_to_mesh(
    gaussians_source,
    output_path: str,
    source_type: str = "tensor",
    T_norm: Optional[float] = None,
    num_samples_per_gaussian: int = 16,
    opacity_threshold: float = 0.1,
    poisson_depth: int = 9,
    max_points: int = 500000,
) -> str:
    """
    Convert 3D Gaussians to mesh.

    Args:
        gaussians_source: Either a file path (str) or torch.Tensor
        output_path: Output path for GLB file
        source_type: 'tensor' for FlashWorld output, 'ply' for PLY file
        T_norm: Normalization factor (for tensor source)
        num_samples_per_gaussian: Points to sample per Gaussian
        opacity_threshold: Minimum opacity threshold
        poisson_depth: Poisson reconstruction depth
        max_points: Maximum number of points to use

    Returns:
        output_path: Path to the generated GLB file
    """
    if source_type == "ply":
        xyz, opacity, scale, rotation, color = load_gaussians_from_ply(gaussians_source)
    else:
        xyz, opacity, scale, rotation, color = load_gaussians_from_tensor(
            gaussians_source, T_norm
        )

    print(f"Loaded {len(xyz)} Gaussians")

    points, colors = sample_points_from_gaussians(
        xyz,
        scale,
        rotation,
        opacity,
        color,
        num_samples_per_gaussian=num_samples_per_gaussian,
        opacity_threshold=opacity_threshold,
    )

    print(f"Sampled {len(points)} points from Gaussians")

    if len(points) > max_points:
        indices = np.random.choice(len(points), max_points, replace=False)
        points = points[indices]
        colors = colors[indices]
        print(f"Downsampled to {len(points)} points")

    if len(points) < 100:
        raise ValueError(f"Not enough points ({len(points)}) for mesh reconstruction")

    print("Estimating normals...")
    normals = estimate_normals_from_points(points)

    print("Running Poisson reconstruction...")
    mesh = poisson_reconstruction(
        points, normals, colors, depth=poisson_depth, scale=1.05
    )

    if colors is not None and len(colors) > 0:
        try:
            pcd = o3d.geometry.PointCloud()
            pcd.points = o3d.utility.Vector3dVector(points)
            pcd.colors = o3d.utility.Vector3dVector(colors)

            mesh.compute_vertex_normals()

            vertex_colors = np.zeros((len(mesh.vertices), 3))
            pcd_tree = o3d.geometry.KDTreeFlann(pcd)

            for i, vertex in enumerate(mesh.vertices):
                _, idx, _ = pcd_tree.search_knn_vector_3d(vertex, 5)
                if len(idx) > 0:
                    vertex_colors[i] = np.mean(colors[idx], axis=0)

            mesh.vertex_colors = o3d.utility.Vector3dVector(vertex_colors)
        except Exception as e:
            print(f"Warning: Could not assign vertex colors: {e}")

    print(f"Mesh has {len(mesh.vertices)} vertices and {len(mesh.triangles)} triangles")

    print(f"Exporting to {output_path}...")
    mesh_to_glb(mesh, output_path)

    return output_path


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Convert Gaussian splat to mesh")
    parser.add_argument("input", type=str, help="Input PLY file or tensor path")
    parser.add_argument(
        "--output", "-o", type=str, required=True, help="Output GLB path"
    )
    parser.add_argument("--samples", type=int, default=16, help="Samples per Gaussian")
    parser.add_argument(
        "--depth", type=int, default=9, help="Poisson reconstruction depth"
    )
    parser.add_argument(
        "--opacity-threshold", type=float, default=0.1, help="Opacity threshold"
    )

    args = parser.parse_args()

    source_type = "ply" if args.input.endswith(".ply") else "tensor"
    gaussians_to_mesh(
        args.input,
        args.output,
        source_type=source_type,
        num_samples_per_gaussian=args.samples,
        poisson_depth=args.depth,
        opacity_threshold=args.opacity_threshold,
    )
