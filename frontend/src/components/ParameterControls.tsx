'use client'

import { useState } from 'react'

export interface GenerationParams {
  removeBackground: boolean
  texture: boolean
  seed: number
  octreeResolution: number
  numInferenceSteps: number
  guidanceScale: number
  targetFaceNum: number
  textureResolution: number
  textureViews: number
}

interface ParameterControlsProps {
  params: GenerationParams
  onChange: (params: GenerationParams) => void
  disabled?: boolean
}

export default function ParameterControls({ params, onChange, disabled }: ParameterControlsProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)

  const handleChange = (key: keyof GenerationParams, value: number | boolean) => {
    onChange({ ...params, [key]: value })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-white">Generation Settings</h3>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-sm text-blue-400 hover:text-blue-300"
        >
          {showAdvanced ? 'Hide Advanced' : 'Show Advanced'}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={params.removeBackground}
            onChange={(e) => handleChange('removeBackground', e.target.checked)}
            disabled={disabled}
            className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-800"
          />
          <div>
            <span className="text-white">Remove Background</span>
            <p className="text-xs text-gray-400">Auto-detect and remove background</p>
          </div>
        </label>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={params.texture}
            onChange={(e) => handleChange('texture', e.target.checked)}
            disabled={disabled}
            className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-800"
          />
          <div>
            <span className="text-white">Generate Textures</span>
            <p className="text-xs text-gray-400">Add PBR textures to model</p>
          </div>
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Random Seed
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            value={params.seed}
            onChange={(e) => handleChange('seed', parseInt(e.target.value) || 0)}
            disabled={disabled}
            min={0}
            max={4294967295}
            className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            onClick={() => handleChange('seed', Math.floor(Math.random() * 4294967295))}
            disabled={disabled}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-gray-300 hover:text-white transition-colors"
          >
            Random
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1">Use same seed for reproducible results</p>
      </div>

      {showAdvanced && (
        <div className="space-y-4 pt-4 border-t border-gray-700">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Octree Resolution: {params.octreeResolution}
            </label>
            <input
              type="range"
              value={params.octreeResolution}
              onChange={(e) => handleChange('octreeResolution', parseInt(e.target.value))}
              disabled={disabled}
              min={64}
              max={512}
              step={32}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>64 (Fast)</span>
              <span>512 (Detailed)</span>
            </div>
            <p className="text-xs text-gray-400">Higher = more detailed mesh but slower</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Inference Steps: {params.numInferenceSteps}
            </label>
            <input
              type="range"
              value={params.numInferenceSteps}
              onChange={(e) => handleChange('numInferenceSteps', parseInt(e.target.value))}
              disabled={disabled}
              min={1}
              max={20}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>1 (Fast)</span>
              <span>20 (Quality)</span>
            </div>
            <p className="text-xs text-gray-400">More steps = better quality but slower</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Guidance Scale: {params.guidanceScale.toFixed(1)}
            </label>
            <input
              type="range"
              value={params.guidanceScale}
              onChange={(e) => handleChange('guidanceScale', parseFloat(e.target.value))}
              disabled={disabled}
              min={0.1}
              max={20}
              step={0.1}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>0.1</span>
              <span>20</span>
            </div>
            <p className="text-xs text-gray-400">Higher = more faithful to input image</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Target Face Count: {params.targetFaceNum.toLocaleString()}
            </label>
            <input
              type="range"
              value={params.targetFaceNum}
              onChange={(e) => handleChange('targetFaceNum', parseInt(e.target.value))}
              disabled={disabled}
              min={0}
              max={100000}
              step={1000}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>0 (No limit)</span>
              <span>100,000</span>
            </div>
            <p className="text-xs text-gray-400">Reduce mesh complexity for easier editing</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Texture Resolution: {params.textureResolution}p
            </label>
            <input
              type="range"
              value={params.textureResolution}
              onChange={(e) => handleChange('textureResolution', parseInt(e.target.value))}
              disabled={disabled}
              min={512}
              max={768}
              step={256}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>512</span>
              <span>768</span>
            </div>
            <p className="text-xs text-gray-400">Higher = better texture quality but slower</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Texture Views: {params.textureViews}
            </label>
            <input
              type="range"
              value={params.textureViews}
              onChange={(e) => handleChange('textureViews', parseInt(e.target.value))}
              disabled={disabled}
              min={6}
              max={9}
              step={1}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>6 (Fast)</span>
              <span>9 (Best)</span>
            </div>
            <p className="text-xs text-gray-400">More views = better texture coverage</p>
          </div>
        </div>
      )}
    </div>
  )
}
