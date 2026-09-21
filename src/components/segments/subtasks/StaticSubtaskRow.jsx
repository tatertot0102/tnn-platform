import { Check, GripVertical, ShieldCheck } from 'lucide-react'

// What follows the pointer while an item is being dragged.
export default function StaticSubtaskRow({ item }) {
  return (
    <div className="flex items-center gap-2 py-2 bg-gray-800 border border-gray-700 rounded-lg px-3 shadow-2xl shadow-black/50 scale-[1.02]">
      <GripVertical size={14} className="text-gray-500" />
      {item.kind === 'gate' ? (
        <ShieldCheck size={14} className="text-brand-400" />
      ) : (
        <div className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${item.completed ? 'bg-green-600 border-green-600' : 'border-gray-600'}`}>
          {item.completed && <Check size={11} className="text-white" />}
        </div>
      )}
      <span className="text-sm text-gray-100 font-medium flex-1 truncate">{item.title}</span>
    </div>
  )
}
