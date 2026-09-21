import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export const MEMBERS_KEY = ['members']

// Every platform member, loaded once and shared by every page that needs a
// people picker or name lookup.
export function useMembers() {
  return useQuery({
    queryKey: MEMBERS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles').select('id, full_name, role, email').order('full_name')
      if (error) throw error
      return data ?? []
    },
    staleTime: 5 * 60_000,
  })
}
