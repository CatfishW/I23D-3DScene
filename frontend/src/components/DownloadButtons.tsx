'use client'

interface DownloadButtonsProps {
  modelUrl: string | null;
  uid: string;
}

export default function DownloadButtons({ modelUrl, uid }: DownloadButtonsProps) {
  const handleDownload = (format: 'glb' | 'obj') => {
    if (!modelUrl) return
    
    const link = document.createElement('a')
    link.href = modelUrl
    link.download = `model_${uid}.${format}`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleCopyLink = () => {
    if (!modelUrl) return
    navigator.clipboard.writeText(modelUrl)
  }

  return (
    <div className="space-y-4">
      {/* Format info */}
      <div className="bg-gray-900/50 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <div className="text-blue-400 mt-1">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="text-sm text-gray-400">
            <p className="font-medium text-white mb-1">GLB Format</p>
            <p>
              The generated model is in GLB format with PBR textures embedded.
              Compatible with Unity, Three.js, Blender, and most 3D software.
            </p>
          </div>
        </div>
      </div>

      {/* Download buttons */}
      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => handleDownload('glb')}
          disabled={!modelUrl}
          className={`
            flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-medium
            transition-all duration-200
            ${modelUrl
              ? 'bg-blue-600 hover:bg-blue-500 text-white'
              : 'bg-gray-700 text-gray-400 cursor-not-allowed'
            }
          `}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download GLB
        </button>
        
        <button
          onClick={handleCopyLink}
          disabled={!modelUrl}
          className={`
            flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-medium
            border transition-all duration-200
            ${modelUrl
              ? 'border-gray-600 hover:border-gray-500 text-white'
              : 'border-gray-700 text-gray-400 cursor-not-allowed'
            }
          `}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Copy Link
        </button>
      </div>

      {/* Integration tips */}
      <div className="mt-6 space-y-3">
        <p className="text-sm font-medium text-gray-300">Quick Integration:</p>
        <div className="space-y-2">
          <div className="bg-gray-900/50 rounded-lg p-3 font-mono text-xs text-gray-400">
            <span className="text-blue-400">// Three.js</span>
            <br />
            <span className="text-green-400">const</span> loader = <span className="text-green-400">new</span> GLTFLoader();
            <br />
            loader.load(<span className="text-yellow-400">&apos;model.glb&apos;</span>, (gltf) =&gt; {'{'}
            <br />
            &nbsp;&nbsp;scene.add(gltf.scene);
            <br />
            {'}'});
          </div>
          
          <div className="bg-gray-900/50 rounded-lg p-3 font-mono text-xs text-gray-400">
            <span className="text-blue-400">// Unity</span>
            <br />
            Drag &amp; drop the .glb file into your Assets folder.
            <br />
            Unity will automatically import the model with PBR materials.
          </div>
        </div>
      </div>
    </div>
  )
}
