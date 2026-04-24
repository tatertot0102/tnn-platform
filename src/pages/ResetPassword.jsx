import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Spinner from '../components/ui/Spinner'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function init() {
      try {
        // Supabase may either place recovery tokens in the URL hash
        // or automatically create a temporary recovery session.
        const hash = window.location.hash.startsWith('#')
          ? new URLSearchParams(window.location.hash.slice(1))
          : null

        const accessToken = hash?.get('access_token')
        const refreshToken = hash?.get('refresh_token')
        const type = hash?.get('type')

        if (type === 'recovery' && accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })

          if (error) {
            setError(error.message)
          } else {
            setReady(true)
            window.history.replaceState({}, document.title, window.location.pathname)
          }
        } else {
          const { data } = await supabase.auth.getSession()

          if (data?.session) {
            setReady(true)
          } else {
            setError('This reset link is invalid or expired. Please request a new password reset email.')
          }
        }
      } catch (err) {
        setError('Could not verify reset link.')
      } finally {
        setLoading(false)
      }
    }

    init()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSaving(true)

    const { error } = await supabase.auth.updateUser({
      password,
    })

    setSaving(false)

    if (error) {
      setError(error.message)
      return
    }

    alert('Password updated successfully.')
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md card p-6">
        <h1 className="text-2xl font-bold text-white mb-2">Reset Password</h1>
        <p className="text-sm text-gray-400 mb-6">
          Enter a new password for your account.
        </p>

        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner size={8} />
          </div>
        ) : error && !ready ? (
          <div className="text-sm text-red-400 bg-red-950/40 border border-red-900/40 rounded-lg px-3 py-2">
            {error}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                New Password
              </label>
              <input
                type="password"
                className="input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Confirm New Password
              </label>
              <input
                type="password"
                className="input"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <div className="text-sm text-red-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="btn-primary w-full"
            >
              {saving ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}