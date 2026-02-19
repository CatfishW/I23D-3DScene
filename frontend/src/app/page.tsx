'use client'

import { useState, useEffect } from 'react'
import ImageUploader from '@/components/ImageUploader'
import ModelViewer from '@/components/ModelViewer'
import GenerationProgress from '@/components/GenerationProgress'
import DownloadButtons from '@/components/DownloadButtons'
import ParameterControls, { GenerationParams } from '@/components/ParameterControls'
import { generate3D, GenerationResult, removeBackground, rigModel, RiggingResult, getHistory, HistoryItem, fetchModelAsBlob } from '@/lib/api-client'

export default function Home() {
  const [image, setImage] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [originalImage, setOriginalImage] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isRemovingBg, setIsRemovingBg] = useState(false)
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState('')
  const [result, setResult] = useState<GenerationResult | null>(null)
  const [isRigging, setIsRigging] = useState(false)
  const [riggingProgress, setRiggingProgress] = useState(0)
  const [riggingStage, setRiggingStage] = useState('')
  const [riggedResult, setRiggedResult] = useState<RiggingResult | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<HistoryItem | null>(null)
  const [historyModelBlobUrl, setHistoryModelBlobUrl] = useState<string | null>(null)
  const [params, setParams] = useState<GenerationParams>({
    removeBackground: true,
    texture: true,
    seed: 1234,
    octreeResolution: 256,
    numInferenceSteps: 5,
    guidanceScale: 5.0,
    targetFaceNum: 10000,
    textureResolution: 768,
    textureViews: 9,
  })

  useEffect(() => {
    loadHistory()
  }, [])

  const loadHistory = async () => {
    setIsLoadingHistory(true)
    try {
      const hist = await getHistory(20)
      setHistory(hist)
    } catch (err) {
      console.error('Failed to load history:', err)
    } finally {
      setIsLoadingHistory(false)
    }
  }

  const handleSelectHistoryItem = async (item: HistoryItem) => {
    setSelectedHistoryItem(item)
    setHistoryModelBlobUrl(null)

    // For rigged models, pre-fetch as blob to detect FBX format
    if (item.type === 'rigged') {
      try {
        const url = item.model_url.startsWith('/I23D/api')
          ? item.model_url
          : `${process.env.NEXT_PUBLIC_API_URL || '/I23D/api'}${item.model_url}`;
        const blobUrl = await fetchModelAsBlob(url)
        setHistoryModelBlobUrl(blobUrl)
      } catch (err) {
        console.error('Failed to fetch rigged model:', err)
      }
    }
  }

  const handleImageUpload = async (file: File) => {
    setError(null)
    setResult(null)
    setRiggedResult(null)

    const reader = new FileReader()
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string)
    }
    reader.readAsDataURL(file)

    const base64Reader = new FileReader()
    base64Reader.onload = async (e) => {
      const base64 = (e.target?.result as string).split(',')[1]
      setOriginalImage(base64)

      if (params.removeBackground) {
        setIsRemovingBg(true)
        try {
          const processedBase64 = await removeBackground(base64)
          setImage(processedBase64)
          setImagePreview(`data:image/png;base64,${processedBase64}`)
        } catch (err) {
          console.error('Background removal failed, using original:', err)
          setImage(base64)
        } finally {
          setIsRemovingBg(false)
        }
      } else {
        setImage(base64)
      }
    }
    base64Reader.readAsDataURL(file)
  }

  const handleParamsChange = async (newParams: GenerationParams) => {
    const prevRemoveBg = params.removeBackground
    setParams(newParams)

    if (newParams.removeBackground !== prevRemoveBg && originalImage) {
      if (newParams.removeBackground) {
        setIsRemovingBg(true)
        try {
          const processedBase64 = await removeBackground(originalImage)
          setImage(processedBase64)
          setImagePreview(`data:image/png;base64,${processedBase64}`)
        } catch (err) {
          console.error('Background removal failed:', err)
        } finally {
          setIsRemovingBg(false)
        }
      } else {
        setImage(originalImage)
        setImagePreview(`data:image/jpeg;base64,${originalImage}`)
      }
    }
  }

  const handleGenerate = async () => {
    if (!image) return

    setIsGenerating(true)
    setProgress(0)
    setStage('Starting...')
    setError(null)
    setResult(null)

    try {
      const genResult = await generate3D(image, (p, s) => {
        setProgress(p)
        setStage(s)
      }, {
        removeBackground: false, // Already removed at upload
        texture: params.texture,
        seed: params.seed,
        octreeResolution: params.octreeResolution,
        numInferenceSteps: params.numInferenceSteps,
        guidanceScale: params.guidanceScale,
        targetFaceNum: params.targetFaceNum,
        textureResolution: params.textureResolution,
        textureViews: params.textureViews,
      })

      setResult(genResult)
      setProgress(100)
      setStage('Completed!')
      loadHistory() // Refresh history
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
                Image to 3D
              </h1>
              <p className="text-gray-400 text-sm">
                Powered by Hunyuan3D-2.1 with PBR Textures
              </p>
            </div>
            <div className="flex items-center gap-4">
              <a
                href="/I23D/flashworld.html"
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-600/30 to-blue-600/30 border border-cyan-500/40 text-cyan-300 hover:from-cyan-500/50 hover:to-blue-500/50 hover:border-cyan-400/70 hover:text-white transition-all duration-200 text-sm font-medium"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 004 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" />
                </svg>
                FlashWorld
              </a>
              <a
                href="https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-white transition-colors"
              >
                GitHub
              </a>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700">
              <h2 className="text-xl font-semibold text-white mb-4">
                1. Upload Image
              </h2>
              <ImageUploader
                onUpload={handleImageUpload}
                preview={imagePreview}
                disabled={isGenerating || isRemovingBg}
              />
              {isRemovingBg && (
                <p className="text-blue-400 text-sm mt-2 text-center">
                  Removing background...
                </p>
              )}
            </div>

            <div className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700">
              <h2 className="text-xl font-semibold text-white mb-4">
                2. Configure Generation
              </h2>
              <ParameterControls
                params={params}
                onChange={handleParamsChange}
                disabled={isGenerating || isRemovingBg}
              />
            </div>

            <div className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700">
              <h2 className="text-xl font-semibold text-white mb-4">
                3. Generate 3D Model
              </h2>
              <button
                onClick={handleGenerate}
                disabled={!image || isGenerating || isRemovingBg}
                className={`
                  w-full py-4 px-6 rounded-xl font-semibold text-lg
                  transition-all duration-300
                  ${!image || isGenerating || isRemovingBg
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
                  'Generate 3D Model'
                )}
              </button>
            </div>

            {(isGenerating || progress > 0) && (
              <div className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700">
                <GenerationProgress
                  progress={progress}
                  stage={stage}
                  isLoading={isGenerating}
                />
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
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-white">
                  3D Preview
                </h2>
                {selectedHistoryItem && (
                  <button
                    onClick={() => {
                      setSelectedHistoryItem(null)
                      setHistoryModelBlobUrl(null)
                      setResult(null)
                      setRiggedResult(null)
                    }}
                    className="text-sm text-blue-400 hover:text-blue-300"
                  >
                    Clear Selection
                  </button>
                )}
              </div>
              <ModelViewer
                modelUrl={
                  selectedHistoryItem?.model_url
                    ? (selectedHistoryItem.type === 'rigged'
                      ? historyModelBlobUrl
                      : (selectedHistoryItem.model_url.startsWith('/I23D/api')
                        ? selectedHistoryItem.model_url
                        : `${process.env.NEXT_PUBLIC_API_URL || '/I23D/api'}${selectedHistoryItem.model_url}`))
                    : riggedResult?.modelUrl
                      ? riggedResult.modelUrl
                      : result?.modelUrl || null
                }
                isLoading={isGenerating || isRigging || (selectedHistoryItem?.type === 'rigged' && !historyModelBlobUrl)}
                isRigged={!!riggedResult || selectedHistoryItem?.type === 'rigged'}
              />
            </div>

            {result && (
              <div className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700">
                <h2 className="text-xl font-semibold text-white mb-4">
                  Download
                </h2>
                <DownloadButtons
                  modelUrl={result.modelUrl}
                  uid={result.uid}
                />

                {/* Rigging Section */}
                <div className="mt-6 pt-6 border-t border-gray-700">
                  <h3 className="text-lg font-semibold text-white mb-4">
                    Add Skeleton (Rigging)
                  </h3>
                  <p className="text-gray-400 text-sm mb-4">
                    Add a skeleton to enable animation (requires humanoid or character models)
                  </p>

                  {riggingProgress > 0 && (
                    <div className="mb-4">
                      <div className="w-full bg-gray-700 rounded-full h-2">
                        <div
                          className="bg-purple-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${riggingProgress}%` }}
                        />
                      </div>
                      <p className="text-gray-400 text-sm mt-2">{riggingStage}</p>
                    </div>
                  )}

                  <button
                    onClick={async () => {
                      if (!result) return;
                      setIsRigging(true);
                      setRiggingProgress(0);
                      setRiggingStage('Starting rigging...');

                      try {
                        const rigRes = await rigModel(result.uid, (p, s) => {
                          setRiggingProgress(p);
                          setRiggingStage(s);
                        });
                        setRiggedResult(rigRes);
                        loadHistory() // Refresh history
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'Rigging failed');
                      } finally {
                        setIsRigging(false);
                      }
                    }}
                    disabled={isRigging || !!riggedResult}
                    className="w-full px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
                  >
                    {isRigging ? 'Rigging...' : riggedResult ? 'Rigging Complete!' : 'Add Skeleton'}
                  </button>

                  {riggedResult && (
                    <div className="mt-4">
                      <p className="text-green-400 text-sm mb-2">Rigged model ready!</p>
                      <DownloadButtons
                        modelUrl={riggedResult.modelUrl}
                        uid={riggedResult.uid}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* FlashWorld Portal Section */}
      <section className="container mx-auto px-4 py-12">
        <a
          href="/I23D/flashworld.html"
          className="group block relative overflow-hidden rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-gray-900 via-cyan-950/40 to-blue-950/60 hover:border-cyan-400/60 transition-all duration-300 hover:shadow-[0_0_40px_rgba(6,182,212,0.15)]"
        >
          {/* Animated glow blobs */}
          <div className="absolute -top-20 -right-20 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl group-hover:bg-cyan-400/20 transition-all duration-700" />
          <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl group-hover:bg-blue-400/20 transition-all duration-700" />

          <div className="relative flex flex-col sm:flex-row items-center gap-6 p-8">
            {/* Icon */}
            <div className="flex-shrink-0 w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
              <svg className="w-10 h-10 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 004 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>

            {/* Text */}
            <div className="flex-1 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
                <span className="text-xs font-semibold uppercase tracking-widest text-cyan-400/70">Portal</span>
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2 group-hover:text-cyan-100 transition-colors">FlashWorld</h2>
              <p className="text-gray-400 text-sm leading-relaxed group-hover:text-gray-300 transition-colors">
                Generate immersive 3D worlds from a single image using video diffusion + Gaussian Splatting. Fast, high-quality, explorable scenes.
              </p>
            </div>

            {/* Arrow */}
            <div className="flex-shrink-0 w-12 h-12 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center group-hover:bg-cyan-500/30 group-hover:border-cyan-400/60 transition-all duration-300">
              <svg className="w-5 h-5 text-cyan-400 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </div>
          </div>
        </a>
      </section>

      <footer className="border-t border-gray-700 mt-4">
        <div className="container mx-auto px-4 py-8 text-center text-gray-500">
          <p>
            Hunyuan3D-2.1 is licensed under the{' '}
            <a
              href="https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1/blob/main/LICENSE"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline"
            >
              Tencent Hunyuan Non-Commercial License
            </a>
          </p>
        </div>
      </footer>

      {/* History Section */}
      <section className="container mx-auto px-4 py-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white">History</h2>
          <button
            onClick={loadHistory}
            disabled={isLoadingHistory}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-600 text-white text-sm rounded-lg transition-colors"
          >
            {isLoadingHistory ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        {history.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No generation history yet</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {history.map((item) => (
              <div
                key={item.uid}
                className={`bg-gray-800/50 rounded-xl p-4 border transition-all cursor-pointer hover:scale-[1.02] ${selectedHistoryItem?.uid === item.uid
                  ? 'border-blue-500 ring-2 ring-blue-500/30'
                  : 'border-gray-700 hover:border-gray-600'
                  }`}
                onClick={() => handleSelectHistoryItem(item)}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs px-2 py-1 rounded ${item.type === 'rigged' ? 'bg-purple-900 text-purple-300' : 'bg-blue-900 text-blue-300'}`}>
                    {item.type === 'rigged' ? 'Rigged' : 'Textured'}
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(item.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-gray-400 text-xs mb-3 truncate">{item.uid}</p>
                <div className="flex gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleSelectHistoryItem(item)
                    }}
                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
                  >
                    View
                  </button>
                  <a
                    href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081'}${item.model_url}`}
                    download
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 block text-center px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
                  >
                    Download
                  </a>
                  {item.type === 'textured' && (
                    <button
                      onClick={async (e) => {
                        e.stopPropagation()
                        try {
                          const rigRes = await rigModel(item.uid.replace('_rigged', ''), (p, s) => {
                            console.log(`Rigging: ${p}% - ${s}`);
                          });
                          alert('Rigging completed! Model added to history.');
                          loadHistory();
                        } catch (err) {
                          alert('Rigging failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
                        }
                      }}
                      className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg transition-colors"
                    >
                      Rig
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
