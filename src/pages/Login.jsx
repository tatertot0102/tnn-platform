import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Spinner from '../components/ui/Spinner'
import { getAppUrl } from '../lib/siteUrl'
import tnnLogo from '../assets/tnn-logo.svg'

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [success, setSuccess]   = useState('')
  const [sendingReset, setSendingReset] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = await signIn(email, password)
    if (error) setError(error.message)
    else navigate('/dashboard')
    setLoading(false)
  }

  async function handleForgotPassword() {
    setError('')
    setSuccess('')

    if (!email.trim()) {
      setError('Enter your email first, then click Forgot Password.')
      return
    }

    setSendingReset(true)

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: getAppUrl('/reset-password'),
    })

    setSendingReset(false)

    if (error) {
      setError(error.message)
      return
    }

    setSuccess('Password reset email sent. Check your inbox and follow the link to reset your password.')
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white mb-4 p-2.5 shadow-lg shadow-black/40">
            <img src={tnnLogo} alt="TNN" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-white">TNN Platform</h1>
          <p className="text-gray-400 text-sm mt-1">Tech News Network</p>
        </div>

        <div className="card p-6">
          <h2 className="text-base font-semibold text-white mb-6">Sign in</h2>

          {success ? (
            <div className="bg-green-900/40 border border-green-800 rounded-lg p-4 text-green-300 text-sm text-center">
              {success}
              <button onClick={() => setSuccess('')} className="block w-full mt-3 text-brand-400 hover:underline">
                Back to sign in
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Email</label>
                <input
                  className="input"
                  type="email"
                  placeholder="you@school.edu"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium text-gray-400">Password</label>
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={sendingReset}
                    className="text-xs text-brand-400 hover:underline disabled:opacity-50"
                  >
                    {sendingReset ? 'Sending...' : 'Forgot Password?'}
                  </button>
                </div>
                <input
                  className="input"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>

              {error && (
                <p className="text-red-400 text-xs bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
                {loading && <Spinner size={4} />}
                Sign In
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-gray-500 text-xs mt-4">
          Need an account? Ask Zane to invite you.
        </p>
        <p className="text-center text-gray-600 text-xs mt-1">
          Managed by Zane Wolf • Internal use only!
        </p>
      </div>
    </div>
  )
}
