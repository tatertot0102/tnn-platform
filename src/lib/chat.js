import { supabase } from './supabase'

// Fire-and-forget email via the send-email edge function (Gmail API).
// Failures are logged but never block the chat flow — email is a
// notification side-effect, not the source of truth (the message is).
export async function sendEmail({ to, subject, text }) {
  const recipients = [...new Set((to ?? []).filter(Boolean))]
  if (recipients.length === 0) return
  try {
    const { error } = await supabase.functions.invoke('send-email', {
      body: { to: recipients, subject, text },
    })
    if (error) console.error('send-email failed:', error)
  } catch (err) {
    console.error('send-email failed:', err)
  }
}
