export default function Spinner({ size = 6 }) {
  return (
    <div className={`w-${size} h-${size} border-2 border-gray-700 border-t-brand-400 rounded-full animate-spin`} />
  )
}
