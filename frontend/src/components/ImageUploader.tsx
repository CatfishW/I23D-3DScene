'use client'

import { useCallback } from 'react'

interface ImageUploaderProps {
  onUpload: (file: File) => void;
  preview: string | null;
  disabled?: boolean;
}

export default function ImageUploader({ onUpload, preview, disabled }: ImageUploaderProps) {
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (disabled) return
    
    const files = e.dataTransfer.files
    if (files.length > 0) {
      const file = files[0]
      if (file.type.startsWith('image/')) {
        onUpload(file)
      }
    }
  }, [onUpload, disabled])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return
    
    const files = e.target.files
    if (files && files.length > 0) {
      onUpload(files[0])
    }
  }, [onUpload, disabled])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      className={`
        relative border-2 border-dashed rounded-xl p-8
        transition-all duration-300 cursor-pointer
        border-gray-600 hover:border-gray-500 bg-gray-900/50
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      <input
        type="file"
        accept="image/*"
        onChange={handleChange}
        disabled={disabled}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
      
      {preview ? (
        <div className="relative aspect-square max-w-sm mx-auto">
          <img
            src={preview}
            alt="Preview"
            className="w-full h-full object-contain rounded-lg"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 hover:opacity-100 transition-opacity rounded-lg">
            <p className="text-white font-medium">Click to change image</p>
          </div>
        </div>
      ) : (
        <div className="text-center py-12">
          <svg
            className="mx-auto h-16 w-16 text-gray-500 mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <div>
            <p className="text-gray-400 font-medium mb-2">
              Drag and drop an image here, or click to select
            </p>
            <p className="text-gray-500 text-sm">
              Supports PNG, JPG, JPEG, WebP, BMP
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
