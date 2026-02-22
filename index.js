import axios from 'axios';
import fs from 'fs';
import path from 'path';

export class ImageTo3DClient {
  constructor(baseUrl = process.env.I23D_API_URL || 'http://localhost:8081') {
    this.baseUrl = baseUrl;
    // Strip trailing slash if present
    if (this.baseUrl.endsWith('/')) {
      this.baseUrl = this.baseUrl.slice(0, -1);
    }
  }

  async isReady() {
    try {
      const response = await axios.get(`${this.baseUrl}/health`, { timeout: 2000 });
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  encodeImage(imagePath) {
    if (!fs.existsSync(imagePath)) {
      throw new Error(`File not found: ${imagePath}`);
    }
    const fileData = fs.readFileSync(imagePath);
    return fileData.toString('base64');
  }

  /**
   * Generates a 3D model from an image
   * @param {Object} options 
   * @param {string} options.imagePath Path to the input image
   * @param {string} options.outputPath Path to save the generated model (.glb)
   * @param {boolean} [options.removeBackground=true] Whether to remove the background
   * @param {boolean} [options.texture=true] Whether to generate textures
   * @param {number} [options.seed=1234] Random seed
   * @param {number} [options.octreeResolution=256] Mesh resolution
   * @param {number} [options.numInferenceSteps=50] Generation steps
   * @param {number} [options.guidanceScale=5.5] Generation guidance
   * @param {Function} [options.onProgress] Callback function for progress updates
   * @returns {Promise<string>} Path to the generated model
   */
  async generateModel(options) {
    const {
      imagePath,
      outputPath,
      removeBackground = true,
      texture = true,
      seed = 1234,
      octreeResolution = 256,
      numInferenceSteps = 50,
      guidanceScale = 5.5,
      onProgress
    } = options;

    if (!await this.isReady()) {
      throw new Error(`Image-to-3D backend is not reachable at ${this.baseUrl}. Is it running?`);
    }

    const imageB64 = this.encodeImage(imagePath);

    const payload = {
      image: imageB64,
      remove_background: removeBackground,
      texture,
      seed,
      octree_resolution: octreeResolution,
      num_inference_steps: numInferenceSteps,
      guidance_scale: guidanceScale,
      type: 'glb'
    };

    // Use /send for async processing
    const sendResponse = await axios.post(`${this.baseUrl}/send`, payload);
    const uid = sendResponse.data.uid;
    
    if (onProgress) {
      onProgress({ status: 'started', uid, progress: 0 });
    }

    return new Promise((resolve, reject) => {
      const pollInterval = setInterval(async () => {
        try {
          const statusResp = await axios.get(`${this.baseUrl}/status/${uid}`);
          const data = statusResp.data;
          
          if (onProgress && data.status) {
            onProgress(data);
          }

          if (data.status === 'completed') {
            clearInterval(pollInterval);
            
            // The model is returned as base64
            if (!data.model_base64) {
              return reject(new Error('Generation completed but no model data returned'));
            }
            
            const modelBuffer = Buffer.from(data.model_base64, 'base64');
            fs.writeFileSync(outputPath, modelBuffer);
            resolve(outputPath);
          } else if (data.status === 'error' || data.status === 'failed') {
            clearInterval(pollInterval);
            reject(new Error(data.message || data.error || 'Unknown generation error'));
          }
        } catch (error) {
          clearInterval(pollInterval);
          reject(new Error(`Polling error: ${error.message}`));
        }
      }, 5000); // Poll every 5 seconds
    });
  }
}

export default ImageTo3DClient;
