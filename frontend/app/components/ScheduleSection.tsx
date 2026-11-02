'use client'

import { useEffect, useState } from 'react'
import { api, type ClassSession, type Teacher } from '@/lib/api'
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  Mail,
  Plus,
  RefreshCw,
  Send,
  Sliders,
  Trash2,
  User,
} from 'lucide-react'

export function ScheduleSection({
  onViewReport,
  onShowToast,
}: {
  onViewReport: (sessionId: number) => void
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}) {
  const [sessions, setSessions] = useState<ClassSession[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [sendingEmailId, setSendingEmailId] = useState<number | null>(null)

  // Form state
  const todayStr = new Date().toISOString().split('T')[0]
  const [subjectName, setSubjectName] = useState('')
  const [selectedTeacherId, setSelectedTeacherId] = useState('')
  const [teacherName, setTeacherName] = useState('')
  const [teacherEmail, setTeacherEmail] = useState('')
  const [sessionDate, setSessionDate] = useState(todayStr)
  const [startTime, setStartTime] = useState('10:00')
  const [endTime, setEndTime] = useState('12:00')
  const [cutoffMinutes, setCutoffMinutes] = useState(30)

  const loadData = async () => {
    setLoading(true)
    try {
      const [sessList, teachList] = await Promise.all([
        api.sessions(),
        api.teachers(),
      ])
      setSessions(sessList)
      setTeachers(teachList)
    } catch (e: any) {
      onShowToast(e.message || 'Failed to load schedule data', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // When teacher is selected from dropdown, auto-fill details
  const handleTeacherSelect = (teacherId: string) => {
    setSelectedTeacherId(teacherId)
    const found = teachers.find((t) => String(t.id) === teacherId)
    if (found) {
      setTeacherName(found.name)
      setTeacherEmail(found.email)
      if (found.subject && !subjectName) {
        setSubjectName(found.subject)
      }
    }
  }

  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!subjectName.trim() || !teacherEmail.trim() || !sessionDate || !startTime) {
      onShowToast('Please fill all required session fields.', 'error')
      return
    }

    setSubmitting(true)
    try {
      await api.addSession({
        subject_name: subjectName.trim(),
        teacher_name: teacherName.trim() || 'Class Faculty',
        teacher_email: teacherEmail.trim(),
        session_date: sessionDate,
        start_time: startTime,
        end_time: endTime || startTime,
        cutoff_minutes: cutoffMinutes,
      })
      onShowToast(`Session for ${subjectName} scheduled successfully!`, 'success')
      setSubjectName('')
      setSelectedTeacherId('')
      setTeacherName('')
      setTeacherEmail('')
      loadData()
    } catch (e: any) {
      onShowToast(e.message || 'Failed to schedule session', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteSession = async (id: number, sub: string) => {
    if (!confirm(`Delete scheduled session for ${sub}?`)) return
    try {
      await api.deleteSession(id)
      onShowToast(`Session for ${sub} deleted.`, 'info')
      loadData()
    } catch (e: any) {
      onShowToast(e.message || 'Failed to delete session', 'error')
    }
  }

  const handleSendEmail = async (session: ClassSession) => {
    setSendingEmailId(session.id)
    try {
      await api.sendSessionEmail(session.id)
      onShowToast(`Attendance report emailed to ${session.teacher_email}!`, 'success')
      loadData()
    } catch (e: any) {
      onShowToast(e.message || 'Failed to send attendance email', 'error')
    } finally {
      setSendingEmailId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Class Timetable & Sessions</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Schedule lecture periods with dynamic attendance cutoff windows. All enrolled students are tracked against scheduled slots.
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-xl border border-border bg-card hover:bg-muted transition"
        >
          <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Schedule Form */}
        <div className="lg:col-span-1 rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2.5 border-b border-border pb-3">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Calendar className="size-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold">Schedule a Class</h3>
              <p className="text-[11px] text-muted-foreground">Define subject, timing & cutoff</p>
            </div>
          </div>

          <form onSubmit={handleScheduleSubmit} className="space-y-3.5">
            {/* Subject Name */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                Subject Name *
              </label>
              <div className="relative">
                <BookOpen className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                <input
                  type="text"
                  required
                  placeholder="e.g. VLSI Design"
                  value={subjectName}
                  onChange={(e) => setSubjectName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>
            </div>

            {/* Teacher Selection */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                Assign Teacher
              </label>
              <select
                value={selectedTeacherId}
                onChange={(e) => handleTeacherSelect(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary focus:outline-none mb-2"
              >
                <option value="">-- Select from Registered Faculty --</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.email})
                  </option>
                ))}
              </select>

              <div className="space-y-2">
                <div className="relative">
                  <User className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                  <input
                    type="text"
                    required
                    placeholder="Teacher Name (e.g. Dr. Ramesh)"
                    value={teacherName}
                    onChange={(e) => setTeacherName(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                  <input
                    type="email"
                    required
                    placeholder="Teacher Email ID"
                    value={teacherEmail}
                    onChange={(e) => setTeacherEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Date */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                Class Date *
              </label>
              <input
                type="date"
                required
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary focus:outline-none"
              />
            </div>

            {/* Time range */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Start Time *
                </label>
                <input
                  type="time"
                  required
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  End Time *
                </label>
                <input
                  type="time"
                  required
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>
            </div>

            {/* Dynamic Cutoff Window */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-muted-foreground">
                  Attendance Window (Cutoff)
                </label>
                <span className="text-[11px] font-bold text-primary">
                  {cutoffMinutes} Minutes
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1.5 mb-2">
                {[15, 30, 45, 60].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setCutoffMinutes(mins)}
                    className={`py-1.5 text-xs font-bold rounded-lg border transition ${
                      cutoffMinutes === mins
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-muted/30 text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {mins}m
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Scans recorded between <strong>{startTime}</strong> and{' '}
                <strong>{cutoffMinutes} mins after start</strong> are marked Present.
              </p>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full mt-2 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-primary-foreground bg-primary rounded-xl hover:bg-primary/90 transition shadow-sm disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <RefreshCw className="size-3.5 animate-spin" />
                  Scheduling Class...
                </>
              ) : (
                <>
                  <Plus className="size-4" />
                  Schedule Class
                </>
              )}
            </button>
          </form>
        </div>

        {/* Right: Scheduled Sessions Timeline */}
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <Calendar className="size-4 text-primary" />
              <h3 className="text-sm font-bold">Scheduled Classes ({sessions.length})</h3>
            </div>
          </div>

          {sessions.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Calendar className="size-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-semibold">No classes scheduled yet</p>
              <p className="text-xs mt-1">Schedule a class to track attendance and automatically notify teachers.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className="rounded-xl border border-border bg-muted/20 hover:bg-muted/40 p-4 transition flex flex-col justify-between space-y-3"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-sm text-foreground">{s.subject_name}</h4>
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                          <User className="size-3" />
                          {s.teacher_name} ({s.teacher_email})
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteSession(s.id, s.subject_name)}
                        className="text-muted-foreground hover:text-rose-500 p-1 rounded transition"
                        title="Delete Session"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                        <Calendar className="size-3.5 text-primary" />
                        {s.session_date}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="size-3.5 text-primary" />
                        {s.start_time} - {s.end_time}
                      </span>
                    </div>

                    <div className="mt-2.5 flex items-center justify-between text-[11px]">
                      <span className="inline-flex items-center gap-1 font-medium text-sky-400 bg-sky-950/60 px-2 py-0.5 rounded border border-sky-500/20">
                        <Sliders className="size-3" />
                        Cutoff: {s.cutoff_minutes} mins window
                      </span>

                      {s.email_sent === 1 ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-500/30">
                          <CheckCircle2 className="size-3" />
                          Email Sent
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Email Pending</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2 border-t border-border">
                    <button
                      onClick={() => onViewReport(s.id)}
                      className="flex-1 py-1.5 px-3 rounded-lg text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition text-center"
                    >
                      View Report
                    </button>
                    <button
                      onClick={() => handleSendEmail(s)}
                      disabled={sendingEmailId === s.id}
                      className="py-1.5 px-3 rounded-lg text-xs font-semibold border border-border bg-card hover:bg-muted transition flex items-center gap-1.5 text-foreground disabled:opacity-50"
                      title="Send Attendance Report to Teacher Email"
                    >
                      {sendingEmailId === s.id ? (
                        <RefreshCw className="size-3 animate-spin" />
                      ) : (
                        <Send className="size-3 text-primary" />
                      )}
                      Email Teacher
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

