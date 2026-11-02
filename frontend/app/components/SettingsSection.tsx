'use client'

import { useEffect, useState } from 'react'
import { api, type EmailSettings } from '@/lib/api'
import {
  CheckCircle2,
  HelpCircle,
  Mail,
  RefreshCw,
  Send,
  Settings,
  ShieldCheck,
} from 'lucide-react'

export function SettingsSection({
  onShowToast,
}: {
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}) {
  const [smtpHost, setSmtpHost] = useState('smtp.gmail.com')
  const [smtpPort, setSmtpPort] = useState(587)
  const [smtpUser, setSmtpUser] = useState('')
  const [smtpPassword, setSmtpPassword] = useState('')
  const [senderName, setSenderName] = useState('Smart Attendance Kiosk')
  const [hasPassword, setHasPassword] = useState(false)

  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testRecipient, setTestRecipient] = useState('')

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const s = await api.emailSettings()
        if (s) {
          setSmtpHost(s.smtp_host || 'smtp.gmail.com')
          setSmtpPort(s.smtp_port || 587)
          setSmtpUser(s.smtp_user || '')
          setSenderName(s.sender_name || 'Smart Attendance Kiosk')
          setHasPassword(Boolean(s.has_password))
          if (s.smtp_password) {
            setSmtpPassword(s.smtp_password)
          }
        }
      } catch (e: any) {
        onShowToast(e.message || 'Failed to load email settings', 'error')
      }
    }
    loadSettings()
  }, [])

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.saveEmailSettings({
        smtp_host: smtpHost.trim(),
        smtp_port: Number(smtpPort),
        smtp_user: smtpUser.trim(),
        smtp_password: smtpPassword.trim(),
        sender_name: senderName.trim(),
      })
      onShowToast('SMTP email settings saved successfully!', 'success')
      setHasPassword(Boolean(smtpPassword.trim()))
    } catch (e: any) {
      onShowToast(e.message || 'Failed to save settings', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleSendTestEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!testRecipient.trim()) {
      onShowToast('Enter a recipient email address to send test email', 'error')
      return
    }

    setTesting(true)
    try {
      await api.testEmail(testRecipient.trim())
      onShowToast(`Test email successfully delivered to ${testRecipient}!`, 'success')
    } catch (e: any) {
      onShowToast(e.message || 'Failed to send test email', 'error')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-border pb-4">
        <h2 className="text-xl font-bold tracking-tight">Email & Notification Settings</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Configure SMTP email settings to automatically email attendance summaries to class teachers.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main SMTP Settings Form */}
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2.5 border-b border-border pb-3">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Mail className="size-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold">SMTP Mail Server Configuration</h3>
              <p className="text-[11px] text-muted-foreground">Works with Gmail, Outlook, or institutional SMTP</p>
            </div>
          </div>

          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  SMTP Host Server
                </label>
                <input
                  type="text"
                  required
                  placeholder="smtp.gmail.com"
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Port
                </label>
                <input
                  type="number"
                  required
                  placeholder="587"
                  value={smtpPort}
                  onChange={(e) => setSmtpPort(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                Sender Email Address (Username) *
              </label>
              <input
                type="email"
                required
                placeholder="e.g. college.attendance.kiosk@gmail.com"
                value={smtpUser}
                onChange={(e) => setSmtpUser(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary focus:outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-muted-foreground">
                  Email Password / App Password *
                </label>
                {hasPassword && (
                  <span className="text-[11px] font-semibold text-emerald-400 inline-flex items-center gap-1">
                    <CheckCircle2 className="size-3" /> Password is saved
                  </span>
                )}
              </div>
              <input
                type="password"
                placeholder={hasPassword ? '•••••••••••• (Leave blank to keep existing)' : 'Enter 16-character App Password'}
                value={smtpPassword}
                onChange={(e) => setSmtpPassword(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                Sender Display Name
              </label>
              <input
                type="text"
                placeholder="Smart Attendance Kiosk"
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold text-primary-foreground bg-primary rounded-xl hover:bg-primary/90 transition shadow-sm disabled:opacity-50"
            >
              {saving ? (
                <>
                  <RefreshCw className="size-3.5 animate-spin" />
                  Saving Settings...
                </>
              ) : (
                <>
                  <ShieldCheck className="size-4" />
                  Save Settings
                </>
              )}
            </button>
          </form>
        </div>

        {/* Right: Quick Instructions & Test Email */}
        <div className="space-y-6">
          {/* Test Email Card */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b border-border pb-3">
              <Send className="size-4 text-primary" />
              <h3 className="text-sm font-bold">Send Test Email</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Send a test notification to verify your SMTP connection right now.
            </p>

            <form onSubmit={handleSendTestEmail} className="space-y-3">
              <input
                type="email"
                required
                placeholder="Your email address"
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary focus:outline-none"
              />
              <button
                type="submit"
                disabled={testing}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold border border-border bg-card hover:bg-muted transition rounded-xl disabled:opacity-50"
              >
                {testing ? (
                  <>
                    <RefreshCw className="size-3.5 animate-spin" />
                    Sending Test Email...
                  </>
                ) : (
                  <>
                    <Send className="size-3.5 text-primary" />
                    Verify Connection
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Gmail App Password Helper */}
          <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4 text-xs space-y-2 text-muted-foreground">
            <div className="flex items-center gap-2 font-bold text-sky-400">
              <HelpCircle className="size-4" />
              How to use Gmail for free:
            </div>
            <ol className="list-decimal list-inside space-y-1 text-[11px] leading-relaxed">
              <li>Open your Google Account $\to$ <strong>Security</strong>.</li>
              <li>Enable <strong>2-Step Verification</strong>.</li>
              <li>Search for <strong>App passwords</strong>.</li>
              <li>Create an app name (e.g. <em>Attendance</em>) and generate a 16-letter password.</li>
              <li>Paste that 16-letter key into the password field above.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}
