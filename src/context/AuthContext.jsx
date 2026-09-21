import { createContext, useContext, useEffect, useMemo, useState } from 'react'
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

    // Only sign-in, sign-out and account edits change who the user is. Token
    // refreshes (hourly, and on tab focus) must not replace the profile object,
    // or every page keyed on it refetches from scratch.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!initialized) return  // skip duplicate fire on initial load
      if (event === 'SIGNED_OUT' || !session?.user) {
        setUser(null); setProfile(null); setLoading(false)
        return
      }
      setUser(prev => prev?.id === session.user.id ? prev : session.user)
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') fetchProfile(session.user.id)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    // Keep the same object when nothing changed, so effects keyed on it stay quiet.
    setProfile(prev => (prev && data && JSON.stringify(prev) === JSON.stringify(data)) ? prev : data)
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

  const value = useMemo(
    () => ({ user, profile, loading, signIn, signUp, signOut, isExec, canViewsAccess, fetchProfile }),
    // signIn/signUp/signOut/fetchProfile only close over the stable supabase client
    [user, profile, loading, isExec, canViewsAccess],
  )

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
