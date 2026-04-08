import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/ui/PageHeader'
import Spinner from '../components/ui/Spinner'
import { USER_ROLES } from '../lib/constants'

export default function Members() {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('profiles').select('*').order('full_name')
      .then(({ data }) => { setMembers(data ?? []); setLoading(false) })
  }, [])

  async function updateRole(id, role) {
    await supabase.from('profiles').update({ role }).eq('id', id)
    setMembers(m => m.map(x => x.id === id ? { ...x, role } : x))
  }

  if (loading) return <div className="flex justify-center py-24"><Spinner size={8} /></div>

  return (
    <div>
      <PageHeader title="Members" subtitle={`${members.length} people`} />
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              {['Member','Email','Role'].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-gray-500 px-4 py-3 first:pl-5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {members.map(m => (
              <tr key={m.id} className="hover:bg-gray-800/40 transition-colors">
                <td className="px-4 py-3 pl-5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
                      {m.full_name?.[0]?.toUpperCase() ?? '?'}
                    </div>
                    <span className="font-medium text-gray-100">{m.full_name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-400">{m.email}</td>
                <td className="px-4 py-3">
                  <select
                    className="input w-auto text-xs"
                    value={m.role ?? 'member'}
                    onChange={e => updateRole(m.id, e.target.value)}
                  >
                    <option value="member">Member</option>
                    <option value="exec">Exec</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
