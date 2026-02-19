'use client'

interface GenerationProgressProps {
  progress: number;
  stage: string;
  isLoading: boolean;
}

export default function GenerationProgress({ progress, stage, isLoading }: GenerationProgressProps) {
  const getProgressColor = () => {
    if (progress < 30) return 'bg-blue-500'
    if (progress < 70) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  const stages = [
    { name: 'Upload', threshold: 10 },
    { name: 'Load Models', threshold: 20 },
    { name: 'Generate Mesh', threshold: 60 },
    { name: 'Generate Textures', threshold: 90 },
    { name: 'Complete', threshold: 100 },
  ]

  const currentStageIndex = stages.findIndex((s, i) => {
    const nextThreshold = stages[i + 1]?.threshold || 101
    return progress >= s.threshold && progress < nextThreshold
  })

  return (
    <div className="space-y-4">
      {/* Stage indicators */}
      <div className="flex justify-between">
        {stages.map((s, i) => (
          <div key={s.name} className="flex flex-col items-center">
            <div
              className={`
                w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                transition-all duration-300
                ${i <= currentStageIndex
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-700 text-gray-400'
                }
              `}
            >
              {i < currentStageIndex ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              ) : (
                i + 1
              )}
            </div>
            <span className={`text-xs mt-1 ${i <= currentStageIndex ? 'text-white' : 'text-gray-500'}`}>
              {s.name}
            </span>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">{stage}</span>
          <span className="text-white font-medium">{Math.round(progress)}%</span>
        </div>
        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full ${getProgressColor()} transition-all duration-300 ease-out`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Estimated time */}
      {isLoading && progress < 100 && (
        <p className="text-gray-500 text-sm text-center">
          Estimated time: ~{Math.max(1, Math.round((100 - progress) / 15))} minutes remaining
        </p>
      )}
    </div>
  )
}
