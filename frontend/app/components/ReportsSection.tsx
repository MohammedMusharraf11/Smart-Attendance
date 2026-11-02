'use client'

import { useEffect, useState } from 'react'
import { api, type ClassSession, type SessionReport } from '@/lib/api'
import {
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Mail,
  RefreshCw,
  Send,
  Sliders,
  User,
  Users,
  UserX,
  XCircle,
} from 'lucide-react'

export function ReportsSection({
  initialSessionId,
  onScheduleClick,
  onShowToast,
}: {
  initialSessionId?: number | null
  onScheduleClick: () => void
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}) {
  const [sessions, setSessions] = useState<ClassSession[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(
    initialSessionId || null
  )
  const [report, setReport] = useState<SessionReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [filterTab, setFilterTab] = useState<'all' | 'absent' | 'present'>('absent')

  // Load sessions list
  const loadSessions = async () => {
    try {
      const data = await api.sessions()
      setSessions(data)
      if (data.length > 0 && !selectedSessionId) {
        setSelectedSessionId(data[0].id)
      }
    } catch (e: any) {
      onShowToast(e.message || 'Failed to load sessions', 'error')
    }
  }

  useEffect(() => {
    loadSessions()
  }, [])

  // If initialSessionId changes from parent
  useEffect(() => {
    if (initialSessionId) {
      setSelectedSessionId(initialSessionId)
    }
  }, [initialSessionId])

  // Load report when selectedSessionId changes
  useEffect(() => {
    if (!selectedSessionId) {
      setReport(null)
      return
    }

    let isCurrent = true
    const fetchReport = async () => {
      setLoading(true)
      try {
        const rep = await api.sessionReport(selectedSessionId)
        if (isCurrent) setReport(rep)
      } catch (e: any) {
        if (isCurrent) {
          onShowToast(e.message || 'Failed to calculate session report', 'error')
        }
      } finally {
        if (isCurrent) setLoading(false)
      }
    }

    fetchReport()
    return () => {
      isCurrent = false
    }
  }, [selectedSessionId])

  // Send Email Handler
  const handleSendAttendanceEmail = async () => {
    if (!selectedSessionId || !report) return

    setSendingEmail(true)
    try {
      const res = await api.sendSessionEmail(selectedSessionId)
      onShowToast(
        `Attendance report successfully emailed to ${res.recipient}!`,
        'success'
      )
      // Refresh report to show updated email status
      const rep = await api.sessionReport(selectedSessionId)
      setReport(rep)
    } catch (e: any) {
      onShowToast(e.message || 'Failed to send attendance email', 'error')
    } finally {
      setSendingEmail(false)
    }
  }

  // Export CSV Handler
  const handleExportCSV = () => {
    if (!report) return

    const session = report.session
    const rows = [
      ['Subject', session.subject_name],
      ['Teacher', session.teacher_name],
      ['Teacher Email', session.teacher_email],
      ['Date', session.session_date],
      ['Class Timing', `${session.start_time} - ${session.end_time}`],
      ['Cutoff Minutes', `${session.cutoff_minutes} mins`],
      ['Total Enrolled', report.summary.total_enrolled],
      ['Present Count', report.summary.present_count],
      ['Absent Count', report.summary.absent_count],
      ['Attendance %', `${report.summary.attendance_percentage}%`],
      [],
      ['Roll / Code', 'Student Name', 'Status', 'Time In', 'Match Score'],
    ]

    report.present.forEach((p) => {
      rows.push([
        p.code,
        p.name,
        'PRESENT',
        p.time_in,
        `${(p.similarity * 100).toFixed(1)}%`,
      ])
    })

    report.absent.forEach((a) => {
      rows.push([a.code, a.name, 'ABSENT', '—', '—'])
    })

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      rows.map((e) => e.map((val) => `"${val}"`).join(',')).join('\n')

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute(
      'download',
      `Attendance_${session.subject_name.replace(/\s+/g, '_')}_${session.session_date}.csv`
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    onShowToast('CSV exported successfully!', 'success')
  }

  const selectedSession = sessions.find((s) => s.id === selectedSessionId)

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Session Attendance & Reports</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Review live present vs. absent lists for scheduled classes and dispatch email reports to teachers.
          </p>
        </div>

        {/* Session Dropdown Selector */}
        {sessions.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">
              Select Class:
            </span>
            <select
              value={selectedSessionId || ''}
              onChange={(e) => setSelectedSessionId(Number(e.target.value))}
              className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-border bg-card focus:ring-2 focus:ring-primary focus:outline-none"
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.subject_name} &bull; {s.session_date} ({s.start_time} - {s.end_time})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {sessions.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground rounded-2xl border border-dashed border-border bg-card p-8">
          <Calendar className="size-12 mx-auto mb-3 opacity-30 text-primary" />
          <h3 className="text-base font-bold text-foreground">No Class Sessions Available</h3>
          <p className="text-xs max-w-sm mx-auto mt-1 mb-4">
            You haven't scheduled any classes yet. Schedule a class first to calculate attendance and email teachers.
          </p>
          <button
            onClick={onScheduleClick}
            className="px-4 py-2 text-xs font-bold bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition shadow-sm"
          >
            Go to Class Timetable
          </button>
        </div>
      ) : !report ? (
        <div className="py-16 text-center text-muted-foreground">
          <RefreshCw className="size-8 mx-auto mb-2 animate-spin text-primary" />
          <p className="text-xs font-semibold">Calculating attendance data...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Session Overview Card & Prominent Send Button */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-extrabold uppercase tracking-wide text-primary bg-primary/10 px-2.5 py-0.5 rounded-full">
                    {report.session.subject_name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Faculty: <strong>{report.session.teacher_name}</strong> ({report.session.teacher_email})
                  </span>
                </div>
                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                    <Calendar className="size-3.5 text-primary" />
                    {report.session.session_date}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3.5 text-primary" />
                    {report.session.start_time} - {report.session.end_time}
                  </span>
                  <span className="inline-flex items-center gap-1 font-medium text-sky-400">
                    <Sliders className="size-3.5" />
                    Cutoff Window: {report.session.cutoff_minutes} mins (Any scan up to {report.session.cutoff_minutes}m from start is Present)
                  </span>
                </div>
              </div>

              {/* Action Buttons: SEND ATTENDANCE & EXPORT */}
              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  onClick={handleExportCSV}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold border border-border bg-card hover:bg-muted transition flex items-center gap-1.5"
                  title="Export Attendance to CSV"
                >
                  <Download className="size-3.5 text-muted-foreground" />
                  Export CSV
                </button>

                <button
                  onClick={handleSendAttendanceEmail}
                  disabled={sendingEmail}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition shadow-md flex items-center gap-2 disabled:opacity-50"
                >
                  {sendingEmail ? (
                    <>
                      <RefreshCw className="size-3.5 animate-spin" />
                      Sending to Teacher...
                    </>
                  ) : (
                    <>
                      <Send className="size-3.5" />
                      Send Attendance Email
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Email Status Alert */}
            {report.session.email_sent === 1 && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 flex items-center justify-between text-xs text-emerald-400">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 shrink-0" />
                  <span>
                    Attendance report was emailed to <strong>{report.session.teacher_email}</strong>.
                  </span>
                </div>
                {report.session.email_sent_at && (
                  <span className="text-[11px] text-muted-foreground font-mono">
                    Sent at: {new Date(report.session.email_sent_at).toLocaleTimeString()}
                  </span>
                )}
              </div>
            )}

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
              <div className="rounded-xl border border-border bg-muted/20 p-3.5 text-center">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Class Strength
                </p>
                <p className="text-2xl font-black mt-1 text-foreground">
                  {report.summary.total_enrolled}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">All Enrolled Students</p>
              </div>

              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-center">
                <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                  Present
                </p>
                <p className="text-2xl font-black mt-1 text-emerald-400">
                  {report.summary.present_count}
                </p>
                <p className="text-[10px] text-emerald-500/80 mt-0.5">Scanned within cutoff</p>
              </div>

              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-center">
                <p className="text-[11px] font-bold uppercase tracking-wider text-rose-400">
                  Absent
                </p>
                <p className="text-2xl font-black mt-1 text-rose-400">
                  {report.summary.absent_count}
                </p>
                <p className="text-[10px] text-rose-500/80 mt-0.5">Missed class window</p>
              </div>

              <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-3.5 text-center">
                <p className="text-[11px] font-bold uppercase tracking-wider text-sky-400">
                  Attendance Turnout
                </p>
                <p className="text-2xl font-black mt-1 text-sky-400">
                  {report.summary.attendance_percentage}%
                </p>
                <p className="text-[10px] text-sky-500/80 mt-0.5">Turnout rate</p>
              </div>
            </div>
          </div>

          {/* Student Breakdown Section with Filter Tabs */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
              <div className="flex items-center gap-1.5 p-1 rounded-xl bg-muted/40 border border-border">
                <button
                  onClick={() => setFilterTab('absent')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition flex items-center gap-1.5 ${
                    filterTab === 'absent'
                      ? 'bg-rose-500 text-white shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <UserX className="size-3.5" />
                  Absent ({report.summary.absent_count})
                </button>

                <button
                  onClick={() => setFilterTab('present')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition flex items-center gap-1.5 ${
                    filterTab === 'present'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <CheckCircle2 className="size-3.5" />
                  Present ({report.summary.present_count})
                </button>

                <button
                  onClick={() => setFilterTab('all')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition flex items-center gap-1.5 ${
                    filterTab === 'all'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Users className="size-3.5" />
                  All Students ({report.summary.total_enrolled})
                </button>
              </div>

              <span className="text-xs text-muted-foreground">
                Attendance window: <strong>{report.session.start_time}</strong> to{' '}
                <strong>{report.session.cutoff_minutes}m cutoff</strong>
              </span>
            </div>

            {/* Table based on filter */}
            {filterTab === 'absent' && (
              <div>
                {report.absent.length === 0 ? (
                  <div className="py-10 text-center text-emerald-400 font-bold text-sm">
                    🎉 Excellent! 100% attendance — zero absentees.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-rose-500/20">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-border bg-rose-500/5 font-semibold text-rose-400">
                          <th className="py-2.5 px-3.5">#</th>
                          <th className="py-2.5 px-3.5">Roll / ID Code</th>
                          <th className="py-2.5 px-3.5">Student Name</th>
                          <th className="py-2.5 px-3.5 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {report.absent.map((a, i) => (
                          <tr key={a.code} className="hover:bg-rose-500/5 transition">
                            <td className="py-3 px-3.5 text-muted-foreground font-mono">{i + 1}</td>
                            <td className="py-3 px-3.5 font-mono font-bold text-rose-400">{a.code}</td>
                            <td className="py-3 px-3.5 font-medium text-foreground">{a.name}</td>
                            <td className="py-3 px-3.5 text-right">
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                                <XCircle className="size-3" />
                                ABSENT
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {filterTab === 'present' && (
              <div>
                {report.present.length === 0 ? (
                  <div className="py-10 text-center text-muted-foreground text-sm font-semibold">
                    No students scanned into this class window yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-emerald-500/20">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-border bg-emerald-500/5 font-semibold text-emerald-400">
                          <th className="py-2.5 px-3.5">#</th>
                          <th className="py-2.5 px-3.5">Roll / ID Code</th>
                          <th className="py-2.5 px-3.5">Student Name</th>
                          <th className="py-2.5 px-3.5">Check-in Time</th>
                          <th className="py-2.5 px-3.5">Match Score</th>
                          <th className="py-2.5 px-3.5 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {report.present.map((p, i) => (
                          <tr key={p.code} className="hover:bg-emerald-500/5 transition">
                            <td className="py-3 px-3.5 text-muted-foreground font-mono">{i + 1}</td>
                            <td className="py-3 px-3.5 font-mono font-bold text-sky-400">{p.code}</td>
                            <td className="py-3 px-3.5 font-medium text-foreground">{p.name}</td>
                            <td className="py-3 px-3.5 text-foreground font-medium">{p.time_in}</td>
                            <td className="py-3 px-3.5">
                              <span className="font-semibold text-emerald-400 font-mono text-[11px]">
                                {(p.similarity * 100).toFixed(1)}%
                              </span>
                            </td>
                            <td className="py-3 px-3.5 text-right">
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                <CheckCircle2 className="size-3" />
                                PRESENT
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {filterTab === 'all' && (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
                      <th className="py-2.5 px-3.5">#</th>
                      <th className="py-2.5 px-3.5">Roll / ID Code</th>
                      <th className="py-2.5 px-3.5">Student Name</th>
                      <th className="py-2.5 px-3.5">Check-in Time</th>
                      <th className="py-2.5 px-3.5 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {/* First list present, then absent */}
                    {report.present.map((p, i) => (
                      <tr key={`p-${p.code}`} className="hover:bg-muted/30 transition">
                        <td className="py-3 px-3.5 text-muted-foreground font-mono">{i + 1}</td>
                        <td className="py-3 px-3.5 font-mono font-bold text-sky-400">{p.code}</td>
                        <td className="py-3 px-3.5 font-medium text-foreground">{p.name}</td>
                        <td className="py-3 px-3.5 text-foreground">{p.time_in}</td>
                        <td className="py-3 px-3.5 text-right">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            PRESENT
                          </span>
                        </td>
                      </tr>
                    ))}
                    {report.absent.map((a, i) => (
                      <tr key={`a-${a.code}`} className="hover:bg-muted/30 transition opacity-80">
                        <td className="py-3 px-3.5 text-muted-foreground font-mono">
                          {report.present.length + i + 1}
                        </td>
                        <td className="py-3 px-3.5 font-mono font-bold text-rose-400">{a.code}</td>
                        <td className="py-3 px-3.5 font-medium text-foreground">{a.name}</td>
                        <td className="py-3 px-3.5 text-muted-foreground">—</td>
                        <td className="py-3 px-3.5 text-right">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                            ABSENT
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

