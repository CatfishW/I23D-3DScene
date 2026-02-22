const API_URL = process.env.NEXT_PUBLIC_API_URL || '/I23D/api';

export async function removeBackground(imageBase64: string): Promise<string> {
  const response = await fetch(`${API_URL}/remove-background`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image: imageBase64,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to remove background: ${error}`);
  }

  const data = await response.json();
  return data.image;
}

export interface GenerationResult {
  uid: string;
  modelUrl: string;
  modelBase64?: string;
}

export interface StatusResponse {
  status: string;
  model_base64?: string;
  progress?: number;
  message?: string;
}

export interface HealthResponse {
  status: string;
  worker_id: string;
  model_status: {
    shape_pipeline_loaded: boolean;
    paint_pipeline_loaded: boolean;
    rembg_loaded: boolean;
    vram_usage: {
      allocated_gb: number;
      reserved_gb: number;
    };
  };
  queue_length: number;
}

export interface GenerationOptions {
  removeBackground?: boolean;
  texture?: boolean;
  seed?: number;
  octreeResolution?: number;
  numInferenceSteps?: number;
  guidanceScale?: number;
  targetFaceNum?: number;
  textureResolution?: number;
  textureViews?: number;
}

/**
 * Start async generation and poll for status
 */
export async function generate3D(
  imageBase64: string,
  onProgress?: (progress: number, stage: string) => void,
  options: GenerationOptions = {}
): Promise<GenerationResult> {
  const {
    removeBackground = true,
    texture = true,
    seed = 1234,
    octreeResolution = 256,
    numInferenceSteps = 5,
    guidanceScale = 5.0,
    targetFaceNum = 10000,
    textureResolution = 768,
    textureViews = 9
  } = options;

  onProgress?.(5, 'Starting generation...');

  // Start async generation
  const response = await fetch(`${API_URL}/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image: imageBase64,
      remove_background: removeBackground,
      texture,
      seed,
      octree_resolution: octreeResolution,
      num_inference_steps: numInferenceSteps,
      guidance_scale: guidanceScale,
      target_face_num: targetFaceNum,
      texture_resolution: textureResolution,
      texture_views: textureViews,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to start generation: ${error}`);
  }

  const { uid } = await response.json();
  onProgress?.(10, 'Queued...');

  // Poll for status
  let status: StatusResponse;
  let attempts = 0;
  const maxAttempts = 600; // 10 minutes max

  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 1000));

    const statusResponse = await fetch(`${API_URL}/status/${uid}`, { cache: 'no-store' });
    status = await statusResponse.json();

    if (status.status === 'completed') {
      onProgress?.(100, 'Completed!');
      // Create blob URL from base64
      const modelBase64 = status.model_base64!;
      const byteCharacters = atob(modelBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'model/gltf-binary' });
      const modelUrl = URL.createObjectURL(blob);

      return {
        uid,
        modelUrl,
        modelBase64,
      };
    }

    if (status.status === 'error') {
      throw new Error(status.message || 'Generation failed');
    }

    // Update progress
    const progressValue = status.progress || 0;
    let stageText = 'Processing...';

    if (status.status === 'loading_models') {
      stageText = 'Loading models...';
    } else if (status.status === 'texturing') {
      stageText = 'Generating textures...';
    } else if (status.status === 'processing') {
      stageText = 'Generating mesh...';
    }

    onProgress?.(Math.max(progressValue, 15), stageText);

    attempts++;
  }

  throw new Error('Generation timed out');
}


export interface RiggingResult {
  uid: string;
  modelUrl: string;
  status: string;
}

/**
 * Start rigging task for an existing model
 */
export async function rigModel(
  modelUid: string,
  onProgress?: (progress: number, stage: string) => void,
  device: string = "cuda:1"
): Promise<RiggingResult> {
  // Start rigging task
  const response = await fetch(`${API_URL}/rig`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model_uid: modelUid,
      device: device,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to start rigging: ${error}`);
  }

  const { uid } = await response.json();
  onProgress?.(10, 'Rigging queued...');

  // Poll for status
  let attempts = 0;
  const maxAttempts = 600; // 10 minutes max

  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 2000));

    const statusResponse = await fetch(`${API_URL}/rig/${uid}/status`, { cache: 'no-store' });
    const status = await statusResponse.json();

    if (status.status === 'completed') {
      onProgress?.(100, 'Rigging completed!');

      // Get the rigged model URL
      const downloadResponse = await fetch(`${API_URL}/rig/${uid}/download`);
      const blob = await downloadResponse.blob();
      let modelUrl = URL.createObjectURL(blob);

      // Detect if the file is FBX from response headers and tag the blob URL
      const contentDisposition = downloadResponse.headers.get('content-disposition') || '';
      const contentType = downloadResponse.headers.get('content-type') || '';
      if (contentDisposition.includes('.fbx') || contentType === 'application/octet-stream') {
        modelUrl += '#.fbx';
      }

      return {
        uid,
        modelUrl,
        status: 'completed',
      };
    }

    if (status.status.startsWith('error')) {
      throw new Error(`Rigging failed: ${status.status}`);
    }

    // Update progress
    const progressValue = status.progress || 0;
    let stageText = 'Rigging in progress...';

    if (status.progress && status.progress < 30) {
      stageText = 'Generating skeleton...';
    } else if (status.progress && status.progress < 70) {
      stageText = 'Computing skinning weights...';
    } else {
      stageText = 'Merging skeleton and mesh...';
    }

    onProgress?.(progressValue, stageText);
    attempts++;
  }

  throw new Error('Rigging timed out');
}


/**
 * Fetch a model URL as a blob and return a blob URL with format detection.
 * Needed for rigged models where the API URL doesn't indicate file format.
 */
export async function fetchModelAsBlob(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  let blobUrl = URL.createObjectURL(blob);

  // Detect FBX from response headers
  const contentDisposition = response.headers.get('content-disposition') || '';
  const contentType = response.headers.get('content-type') || '';
  if (contentDisposition.includes('.fbx') || contentType === 'application/octet-stream') {
    blobUrl += '#.fbx';
  }

  return blobUrl;
}

export interface HistoryItem {
  uid: string;
  created_at: string;
  type: 'textured' | 'rigged';
  model_url: string;
  rigged_from?: string;
}

/**
 * Get generation history
 */
export async function getHistory(limit: number = 50): Promise<HistoryItem[]> {
  const response = await fetch(`${API_URL}/history?limit=${limit}&t=${Date.now()}`, { cache: 'no-store' });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get history: ${error}`);
  }

  const data = await response.json();
  return data.history;
}

/**
 * Check API health
 */
export async function checkHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API_URL}/health`);
  return response.json();
}

/**
 * Get list of generated models
 */
export async function getModels(limit = 20, offset = 0): Promise<{
  models: Array<{
    uid: string;
    file_name: string;
    file_size: number;
    created_at: string;
    download_url: string;
  }>;
  count: number;
}> {
  const response = await fetch(`${API_URL}/models?limit=${limit}&offset=${offset}&t=${Date.now()}`, { cache: 'no-store' });
  return response.json();
}

/**
 * Delete a generated model
 */
export async function deleteModel(uid: string): Promise<void> {
  await fetch(`${API_URL}/models/${uid}`, { method: 'DELETE' });
}

// ============================================
// FlashWorld API Client (port 8082)
// ============================================

const FLASHWORLD_API_URL = process.env.NEXT_PUBLIC_FLASHWORLD_API_URL || '/I23D/api/flashworld';

export interface FlashWorldGenerationParams {
  numFrames: 24 | 48;
  resolution: '480p' | '720p';
  poissonDepth: number;
  opacityThreshold: number;
  textPrompt?: string;
  generateVideo?: boolean;
  videoFps?: number;
}

export interface FlashWorldGenerationResult {
  uid: string;
  modelUrl: string;
  gaussianUrl?: string;
  videoUrl?: string;
}

export interface FlashWorldStatusResponse {
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress?: number;
  stage?: string;
  message?: string;
}

export function startFlashWorldGeneration(
  imageBase64: string | null,
  params: FlashWorldGenerationParams
): Promise<{ uid: string }> {
  return fetch(`${FLASHWORLD_API_URL}/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image: imageBase64,
      text_prompt: params.textPrompt || "",
      num_frames: params.numFrames,
      resolution: params.resolution,
      poisson_depth: params.poissonDepth,
      opacity_threshold: params.opacityThreshold,
      generate_video: params.generateVideo || false,
      video_fps: params.videoFps || 15,
    }),
  }).then(async (response) => {
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to start generation: ${error}`);
    }
    return response.json();
  });
}

export function getFlashWorldStatus(uid: string): Promise<FlashWorldStatusResponse> {
  return fetch(`${FLASHWORLD_API_URL}/status/${uid}`, { cache: 'no-store' }).then((response) => response.json());
}

export function getFlashWorldDownloadUrl(uid: string): string {
  return `${FLASHWORLD_API_URL}/download/${uid}`;
}

export function getFlashWorldGaussianDownloadUrl(uid: string): string {
  return `${FLASHWORLD_API_URL}/download/${uid}/gaussians`;
}

export function getFlashWorldVideoDownloadUrl(uid: string): string {
  return `${FLASHWORLD_API_URL}/download/${uid}/video`;
}

export async function generateFlashWorld(
  imageBase64: string | null,
  params: FlashWorldGenerationParams,
  onProgress?: (progress: number, stage: string) => void
): Promise<FlashWorldGenerationResult> {
  onProgress?.(5, 'Starting generation...');

  const { uid } = await startFlashWorldGeneration(imageBase64, params);
  onProgress?.(10, 'Queued...');

  let attempts = 0;
  const maxAttempts = 600;

  while (attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const status = await getFlashWorldStatus(uid);

    if (status.status === 'completed') {
      onProgress?.(100, 'Completed!');
      const modelUrl = getFlashWorldDownloadUrl(uid);
      const gaussianUrl = getFlashWorldGaussianDownloadUrl(uid);
      let videoUrl: string | undefined;

      if (params.generateVideo) {
        videoUrl = getFlashWorldVideoDownloadUrl(uid);
      }

      return { uid, modelUrl, gaussianUrl, videoUrl };
    }

    if (status.status === 'error') {
      throw new Error(status.message || 'Generation failed');
    }

    const progressValue = status.progress || 0;
    const stageText = status.stage || 'Processing...';
    onProgress?.(Math.max(progressValue, 15), stageText);

    attempts++;
  }

  throw new Error('Generation timed out');
}
