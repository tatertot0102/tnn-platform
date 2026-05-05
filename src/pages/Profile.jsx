import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import PageHeader from '../components/ui/PageHeader'
import Spinner from '../components/ui/Spinner'

export default function Profile() {
  const { profile, fetchProfile, user } = useAuth()
  const [form, setForm] = useState({
    full_name:     profile?.full_name     ?? '',
    slack_user_id: profile?.slack_user_id ?? '',
  })
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [error, setError]     = useState('')

  const [passwordForm, setPasswordForm] = useState({
    newPassword: '',
    confirmPassword: '',
  })
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordSaved, setPasswordSaved] = useState(false)
  const [passwordError, setPasswordError] = useState('')

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: form.full_name, slack_user_id: form.slack_user_id || null })
      .eq('id', profile.id)
    setSaving(false)
    if (error) { setError(error.message); return }
    await fetchProfile(profile.id)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  async function handlePasswordChange(e) {
    e.preventDefault()
    setPasswordSaving(true)
    setPasswordSaved(false)
    setPasswordError('')

    if (passwordForm.newPassword.length < 6) {
      setPasswordSaving(false)
      setPasswordError('Password must be at least 6 characters long.')
      return
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordSaving(false)
      setPasswordError('Passwords do not match.')
      return
    }

    const { error } = await supabase.auth.updateUser({
      password: passwordForm.newPassword,
    })

    setPasswordSaving(false)

    if (error) {
      setPasswordError(error.message)
      return
    }

    setPasswordForm({ newPassword: '', confirmPassword: '' })
    setPasswordSaved(true)
    setTimeout(() => setPasswordSaved(false), 2500)
  }

  return (
    <div>
      <PageHeader title="My Profile" subtitle="Update your name, Slack connection, and password" />
      <div className="space-y-6 max-w-lg">
        <div className="card p-6">
          <form onSubmit={handleSave} className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Full Name</label>
              <input
                className="input"
                value={form.full_name}
                onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Email</label>
              <input className="input opacity-50 cursor-not-allowed" value={user?.email ?? ''} disabled />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Slack User ID
              </label>
              <input
                className="input"
                placeholder="U0123456789"
                value={form.slack_user_id}
                onChange={e => setForm(f => ({ ...f, slack_user_id: e.target.value.trim() }))}
              />
              <p className="text-xs text-gray-600 mt-1.5">
                In Slack: click your name → Profile → three-dot menu → Copy member ID
              </p>
            </div>

            {error && <p className="text-red-400 text-xs">{error}</p>}

            <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
              {saving && <Spinner size={4} />}
              {saved ? '✓ Saved!' : 'Save Changes'}
            </button>
          </form>
        </div>

        <div className="card p-6">
          <h2 className="text-lg font-semibold text-white mb-1">Change Password</h2>
          <p className="text-sm text-gray-400 mb-5">
            Enter a new password for your account.
          </p>

          <form onSubmit={handlePasswordChange} className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">New Password</label>
              <input
                className="input"
                type="password"
                value={passwordForm.newPassword}
                onChange={e => setPasswordForm(f => ({ ...f, newPassword: e.target.value }))}
                minLength={6}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Confirm New Password</label>
              <input
                className="input"
                type="password"
                value={passwordForm.confirmPassword}
                onChange={e => setPasswordForm(f => ({ ...f, confirmPassword: e.target.value }))}
                minLength={6}
                required
              />
            </div>

            {passwordError && <p className="text-red-400 text-xs">{passwordError}</p>}
            {passwordSaved && <p className="text-green-400 text-xs">Password updated successfully.</p>}

            <button type="submit" disabled={passwordSaving} className="btn-primary flex items-center gap-2">
              {passwordSaving && <Spinner size={4} />}
              Update Password
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
