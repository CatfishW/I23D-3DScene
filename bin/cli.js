#!/usr/bin/env node
import { program } from 'commander';
import ora from 'ora';
import path from 'path';
import fs from 'fs';
import { ImageTo3DClient } from '../index.js';

program
  .version('1.0.0')
  .description('Agent Skill CLI wrapper for converting images to 3D models')
  .argument('<imagePath>', 'Path to the input image')
  .option('-o, --output <path>', 'Path to save the generated model (default: model.glb)')
  .option('-n, --no-bg', 'Do not automatically remove the background')
  .option('-t, --no-texture', 'Do not generate textures')
  .option('-s, --seed <number>', 'Random seed', parseInt)
  .option('-r, --res <number>', 'Octree resolution', parseInt, 256)
  .option('-url, --api-url <url>', 'Backend API URL (default: http://localhost:8081)')
  .action(async (imagePath, options) => {
    const spinner = ora('Initializing 3D generation...').start();
    
    try {
      const client = new ImageTo3DClient(options.apiUrl);
      
      const isReady = await client.isReady();
      if (!isReady) {
        spinner.fail(`Image-to-3D backend is not reachable at ${options.apiUrl}. Please start the backend server.`);
        process.exit(1);
      }

      if (!fs.existsSync(imagePath)) {
        spinner.fail(`Input image not found: ${imagePath}`);
        process.exit(1);
      }

      const outputPath = options.output || path.resolve(process.cwd(), 'model.glb');
      
      spinner.text = 'Uploading image and starting generation...';
      
      await client.generateModel({
        imagePath,
        outputPath,
        removeBackground: !options.noBg,
        texture: !options.noTexture,
        seed: options.seed,
        octreeResolution: options.res,
        onProgress: (data) => {
          if (data.status === 'processing') {
            spinner.text = `Processing 3D model... (${data.progress || 0}%)`;
          } else if (data.status === 'started') {
             spinner.text = `Task started with UID: ${data.uid}. Waiting for worker...`;
          }
        }
      });

      spinner.succeed(`Successfully generated 3D model at: ${outputPath}`);
    } catch (error) {
      spinner.fail(`Generation failed: ${error.message}`);
      process.exit(1);
    }
  });

program.parse(process.argv);
