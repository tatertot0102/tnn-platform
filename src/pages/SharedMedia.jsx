import { useParams } from 'react-router-dom'
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import Spinner from '../components/ui/Spinner'
import FileBrowser from '../components/media/FileBrowser'
import { getShare, isMediaConfigured, shareSource } from '../lib/media'
import tnnLogo from '../assets/tnn-logo.svg'

// Public, view-only page for a share link. No account needed.
export default function SharedMedia() {
  const { token } = useParams()
  const source = useMemo(() => shareSource(token), [token])
  const { data, isLoading, error } = useQuery({
    queryKey: ['share', token], queryFn: () => getShare(token), enabled: isMediaConfigured, retry: false,
  })

  return (
    <div className="min-h-dvh bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800/80">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center p-1 flex-shrink-0">
            <img src={tnnLogo} alt="TNN" className="w-full h-full object-contain" width="24" height="24" />
          </div>
          <span className="text-xs uppercase tracking-[0.18em] text-gray-500">Shared media</span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 md:py-12">
        {isLoading && <div className="py-24 flex justify-center"><Spinner size={8} /></div>}
        {(error || !isMediaConfigured) && (
          <div className="py-24 text-center">
            <h1 className="text-xl font-semibold text-gray-100">This link isn’t available</h1>
            <p className="mt-2 text-sm text-gray-400">{error?.message ?? 'Media sharing is not set up.'}</p>
          </div>
        )}
        {data && (
          <>
            <h1 className="text-2xl md:text-4xl font-semibold tracking-tight text-gray-50">{data.title}</h1>
            <p className="mt-2 mb-8 text-sm text-gray-500">{data.finalsOnly ? 'The final cut, ready to watch or download.' : 'Select files to download them, or open one to watch.'}</p>
            <FileBrowser source={source} rootLabel={data.title} readOnly />
          </>
        )}
      </main>
    </div>
  )
}
