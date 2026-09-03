import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getAppUrl } from '../lib/siteUrl'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let initialized = false

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setLoading(false)
      initialized = true
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!initialized) return  // skip duplicate fire on initial load
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    setProfile(data)
    setLoading(false)
  }

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  async function signUp(email, password, fullName) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: getAppUrl('/login'),
      },
    })
    return { data, error }
  }

  async function signOut() { await supabase.auth.signOut() }

  const isExec        = ['exec', 'admin'].includes(profile?.role)
  const canViewsAccess = ['member', 'exec-roles', 'exec', 'admin'].includes(profile?.role)

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signUp, signOut, isExec, canViewsAccess, fetchProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
