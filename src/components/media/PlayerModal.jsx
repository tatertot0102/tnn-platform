import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import Modal from '../ui/Modal'
import { formatBytes } from '../../lib/media'

/**
 * Plays the compressed preview when it's ready (smooth over home internet),
 * with the full-quality original one click away.
 * @param {{ file: object|null, onClose: () => void }} props
 */
export default function PlayerModal({ file, onClose }) {
  const [useOriginal, setUseOriginal] = useState(false)
  if (!file) return null

  const hasPreview = Boolean(file.previewUrl)
  const preparing = file.kind === 'video' && !hasPreview && ['missing', 'queued', 'working'].includes(file.preview)
  const src = file.kind === 'video' && hasPreview && !useOriginal ? file.previewUrl : file.url
  const showVideo = file.kind === 'video' && (hasPreview || useOriginal)

  return (
    <Modal open onClose={onClose} title={file.name} size="xl">
      <div className="space-y-3">
        {showVideo && (
          <video key={src} src={src} poster={file.thumbUrl} controls autoPlay playsInline
            className="w-full max-h-[70dvh] rounded-lg bg-black" />
        )}
        {file.kind === 'video' && !showVideo && (
          <div className="aspect-video rounded-lg bg-gray-950 border border-gray-800 flex flex-col items-center justify-center gap-3 text-center px-6">
            {preparing && <Loader2 size={22} className="animate-spin text-brand-400" aria-hidden="true" />}
            <p className="text-sm text-gray-300">
              {preparing ? 'Preparing a smooth preview…' : 'A preview couldn’t be made for this video.'}
            </p>
            <p className="text-xs text-gray-500 max-w-sm">
              {preparing ? 'This usually takes a few seconds per minute of video. You can play the full-quality original now, but it may stutter.' : 'You can still play or download the original.'}
            </p>
            <button type="button" onClick={() => setUseOriginal(true)} className="btn-ghost border border-gray-700 text-xs px-3 py-1.5">
              Play original
            </button>
          </div>
        )}
        {file.kind === 'audio' && <audio src={file.url} controls autoPlay className="w-full" />}
        {file.kind === 'image' && <img src={file.url} alt={file.name} className="w-full max-h-[70dvh] object-contain rounded-lg bg-black" />}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-gray-500">
            {formatBytes(file.size)}
            {showVideo && hasPreview && (
              <button type="button" onClick={() => setUseOriginal(v => !v)} className="ml-3 text-brand-400 hover:underline">
                {useOriginal ? 'Watch smooth preview' : 'Watch full quality'}
              </button>
            )}
          </span>
          <div className="flex gap-2">
            {file.previewDownloadUrl && (
              <a href={file.previewDownloadUrl} className="btn-ghost border border-gray-700 flex items-center gap-1.5 text-sm">
                <Download size={15} aria-hidden="true" /> Compressed
              </a>
            )}
            <a href={file.downloadUrl} className="btn-primary flex items-center gap-1.5 text-sm">
              <Download size={15} aria-hidden="true" /> Original
            </a>
          </div>
        </div>
      </div>
    </Modal>
  )
}
