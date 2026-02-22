'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment, useGLTF, useFBX, Center, Loader, useAnimations } from '@react-three/drei'
import * as THREE from 'three'
import { createAnimationPresets, retargetAnimation } from '@/lib/animations'

interface ModelViewerProps {
  modelUrl: string | null;
  isLoading?: boolean;
  isRigged?: boolean;
}

// Shared state lifted outside Canvas so HTML overlay can access it
interface AnimState {
  animations: THREE.AnimationClip[];
  animNames: string[];
  currentAnimation: string;
  isPlaying: boolean;
  animationSpeed: number;
  hasBones: boolean;
}

function Model({
  url,
  isRigged,
  onAnimState,
  controlRef,
  extraAnimations,
}: {
  url: string;
  isRigged?: boolean;
  onAnimState: (state: AnimState) => void;
  controlRef: React.MutableRefObject<{
    setCurrentAnimation: (name: string) => void;
    setIsPlaying: (v: boolean) => void;
    setAnimationSpeed: (v: number) => void;
  } | null>;
  extraAnimations: THREE.AnimationClip[];
}) {
  const isFBX = url.toLowerCase().includes('.fbx');

  return (
    <Suspense fallback={null}>
      {isFBX ? (
        <FBXModel url={url} isRigged={isRigged} onAnimState={onAnimState} controlRef={controlRef} extraAnimations={extraAnimations} />
      ) : (
        <GLTFModel url={url} isRigged={isRigged} onAnimState={onAnimState} controlRef={controlRef} extraAnimations={extraAnimations} />
      )}
    </Suspense>
  );
}

function GLTFModel({ url, isRigged, onAnimState, controlRef, extraAnimations }: any) {
  const { scene, animations } = useGLTF(url) as any
  return <BaseModel scene={scene} animations={animations} isRigged={isRigged} onAnimState={onAnimState} controlRef={controlRef} extraAnimations={extraAnimations} />
}

function FBXModel({ url, isRigged, onAnimState, controlRef, extraAnimations }: any) {
  const fbx = useFBX(url)
  return <BaseModel scene={fbx} animations={fbx.animations || []} isRigged={isRigged} onAnimState={onAnimState} controlRef={controlRef} extraAnimations={extraAnimations} />
}

function BaseModel({
  scene,
  animations: embeddedAnimations,
  isRigged,
  onAnimState,
  controlRef,
  extraAnimations,
}: {
  scene: THREE.Group | THREE.Object3D;
  animations: THREE.AnimationClip[];
  isRigged?: boolean;
  onAnimState: (state: AnimState) => void;
  controlRef: React.MutableRefObject<any>;
  extraAnimations: THREE.AnimationClip[];
}) {
  // Combine embedded + extra + preset animations
  const [presetAnimations, setPresetAnimations] = useState<THREE.AnimationClip[]>([])
  const [isPlaying, setIsPlaying] = useState(true)
  const [animationSpeed, setAnimationSpeed] = useState(1)
  const [currentAnimation, setCurrentAnimation] = useState<string>('')
  const initializedRef = useRef(false)
  const [hasBones, setHasBones] = useState(false)

  // Generate preset animations when scene loads
  useEffect(() => {
    if (scene && isRigged) {
      const presets = createAnimationPresets(scene)
      setPresetAnimations(presets)
    }
  }, [scene, isRigged])

  const allAnimations = [
    ...embeddedAnimations,
    ...extraAnimations.map(clip => retargetAnimation(clip, scene)),
    ...presetAnimations
  ]
  const { actions, mixer } = useAnimations(allAnimations, scene)

  useEffect(() => {
    if (scene) {
      let hasBone = false
      const bonesToHide: THREE.Object3D[] = []

      scene.traverse((child) => {
        if (child instanceof THREE.Bone) {
          hasBone = true
          bonesToHide.push(child)
        }
        if (child instanceof THREE.Mesh) {
          child.castShadow = true
          child.receiveShadow = true
          // Don't render if this mesh is parented to a bone and has no material/texture
          // (likely a bone visualization mesh)
          if (child.parent instanceof THREE.Bone && !child.material) {
            child.visible = false
          }
        }
        // Hide non-mesh objects that are bone containers (armature parent objects)
        if (child.type === 'Object3D' && !(child instanceof THREE.Bone) && !(child instanceof THREE.Mesh)) {
          const hasBoneChild = child.children.some((c: any) => c instanceof THREE.Bone)
          if (hasBoneChild && child !== scene) {
            child.traverse((obj) => {
              if (obj instanceof THREE.Mesh && !obj.material) {
                obj.visible = false
              }
            })
          }
        }
      })

      // Bones themselves should never be visible (they don't have geometry in proper GLB files)
      bonesToHide.forEach(bone => {
        bone.visible = false
      })

      setHasBones(hasBone)
    }
  }, [scene])

  useEffect(() => {
    const animNames = Object.keys(actions)
    if (animNames.length > 0 && !initializedRef.current) {
      initializedRef.current = true
      setCurrentAnimation(animNames[0])
      const action = actions[animNames[0]]
      if (action) {
        action.reset().setLoop(THREE.LoopRepeat, Infinity).play()
      }
    }
  }, [actions])

  useEffect(() => {
    if (mixer) {
      mixer.timeScale = isPlaying ? animationSpeed : 0
    }
  }, [isPlaying, animationSpeed, mixer])

  useEffect(() => {
    onAnimState({
      animations: allAnimations,
      animNames: Object.keys(actions),
      currentAnimation,
      isPlaying,
      animationSpeed,
      hasBones,
    })
  }, [allAnimations.length, actions, currentAnimation, isPlaying, animationSpeed, onAnimState, hasBones])

  useEffect(() => {
    controlRef.current = {
      setCurrentAnimation: (name: string) => {
        setCurrentAnimation(name)
        Object.values(actions).forEach(a => a?.fadeOut(0.2))
        const action = actions[name]
        if (action) {
          action.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.2).play()
        }
      },
      setIsPlaying,
      setAnimationSpeed,
    }
  }, [actions, controlRef])

  return (
    <Center>
      <primitive object={scene} scale={1} />
    </Center>
  )
}

function Lights() {
  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[10, 10, 5]}
        intensity={1}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      <directionalLight position={[-10, 10, -5]} intensity={0.5} />
      <pointLight position={[0, -10, 0]} intensity={0.3} />
    </>
  )
}

function Scene({
  modelUrl,
  isRigged,
  onAnimState,
  controlRef,
  extraAnimations,
}: {
  modelUrl: string;
  isRigged?: boolean;
  onAnimState: (state: AnimState) => void;
  controlRef: React.MutableRefObject<{
    setCurrentAnimation: (name: string) => void;
    setIsPlaying: (v: boolean) => void;
    setAnimationSpeed: (v: number) => void;
  } | null>;
  extraAnimations: THREE.AnimationClip[];
}) {
  return (
    <>
      <Lights />
      <Suspense fallback={null}>
        <Model url={modelUrl} isRigged={isRigged} onAnimState={onAnimState} controlRef={controlRef} extraAnimations={extraAnimations} />
      </Suspense>
      <Environment preset="studio" background={false} />
      <OrbitControls
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minDistance={0.5}
        maxDistance={10}
        autoRotate={!isRigged}
        autoRotateSpeed={1}
      />
    </>
  )
}

export default function ModelViewer({ modelUrl, isLoading, isRigged }: ModelViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [animState, setAnimState] = useState<AnimState | null>(null)
  const [extraAnimations, setExtraAnimations] = useState<THREE.AnimationClip[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const controlRef = useRef<{
    setCurrentAnimation: (name: string) => void;
    setIsPlaying: (v: boolean) => void;
    setAnimationSpeed: (v: number) => void;
  } | null>(null)

  // Reset extra animations when model changes
  useEffect(() => {
    setExtraAnimations([])
  }, [modelUrl])

  const handleAnimationUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js')
      const loader = new FBXLoader()
      const arrayBuffer = await file.arrayBuffer()
      const fbx = loader.parse(arrayBuffer, '')

      if (fbx.animations && fbx.animations.length > 0) {
        // Name clips after the file
        const baseName = file.name.replace(/\.[^.]+$/, '')
        const clips = fbx.animations.map((clip: THREE.AnimationClip, i: number) => {
          clip.name = fbx.animations.length > 1 ? `${baseName}_${i + 1}` : baseName
          return clip
        })
        setExtraAnimations(prev => [...prev, ...clips])
      } else {
        alert('No animations found in the uploaded file.')
      }
    } catch (err) {
      console.error('Failed to load animation file:', err)
      alert('Failed to load animation file. Make sure it\'s a valid FBX file.')
    }

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  if (!modelUrl && !isLoading) {
    return (
      <div className="flex items-center justify-center h-[400px] text-gray-500">
        <div className="text-center">
          <svg
            className="mx-auto h-16 w-16 text-gray-600 mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5"
            />
          </svg>
          <p className="font-medium">No 3D model yet</p>
          <p className="text-sm mt-1">Upload an image and generate to see the 3D model</p>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <div className="text-center">
          <div className="relative w-24 h-24 mx-auto mb-4">
            <div className="absolute inset-0 border-4 border-gray-700 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-blue-500 rounded-full animate-spin border-t-transparent"></div>
          </div>
          <p className="text-gray-400 font-medium">Loading 3D model...</p>
        </div>
      </div>
    )
  }

  const hasAnimations = animState && animState.animNames.length > 0
  const showControls = isRigged && animState && (hasAnimations || animState.hasBones)

  return (
    <div ref={containerRef} className="w-full h-[500px] bg-gray-900 rounded-xl overflow-hidden relative">
      {/* Use key to force full re-mount when model changes */}
      <Canvas
        key={modelUrl}
        shadows
        camera={{ position: [2, 2, 2], fov: 50 }}
        style={{ width: '100%', height: '100%' }}
      >
        <color attach="background" args={['#1a1a2e']} />
        <Scene
          modelUrl={modelUrl!}
          isRigged={isRigged}
          onAnimState={setAnimState}
          controlRef={controlRef}
          extraAnimations={extraAnimations}
        />
      </Canvas>
      <Loader />

      {/* Animation Controls Overlay */}
      {showControls && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-sm rounded-xl px-4 py-3 flex items-center gap-3 z-10 min-w-max border border-white/10 shadow-2xl">
          {/* Animation/Rigged badge */}
          <div className="flex items-center gap-1.5 mr-1">
            <div className={`w-2 h-2 rounded-full animate-pulse ${hasAnimations ? 'bg-purple-400' : 'bg-blue-400'}`} />
            <span className={`${hasAnimations ? 'text-purple-300' : 'text-blue-300'} text-xs font-semibold uppercase tracking-wider`}>
              {hasAnimations ? 'Animated' : 'Rigged'}
            </span>
          </div>

          {/* Animation selector */}
          {hasAnimations && animState.animNames.length > 1 && (
            <select
              value={animState.currentAnimation}
              onChange={(e) => controlRef.current?.setCurrentAnimation(e.target.value)}
              className="bg-gray-700 text-white text-xs rounded-lg px-2 py-1 border border-gray-600 focus:outline-none focus:border-purple-500"
            >
              {animState.animNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          )}

          {/* Single animation name if only one */}
          {hasAnimations && animState.animNames.length === 1 && (
            <span className="text-gray-300 text-xs truncate max-w-[120px]">{animState.currentAnimation}</span>
          )}

          {/* Play/Pause button */}
          <button
            onClick={() => controlRef.current?.setIsPlaying(!animState?.isPlaying)}
            className="w-8 h-8 flex items-center justify-center bg-gray-700 hover:bg-gray-600 rounded-full transition-colors"
            title={animState?.isPlaying ? 'Pause' : 'Play'}
          >
            {animState?.isPlaying ? (
              <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {/* Speed control */}
          <div className="flex items-center gap-2">
            <svg className="w-3 h-3 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2a10 10 0 100 20A10 10 0 0012 2zm0 18a8 8 0 110-16 8 8 0 010 16zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z" />
            </svg>
            <input
              type="range"
              min="0.1"
              max="2"
              step="0.1"
              value={animState?.animationSpeed ?? 1}
              onChange={(e) => controlRef.current?.setAnimationSpeed(parseFloat(e.target.value))}
              className="w-20 accent-blue-500"
            />
            <span className="text-white text-xs w-8 tabular-nums">{(animState?.animationSpeed ?? 1).toFixed(1)}x</span>
          </div>

          {/* Upload animation button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-8 h-8 flex items-center justify-center bg-purple-700 hover:bg-purple-600 rounded-full transition-colors"
            title="Upload animation FBX (e.g. from Mixamo)"
          >
            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      )}

      {/* Hidden file input for animation upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".fbx"
        onChange={handleAnimationUpload}
        className="hidden"
      />
    </div>
  )
}
