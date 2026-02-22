'use client'

import { useState, useCallback, useEffect } from 'react'
import { generateFlashWorld, FlashWorldGenerationParams, FlashWorldGenerationResult, getFlashWorldDownloadUrl, getFlashWorldGaussianDownloadUrl } from '@/lib/api-client'

export default function FlashWorldPage() {
  const [image, setImage] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState('')
  const [result, setResult] = useState<FlashWorldGenerationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [params, setParams] = useState<FlashWorldGenerationParams>({
    numFrames: 24,
    resolution: '720p',
    poissonDepth: 9,
    opacityThreshold: 0.1,
    textPrompt: '',
    generateVideo: false,
    videoFps: 15,
  })

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) {
      processFile(file)
    }
  }, [])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      processFile(file)
    }
  }, [])

  const processFile = (file: File) => {
    setError(null)
    setResult(null)

    const reader = new FileReader()
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string)
    }
    reader.readAsDataURL(file)

    const base64Reader = new FileReader()
    base64Reader.onload = (e) => {
      const base64 = (e.target?.result as string).split(',')[1]
      setImage(base64)
    }
    base64Reader.readAsDataURL(file)
  }

  const handleGenerate = async () => {
    if (!image && !params.textPrompt) return

    setIsGenerating(true)
    setProgress(0)
    setStage('Starting...')
    setError(null)
    setResult(null)

    try {
      const genResult = await generateFlashWorld(image, params, (p, s) => {
        setProgress(p)
        setStage(s)
      })
      setResult(genResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
      setStage('Error')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <header className="border-b border-gray-700 bg-gray-900/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">
                FlashWorld Scene Generator
              </h1>
              <p className="text-gray-400 text-sm">
                Image to 3D Gaussian Splatting & Mesh
              </p>
            </div>
            <a
              href="/I23D"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-600/30 to-blue-600/30 border border-purple-500/40 text-purple-300 hover:from-purple-500/50 hover:to-blue-500/50 hover:border-purple-400/70 hover:text-white transition-all duration-200 text-sm font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
              </svg>
              Image to 3D
            </a>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700">
              <h2 className="text-xl font-semibold text-white mb-4">
                1. Input Prompts
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Text Prompt (Optional)
                  </label>
                  <textarea
                    value={params.textPrompt}
                    onChange={(e) => setParams({ ...params, textPrompt: e.target.value })}
                    disabled={isGenerating}
                    placeholder="Describe the 3D scene you want to generate..."
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none h-24"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Image Prompt (Optional)
                  </label>
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`
                  relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
                  transition-all duration-300
                  ${isDragging
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-gray-600 hover:border-gray-500'
                      }
                  ${isGenerating ? 'opacity-50 pointer-events-none' : ''}
                `}
                  >
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelect}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      disabled={isGenerating}
                    />
                    {imagePreview ? (
                      <img
                        src={imagePreview}
                        alt="Preview"
                        className="max-h-64 mx-auto rounded-lg"
                      />
                    ) : (
                      <div className="space-y-4">
                        <svg className="w-16 h-16 mx-auto text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <p className="text-gray-400">
                          Drag and drop an image or click to select
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700">
              <h2 className="text-xl font-semibold text-white mb-4">
                2. Generation Parameters
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Number of Frames
                  </label>
                  <select
                    value={params.numFrames}
                    onChange={(e) => setParams({ ...params, numFrames: Number(e.target.value) as 24 | 48 })}
                    disabled={isGenerating}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value={24}>24 frames</option>
                    <option value={48}>48 frames</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Resolution
                  </label>
                  <select
                    value={params.resolution}
                    onChange={(e) => setParams({ ...params, resolution: e.target.value as '480p' | '720p' })}
                    disabled={isGenerating}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="480p">480p</option>
                    <option value="720p">720p</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Poisson Depth: {params.poissonDepth}
                  </label>
                  <input
                    type="range"
                    min="6"
                    max="12"
                    value={params.poissonDepth}
                    onChange={(e) => setParams({ ...params, poissonDepth: Number(e.target.value) })}
                    disabled={isGenerating}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>6</span>
                    <span>12</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Opacity Threshold: {params.opacityThreshold.toFixed(2)}
                  </label>
                  <input
                    type="range"
                    min="0.05"
                    max="0.3"
                    step="0.01"
                    value={params.opacityThreshold}
                    onChange={(e) => setParams({ ...params, opacityThreshold: Number(e.target.value) })}
                    disabled={isGenerating}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>0.05</span>
                    <span>0.30</span>
                  </div>
                </div>

                <div className="flex items-center space-x-3 pt-2">
                  <input
                    type="checkbox"
                    id="generateVideo"
                    checked={params.generateVideo}
                    onChange={(e) => setParams({ ...params, generateVideo: e.target.checked })}
                    disabled={isGenerating}
                    className="w-5 h-5 bg-gray-700 border-gray-600 rounded text-blue-500 focus:ring-blue-500"
                  />
                  <label htmlFor="generateVideo" className="text-sm font-medium text-gray-300 select-none cursor-pointer">
                    Generate Orbit Video (MP4)
                  </label>
                </div>

                {params.generateVideo && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Video FPS
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="60"
                      value={params.videoFps}
                      onChange={(e) => setParams({ ...params, videoFps: Number(e.target.value) })}
                      disabled={isGenerating}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700">
              <h2 className="text-xl font-semibold text-white mb-4">
                3. Generate 3D
              </h2>
              <button
                onClick={handleGenerate}
                disabled={(!image && !params.textPrompt) || isGenerating}
                className={`
                  w-full py-4 px-6 rounded-xl font-semibold text-lg
                  transition-all duration-300
                  ${(!image && !params.textPrompt) || isGenerating
                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-500 text-white hover:shadow-lg hover:shadow-blue-500/30'
                  }
                `}
              >
                {isGenerating ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Generating...
                  </span>
                ) : (
                  'Generate 3D Scene'
                )}
              </button>
            </div>

            {(isGenerating || progress > 0) && (
              <div className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700">
                <h3 className="text-lg font-semibold text-white mb-4">Progress</h3>
                <div className="w-full bg-gray-700 rounded-full h-3 mb-3">
                  <div
                    className="bg-gradient-to-r from-blue-500 to-blue-400 h-3 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-gray-400 text-sm">{stage} ({progress}%)</p>
              </div>
            )}

            {error && (
              <div className="bg-red-900/20 border border-red-700 rounded-2xl p-6">
                <p className="text-red-400 font-medium">Error: {error}</p>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700 min-h-[500px]">
              <h2 className="text-xl font-semibold text-white mb-4">
                3D Preview
              </h2>
              <div className="h-[400px] bg-gray-900 rounded-lg flex items-center justify-center">
                {result ? (
                  <iframe
                    src={`/model-viewer.html?model=${encodeURIComponent(result.modelUrl)}`}
                    className="w-full h-full rounded-lg"
                  />
                ) : isGenerating ? (
                  <div className="text-gray-500">
                    <svg className="animate-spin h-12 w-12 mx-auto mb-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <p>Generating 3D scene...</p>
                  </div>
                ) : (
                  <div className="text-gray-500 text-center">
                    <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                    <p>3D model will appear here</p>
                  </div>
                )}
              </div>
            </div>

            {result && (
              <div className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700">
                <h2 className="text-xl font-semibold text-white mb-4">
                  Download
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <a
                    href={result.modelUrl}
                    download={`${result.uid}.glb`}
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    GLB Mesh
                  </a>
                  <a
                    href={result.gaussianUrl}
                    download={`${result.uid}.spz`}
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-500 text-white font-medium rounded-lg transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    SPZ Gaussians
                  </a>
                  {result.videoUrl && (
                    <a
                      href={result.videoUrl}
                      download={`${result.uid}.mp4`}
                      className="col-span-1 md:col-span-2 flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-500 text-white font-medium rounded-lg transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      MP4 Video
                    </a>
                  )}
                </div>
                <p className="text-gray-500 text-xs mt-4">
                  UID: {result.uid}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <footer className="border-t border-gray-700 mt-16">
        <div className="container mx-auto px-4 py-8 text-center text-gray-500">
          <p>FlashWorld Scene Generator</p>
        </div>
      </footer>
    </main>
  )
}