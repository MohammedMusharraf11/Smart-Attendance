'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  api,
  type AttendanceRecord,
  type Student,
  type MarkAttendanceResult,
  type InferResult,
  type QRDecodeResult,
  type TriggerStatus,
  type LatestResult,
  type DeviceState,
  type Teacher,
  type ClassSession,
  type SessionReport,
  type EmailSettings,
} from '@/lib/api'
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  Cpu,
  Download,
  Eye,
  FileCheck2,
  GraduationCap,
  HelpCircle,
  History as HistoryIcon,
  Info,
  LayoutDashboard,
  Mail,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  QrCode,
  Radio,
  RefreshCw,
  ScanLine,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sliders,
  Sparkles,
  Trash2,
  Upload,
  UserCheck,
  Users,
  UserX,
  Video,
  VideoOff,
  X,
  XCircle,
  Zap,
} from 'lucide-react'

import { ScheduleSection } from './components/ScheduleSection'
import { ReportsSection } from './components/ReportsSection'
import { TeachersSection } from './components/TeachersSection'
import { SettingsSection } from './components/SettingsSection'

type Section =
  | 'overview'
  | 'live-attendance'
  | 'schedule'
  | 'reports'
  | 'teachers'
  | 'enroll'
  | 'students'
  | 'history'
  | 'settings'
  | 'tester'

const nav = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'live-attendance', label: 'Live Kiosk', icon: Radio },
  { id: 'schedule', label: 'Class Timetable', icon: Calendar },
  { id: 'reports', label: 'Session Reports', icon: Mail },
  { id: 'teachers', label: 'Faculty Directory', icon: BookOpen },
  { id: 'enroll', label: 'Student Enrollment', icon: UserCheck },
  { id: 'students', label: 'Enrolled Database', icon: Users },
  { id: 'history', label: 'Logs & History', icon: ClipboardList },
  { id: 'settings', label: 'Email Settings', icon: Settings },
  { id: 'tester', label: 'Model & QR Tester', icon: Sparkles },
] as const

function formatTime(val?: string) {
  if (!val) return '—'
  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      month: 'short',
      day: 'numeric',
    }).format(new Date(val))
  } catch {
    return val
  }
}

function getInitials(name = 'Student') {
  return name
    .split(' ')
    .filter(Boolean)
    .map((x) => x[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export default function SmartAttendanceDashboard() {
  const [section, setSection] = useState<Section>('live-attendance')
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null)
  const [notice, setNotice] = useState<{ msg: string; type?: 'success' | 'error' | 'info' } | null>(null)

  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setNotice({ msg, type })
  }

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 4000)
    return () => clearTimeout(timer)
  }, [notice])

  const syncData = useCallback(async () => {
    setLoading(true)
    try {
      await api.health()
      setConnected(true)

      const [stdList, recentLogs] = await Promise.all([
        api.students().catch(() => []),
        api.recent(50).catch(() => []),
      ])
      setStudents(stdList)
      setRecords(recentLogs)
    } catch {
      setConnected(false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    syncData()
    const interval = window.setInterval(syncData, 5000)
    return () => window.clearInterval(interval)
  }, [syncData])

  const totalScans = records.length
  const totalStudents = students.length
  const totalEmbeddings = students.reduce((acc, curr) => acc + (curr.image_count || 0), 0)

  return (
    <main className="min-h-screen bg-background text-foreground flex">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-border bg-card transition-all duration-200 lg:flex ${
          collapsed ? 'w-[76px]' : 'w-64'
        }`}
      >
        <div className={`flex h-20 items-center border-b border-border ${collapsed ? 'justify-center' : 'gap-3 px-6'}`}>
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <GraduationCap className="size-5" />
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <p className="font-bold tracking-tight text-base leading-tight">InsightAttend</p>
              <p className="text-[11px] text-muted-foreground font-medium">ArcFace & QR Verification</p>
            </div>
          )}
        </div>

        <nav className="flex flex-col gap-1.5 p-3 flex-1 overflow-y-auto" aria-label="Main navigation">
          {nav.map((item) => {
            const Icon = item.icon
            const active = section === item.id
            return (
              <button
                key={item.id}
                title={collapsed ? item.label : undefined}
                onClick={() => setSection(item.id)}
                className={`flex items-center gap-3 rounded-lg px-3.5 py-3 text-sm font-medium transition-all ${
                  collapsed ? 'justify-center' : ''
                } ${
                  active
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                }`}
              >
                <Icon className="size-4 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </button>
            )
          })}
        </nav>

        <div className="p-3 border-t border-border mt-auto flex flex-col gap-3">
          <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : 'px-2 py-1'}`}>
            <div
              className={`size-2.5 rounded-full ${
                connected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-rose-500'
              }`}
            />
            {!collapsed && (
              <div className="text-xs">
                <p className="font-semibold">{connected ? 'Backend Online' : 'Backend Offline'}</p>
                <p className="text-muted-foreground text-[10px]">
                  {connected ? 'FastAPI & ChromaDB' : '127.0.0.1:8000'}
                </p>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-200 ${collapsed ? 'lg:pl-[76px]' : 'lg:pl-64'}`}>
        {/* Top Navbar */}
        <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-border bg-background/90 px-5 backdrop-blur-md md:px-8">
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden p-2 rounded-md hover:bg-muted"
              onClick={() => setMobileNav(true)}
              aria-label="Open menu"
            >
              <Menu className="size-5" />
            </button>
            <button
              className="hidden lg:inline-flex p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-5" />}
            </button>
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Vision Attendance Station
              </span>
              <h1 className="text-lg font-bold tracking-tight">
                {nav.find((x) => x.id === section)?.label}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={syncData}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-xs font-medium text-foreground shadow-sm hover:bg-muted transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`size-3.5 ${loading ? 'animate-spin text-primary' : ''}`} />
              <span className="hidden sm:inline">Sync Data</span>
            </button>
          </div>
        </header>

        {/* Content Body */}
        <div className="p-5 md:p-8 max-w-7xl w-full mx-auto space-y-6">
          {!connected && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-900 dark:text-amber-200 flex items-start gap-3">
              <AlertCircle className="size-5 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold">Backend server not reachable</p>
                <p className="text-xs mt-1 text-muted-foreground">
                  Make sure your FastAPI server is running with <code className="font-mono bg-muted/60 px-1 py-0.5 rounded">uvicorn app.main:app --reload</code> on port 8000.
                </p>
              </div>
            </div>
          )}

          {section === 'overview' && (
            <OverviewSection
              totalStudents={totalStudents}
              totalScans={totalScans}
              totalEmbeddings={totalEmbeddings}
              recentRecords={records}
              students={students}
              onNavigate={(s) => setSection(s)}
            />
          )}

          {section === 'live-attendance' && (
            <LiveAttendanceSection
              recentRecords={records}
              onRecordAdded={(record) => {
                setRecords((prev) => [record, ...prev])
                showToast(`Attendance verified for ${record.name} (${record.code})`, 'success')
              }}
              onError={(err) => showToast(err, 'error')}
              onSuccess={(msg) => showToast(msg, 'success')}
            />
          )}

          {section === 'enroll' && (
            <EnrollmentSection
              existingStudents={students}
              onSuccess={(msg) => {
                showToast(msg, 'success')
                syncData()
              }}
              onError={(err) => showToast(err, 'error')}
            />
          )}

          {section === 'students' && (
            <StudentsSection
              students={students}
              onRefresh={syncData}
              onSuccess={(msg) => showToast(msg, 'success')}
              onError={(err) => showToast(err, 'error')}
              onDelete={async (code) => {
                try {
                  await api.deleteStudent(code)
                  showToast(`Student ${code} deleted`, 'info')
                  syncData()
                } catch (e: any) {
                  showToast(e.message || 'Failed to delete student', 'error')
                }
              }}
              onEnrollClick={() => setSection('enroll')}
            />
          )}

          {section === 'tester' && (
            <TesterSection
              onAttendanceMarked={(record) => {
                setRecords((prev) => [record, ...prev])
                showToast(`Attendance saved in Live Attendance for ${record.name}!`, 'success')
              }}
              onError={(err) => showToast(err, 'error')}
              onSuccess={(msg) => showToast(msg, 'success')}
            />
          )}

          {section === 'schedule' && (
            <ScheduleSection
              onViewReport={(id) => {
                setSelectedSessionId(id)
                setSection('reports')
              }}
              onShowToast={showToast}
            />
          )}

          {section === 'reports' && (
            <ReportsSection
              initialSessionId={selectedSessionId}
              onScheduleClick={() => setSection('schedule')}
              onShowToast={showToast}
            />
          )}

          {section === 'teachers' && (
            <TeachersSection onShowToast={showToast} />
          )}

          {section === 'settings' && (
            <SettingsSection onShowToast={showToast} />
          )}

          {section === 'history' && <HistorySection records={records} />}
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileNav && (
        <div className="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-sm lg:hidden" onClick={() => setMobileNav(false)}>
          <aside
            className="flex h-full w-72 flex-col bg-card p-5 shadow-2xl border-r border-border"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                  <GraduationCap className="size-5" />
                </div>
                <div>
                  <p className="font-bold text-sm leading-none">InsightAttend</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">ArcFace & QR Backend</p>
                </div>
              </div>
              <button
                onClick={() => setMobileNav(false)}
                className="p-1.5 rounded-lg hover:bg-muted"
                aria-label="Close menu"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="flex flex-col gap-1.5">
              {nav.map((item) => {
                const Icon = item.icon
                const active = section === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setSection(item.id)
                      setMobileNav(false)
                    }}
                    className={`flex items-center gap-3 rounded-lg px-3.5 py-3 text-sm font-medium transition-colors ${
                      active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    <Icon className="size-4" />
                    {item.label}
                  </button>
                )
              })}
            </div>
          </aside>
        </div>
      )}

      {/* Toast notifications */}
      {notice && (
        <div
          role="status"
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium shadow-xl border animate-in fade-in slide-in-from-bottom-4 duration-200 ${
            notice.type === 'success'
              ? 'bg-emerald-950 text-emerald-100 border-emerald-800'
              : notice.type === 'error'
              ? 'bg-rose-950 text-rose-100 border-rose-800'
              : 'bg-card text-foreground border-border'
          }`}
        >
          {notice.type === 'success' && <CheckCircle2 className="size-4 text-emerald-400" />}
          {notice.type === 'error' && <XCircle className="size-4 text-rose-400" />}
          {notice.type === 'info' && <Sparkles className="size-4 text-primary" />}
          <span>{notice.msg}</span>
        </div>
      )}
    </main>
  )
}

/* =========================================================================
   1. OVERVIEW SECTION
   ========================================================================= */
function OverviewSection({
  totalStudents,
  totalScans,
  totalEmbeddings,
  recentRecords,
  students,
  onNavigate,
}: {
  totalStudents: number
  totalScans: number
  totalEmbeddings: number
  recentRecords: AttendanceRecord[]
  students: Student[]
  onNavigate: (s: Section) => void
}) {
  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm hover:border-primary/40 transition-colors">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold uppercase tracking-wider">
            <span>Enrolled Students</span>
            <Users className="size-4 text-primary" />
          </div>
          <p className="mt-3 text-3xl font-extrabold tracking-tight">{totalStudents}</p>
          <p className="mt-1 text-xs text-muted-foreground">Unique student identities in vector DB</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm hover:border-primary/40 transition-colors">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold uppercase tracking-wider">
            <span>Face Vectors Stored</span>
            <Sparkles className="size-4 text-primary" />
          </div>
          <p className="mt-3 text-3xl font-extrabold tracking-tight">{totalEmbeddings}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {totalStudents ? `Avg ${(totalEmbeddings / totalStudents).toFixed(1)} embeddings / student` : 'No embeddings'}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm hover:border-primary/40 transition-colors">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold uppercase tracking-wider">
            <span>Attendance Logged</span>
            <UserCheck className="size-4 text-emerald-500" />
          </div>
          <p className="mt-3 text-3xl font-extrabold tracking-tight">{totalScans}</p>
          <p className="mt-1 text-xs text-muted-foreground">Verified scans recorded in SQLite</p>
        </div>
      </div>

      {/* Quick Actions & Recent Scans */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-border pb-4 mb-4">
              <div>
                <h3 className="font-bold text-base">Recent Verified Logs</h3>
                <p className="text-xs text-muted-foreground">Latest face + QR cross-validated entries</p>
              </div>
              <button
                onClick={() => onNavigate('history')}
                className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
              >
                View all <ChevronRight className="size-3" />
              </button>
            </div>

            {recentRecords.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                <ClipboardList className="size-8 mx-auto mb-2 opacity-30" />
                No attendance recorded yet. Use the Live Attendance station or Complete Tester to mark check-ins.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {recentRecords.slice(0, 5).map((rec, i) => (
                  <div key={rec.id || i} className="flex items-center justify-between py-3.5 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold text-xs">
                        {getInitials(rec.name)}
                      </div>
                      <div>
                        <p className="font-semibold text-sm leading-tight">{rec.name}</p>
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">{rec.code}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                        <CheckCircle2 className="size-3" /> {(rec.similarity * 100).toFixed(0)}% match
                      </span>
                      <p className="text-[11px] text-muted-foreground mt-1">{formatTime(rec.timestamp)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick Start Card */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-gradient-to-br from-card to-muted/40 p-5 shadow-sm flex flex-col justify-between h-full">
            <div>
              <div className="size-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center mb-4">
                <Radio className="size-5" />
              </div>
              <h3 className="font-bold text-base">Attendance Mode</h3>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                Scan student QR codes / ID tags and match against face embeddings. Validated entries are instantly stored in the attendance database.
              </p>
            </div>
            <div className="mt-6 flex flex-col gap-2">
              <button
                onClick={() => onNavigate('live-attendance')}
                className="w-full rounded-xl bg-primary text-primary-foreground py-2.5 px-4 text-xs font-semibold shadow hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
              >
                <Camera className="size-4" /> Open Verification Station
              </button>
              <button
                onClick={() => onNavigate('tester')}
                className="w-full rounded-xl border border-border bg-card py-2.5 px-4 text-xs font-semibold hover:bg-muted transition-colors flex items-center justify-center gap-2"
              >
                <Sparkles className="size-4" /> Test Image + QR Auto-Match
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* =========================================================================
   ESP32 SMART ATTENDANCE STATION (Unified Auto-Capture & Live Hardware Flow)
   ========================================================================= */
type StationPhase =
  | 'idle'
  | 'starting-camera'
  | 'scan_prompt'      // Tell user to scan QR and wait
  | 'scanning_qr'      // Active multi-frame QR decoding
  | 'qr_success'       // QR recognized, brief confirmation
  | 'blink_prompt'     // Tell user to look at camera and blink now
  | 'capturing_face'   // Snap face frame
  | 'processing'       // Biometric matching & SQLite logging
  | 'result'           // Verified successfully
  | 'error'            // Verification failed or no QR detected

function LiveAttendanceStation({
  onRecordAdded,
  onError,
  onSuccess,
}: {
  onRecordAdded: (r: AttendanceRecord) => void
  onError: (msg: string) => void
  onSuccess: (msg: string) => void
}) {
  const [triggerStatus, setTriggerStatus] = useState<TriggerStatus>({ active: false, triggered_at: null })
  const [phase, setPhase] = useState<StationPhase>('idle')
  const [countdown, setCountdown] = useState<number>(3)
  const [detectedCode, setDetectedCode] = useState<string>('')
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [result, setResult] = useState<MarkAttendanceResult | null>(null)
  const [simulating, setSimulating] = useState(false)
  const [autoResetSeconds, setAutoResetSeconds] = useState<number>(5)
  const [blinkProgress, setBlinkProgress] = useState<number>(0)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const cycleIdRef = useRef<number>(0)
  const prevActiveRef = useRef<boolean>(false)
  const lastHandledTriggeredAtRef = useRef<number | null>(null)

  // Start Camera Stream
  const startCamera = async (): Promise<MediaStream | null> => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => {
          try {
            t.stop()
          } catch {}
        })
        streamRef.current = null
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1920, min: 1280 }, height: { ideal: 1080, min: 720 }, facingMode: 'user' },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play().catch(() => {})
      }
      return stream
    } catch (err: any) {
      const msg = 'Unable to access webcam: ' + (err.message || 'Permission denied')
      onError(msg)
      setErrorMessage(msg)
      setPhase('error')
      return null
    }
  }

  // Stop Camera Stream
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        try {
          t.stop()
        } catch {}
      })
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [])

  // Capture single video frame as a JPEG Blob
  const captureFrame = async (): Promise<Blob | null> => {
    if (!videoRef.current) return null
    const video = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.95)
    })
  }

  // Capture downscaled video frame for fast burst upload (640px width, JPEG 0.75)
  const captureBurstFrame = async (targetWidth = 640): Promise<Blob | null> => {
    if (!videoRef.current) return null
    const video = videoRef.current
    const vw = video.videoWidth || 640
    const vh = video.videoHeight || 480
    if (vw === 0 || vh === 0) return null

    const aspect = vh / vw
    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = Math.round(targetWidth * aspect)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.7)
    })
  }

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  // Complete Automated Attendance Pipeline
  const runAttendanceCycle = async () => {
    const currentCycle = ++cycleIdRef.current
    const isCurrent = () => cycleIdRef.current === currentCycle

    setResult(null)
    setDetectedCode('')
    setErrorMessage('')
    setPhase('starting-camera')

    const mediaStream = await startCamera()
    if (!isCurrent()) {
      if (mediaStream) {
        mediaStream.getTracks().forEach((t) => {
          try {
            t.stop()
          } catch {}
        })
      }
      return
    }
    if (!mediaStream) {
      setPhase('idle')
      return
    }

    // =========================================================================
    // PHASE 1: Tell user to scan QR code & wait (Position ID card)
    // =========================================================================
    setPhase('scan_prompt')
    await api.setPhase('scanning_qr')

    // 3-second positioning window
    for (let c = 3; c >= 1; c--) {
      if (!isCurrent()) {
        stopCamera()
        return
      }
      setCountdown(c)
      await sleep(1000)
    }
    if (!isCurrent()) {
      stopCamera()
      return
    }

    // Active multi-frame QR scan (tries up to 10 rapid frames over ~3.5s for max reliability)
    setPhase('scanning_qr')
    let foundCode = ''
    for (let attempt = 1; attempt <= 10; attempt++) {
      if (!isCurrent()) {
        stopCamera()
        return
      }
      const qrFrame = await captureFrame()
      if (qrFrame) {
        try {
          const qrRes = await api.qrDecode(qrFrame)
          if (qrRes?.data && qrRes.data.trim().length > 0) {
            foundCode = qrRes.data.trim().toUpperCase()
            break
          }
        } catch {
          // Frame decode failed on this attempt, continue
        }
      }
      await sleep(350)
    }

    if (!isCurrent()) {
      stopCamera()
      return
    }

    if (!foundCode) {
      stopCamera()
      const msg = 'Could not detect QR code from ID card. Please hold ID card steadily in front of the camera.'
      setErrorMessage(msg)
      onError(msg)
      setPhase('error')
      await api.triggerFail('qr_not_detected')
      return
    }

    setDetectedCode(foundCode)
    setPhase('qr_success')
    // Comfortable pause (2.0s) so user sees green checkmark and puts card away
    await sleep(2000)

    if (!isCurrent()) {
      stopCamera()
      return
    }

    // =========================================================================
    // PHASE 2: Burst Frame Capture for Adaptive Eye-Blink Liveness Detection
    // =========================================================================
    setPhase('blink_prompt')
    setBlinkProgress(0)
    await api.setPhase('blink')
    await sleep(400) // Brief pause so user sees prompt and has eyes open before recording starts

    // Capture 35 frames continuously over 3.5s (~10 fps) so any blink is caught
    const targetFrameCount = 35
    const durationMs = 3500
    const intervalMs = durationMs / targetFrameCount
    const burstFrames: Blob[] = []
    const burstStartTime = performance.now()

    for (let i = 0; i < targetFrameCount; i++) {
      if (!isCurrent()) {
        stopCamera()
        return
      }

      const frameBlob = await captureBurstFrame(640)
      if (frameBlob) {
        burstFrames.push(frameBlob)
      }

      const progress = Math.min(100, Math.round(((i + 1) / targetFrameCount) * 100))
      setBlinkProgress(progress)

      const elapsed = performance.now() - burstStartTime
      const nextExpected = (i + 1) * intervalMs
      const waitTime = Math.max(0, nextExpected - elapsed)
      if (waitTime > 0) {
        await sleep(waitTime)
      }
    }

    if (!isCurrent()) {
      stopCamera()
      return
    }

    if (burstFrames.length < 10) {
      const msg = 'Failed to capture sufficient camera frames for liveness verification.'
      setErrorMessage(msg)
      onError(msg)
      setPhase('error')
      stopCamera()
      return
    }

    // =========================================================================
    // PHASE 3: Processing & Biometric Verification
    // =========================================================================
    setPhase('processing')
    await api.setPhase('processing')

    try {
      let markRes: MarkAttendanceResult
      if (foundCode) {
        // Primary path: adaptive server-side blink check on 30-frame burst + ArcFace verification
        markRes = await api.markAttendanceLive(foundCode, burstFrames)
      } else {
        // Fallback: If QR wasn't isolated in step 1, evaluate face + card together in single frame
        markRes = await api.markAttendanceSingle(burstFrames[0])
      }

      if (!isCurrent()) {
        stopCamera()
        return
      }

      stopCamera()
      setResult(markRes)

      if (markRes.marked && markRes.name && markRes.code) {
        setPhase('result')
        const newRecord: AttendanceRecord = {
          code: markRes.code,
          name: markRes.name,
          similarity: markRes.similarity,
          timestamp: markRes.timestamp || new Date().toISOString(),
        }
        onRecordAdded(newRecord)
        onSuccess(`Attendance verified for ${markRes.name} (${markRes.code})!`)

        // Start auto-reset countdown
        setAutoResetSeconds(5)
      } else {
        setPhase('error')
        let failReason = markRes.reason || 'Verification incomplete.'
        if (failReason === 'no_blink_detected') {
          failReason = 'Liveness check failed: No eye blink detected. Please blink naturally.'
        } else if (failReason === 'eyes_not_open') {
          failReason = 'Liveness check failed: Eyes not clearly open. Please face the camera.'
        } else if (failReason === 'no_face_or_too_few_frames') {
          failReason = 'Liveness check failed: Face not clearly visible in frame. Please stand closer.'
        } else if (failReason === 'no_face_in_best_frame') {
          failReason = 'Biometric check failed: Could not detect face in verification frame.'
        } else if (!foundCode) {
          failReason = 'Could not decode QR code from ID card.'
        }
        setErrorMessage(failReason)
        onError(`Attendance verification failed: ${failReason}`)
      }
    } catch (err: any) {
      if (!isCurrent()) {
        stopCamera()
        return
      }
      stopCamera()
      const msg = err.message || 'Verification failed. Please try again.'
      setErrorMessage(msg)
      onError(msg)
      setPhase('error')
    }
  }

  // Auto-reset timer when successful result or failure is displayed
  useEffect(() => {
    if (phase !== 'result' && phase !== 'error') return
    const timer = setInterval(() => {
      setAutoResetSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          setPhase('idle')
          setTriggerStatus({ active: false, triggered_at: null })
          setResult(null)
          setErrorMessage('')
          prevActiveRef.current = false
          return 5
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [phase])

  // Poll ESP32 trigger status from backend every 1.5s
  useEffect(() => {
    let isMounted = true
    const checkStatus = async () => {
      try {
        const res = await api.triggerStatus()
        if (!isMounted) return

        if (!res.active) {
          prevActiveRef.current = false
          setTriggerStatus(res)
          return
        }

        const isFresh =
          res.triggered_at != null && res.triggered_at !== lastHandledTriggeredAtRef.current

        if (isFresh && !prevActiveRef.current && phase === 'idle') {
          lastHandledTriggeredAtRef.current = res.triggered_at
          prevActiveRef.current = true
          setTriggerStatus(res)
          runAttendanceCycle()
        } else {
          setTriggerStatus(res)
        }
      } catch {
        // Backend offline or unreachable
      }
    }

    checkStatus()
    const interval = window.setInterval(checkStatus, 1500)
    return () => {
      isMounted = false
      window.clearInterval(interval)
    }
  }, [phase])

  // Cancel cycle and return cleanly to idle
  const handleCancelCycle = async () => {
    cycleIdRef.current++
    stopCamera()
    setPhase('idle')
    setTriggerStatus({ active: false, triggered_at: null })
    setResult(null)
    setErrorMessage('')
    prevActiveRef.current = true
    lastHandledTriggeredAtRef.current = triggerStatus.triggered_at || Date.now() / 1000

    try {
      await api.triggerReset()
    } catch {}
  }

  // Simulate proximity trigger for testing without ESP32
  const handleSimulateTrigger = async () => {
    setSimulating(true)
    try {
      const now = Date.now() / 1000
      lastHandledTriggeredAtRef.current = now
      prevActiveRef.current = true
      setTriggerStatus({ active: true, triggered_at: now })
      await api.trigger()
      runAttendanceCycle()
      onSuccess('ESP32 Ultrasonic Proximity Simulated! Camera starting.')
    } catch (err: any) {
      onError('Failed to simulate trigger: ' + err.message)
    } finally {
      setSimulating(false)
    }
  }

  const isCapturing =
    phase === 'starting-camera' ||
    phase === 'scan_prompt' ||
    phase === 'scanning_qr' ||
    phase === 'qr_success' ||
    phase === 'blink_prompt' ||
    phase === 'capturing_face' ||
    phase === 'processing'

  return (
    <div className="space-y-6">
      {/* Main Station Container */}
      <div
        className={`rounded-3xl border transition-all duration-300 overflow-hidden ${
          isCapturing
            ? 'border-amber-500/50 bg-gradient-to-b from-card via-background to-card shadow-2xl shadow-amber-500/10 ring-1 ring-amber-500/30'
            : phase === 'result'
            ? 'border-emerald-500/50 bg-gradient-to-b from-emerald-500/5 via-card to-card shadow-2xl shadow-emerald-500/10'
            : phase === 'error'
            ? 'border-rose-500/50 bg-gradient-to-b from-rose-500/5 via-card to-card shadow-2xl shadow-rose-500/10'
            : 'border-border bg-card/80 shadow-md backdrop-blur-sm'
        }`}
      >
        {/* Station Top Status Bar */}
        <div className="p-6 border-b border-border/70 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div
              className={`flex size-12 shrink-0 items-center justify-center rounded-2xl transition-all shadow-md ${
                isCapturing
                  ? 'bg-amber-500 text-black shadow-amber-500/30 animate-pulse'
                  : phase === 'result'
                  ? 'bg-emerald-500 text-white shadow-emerald-500/30'
                  : phase === 'error'
                  ? 'bg-rose-500 text-white shadow-rose-500/30'
                  : 'bg-primary/10 text-primary'
              }`}
            >
              {isCapturing ? (
                <Radio className="size-6 animate-pulse" />
              ) : phase === 'result' ? (
                <CheckCircle2 className="size-6" />
              ) : phase === 'error' ? (
                <AlertCircle className="size-6" />
              ) : (
                <Zap className="size-6 text-primary" />
              )}
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold tracking-tight text-foreground">
                  ESP32 Smart Attendance Station
                </h2>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border transition-all ${
                    isCapturing
                      ? 'bg-amber-500/15 text-amber-500 border-amber-500/30 animate-pulse'
                      : phase === 'result'
                      ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
                      : phase === 'error'
                      ? 'bg-rose-500/15 text-rose-500 border-rose-500/30'
                      : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                  }`}
                >
                  <span
                    className={`size-2 rounded-full ${
                      isCapturing
                        ? 'bg-amber-500 animate-ping'
                        : phase === 'result'
                        ? 'bg-emerald-500'
                        : phase === 'error'
                        ? 'bg-rose-500'
                        : 'bg-emerald-500'
                    }`}
                  />
                  {isCapturing
                    ? 'Proximity Active • Verification In Progress'
                    : phase === 'result'
                    ? 'Verification Complete'
                    : phase === 'error'
                    ? 'Action Required'
                    : 'Station Ready • Ultrasonic Sensing'}
                </span>

                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground border border-border">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  Wi-Fi Synced
                </span>
              </div>

              <p className="text-xs text-muted-foreground mt-1">
                {isCapturing
                  ? 'Follow the on-screen and ESP32 LCD prompts to complete your attendance verification.'
                  : 'Automatic zero-touch station. Stand in front of the ESP32 ultrasonic sensor (under 15cm) to start.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-start md:self-center">
            {phase === 'idle' && (
              <button
                type="button"
                onClick={handleSimulateTrigger}
                disabled={simulating}
                className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 text-xs font-semibold shadow-md transition-all disabled:opacity-50 cursor-pointer"
                title="Test the entire hardware-triggered flow without physical hardware"
              >
                <Cpu className="size-3.5" />
                {simulating ? 'Triggering Station...' : 'Simulate Sensor Approach'}
              </button>
            )}

            {isCapturing && (
              <button
                type="button"
                onClick={handleCancelCycle}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 px-3.5 py-2 text-xs font-semibold transition-colors cursor-pointer"
              >
                <VideoOff className="size-3.5" />
                Cancel Sequence
              </button>
            )}
          </div>
        </div>

        {/* IDLE VIEW: Interactive 3-Step Hardware Pipeline Guide */}
        {phase === 'idle' && (
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Step 1 Card */}
              <div className="rounded-2xl border border-border/80 bg-background/50 p-4.5 flex flex-col justify-between space-y-3 hover:border-primary/40 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="size-7 rounded-xl bg-primary/10 text-primary font-bold text-xs flex items-center justify-center">
                    1
                  </span>
                  <Radio className="size-4 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-foreground">1. Ultrasonic Approach</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Student walks up within 15cm of the HC-SR04 ultrasonic sensor. ESP32 triggers the station.
                  </p>
                </div>
                <div className="text-[11px] font-mono text-muted-foreground pt-1 border-t border-border/50">
                  ESP32 → POST /trigger
                </div>
              </div>

              {/* Step 2 Card */}
              <div className="rounded-2xl border border-border/80 bg-background/50 p-4.5 flex flex-col justify-between space-y-3 hover:border-amber-500/40 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="size-7 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold text-xs flex items-center justify-center">
                    2
                  </span>
                  <QrCode className="size-4 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-foreground">2. Scan ID Card QR</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Student presents ID card. Camera scans the QR code to identify student credentials.
                  </p>
                </div>
                <div className="text-[11px] font-mono text-muted-foreground pt-1 border-t border-border/50">
                  ESP32 LCD: Scan ID QR
                </div>
              </div>

              {/* Step 3 Card */}
              <div className="rounded-2xl border border-border/80 bg-background/50 p-4.5 flex flex-col justify-between space-y-3 hover:border-sky-500/40 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="size-7 rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-400 font-bold text-xs flex items-center justify-center">
                    3
                  </span>
                  <Eye className="size-4 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-foreground">3. Blink & Face Match</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Student blinks at camera. ArcFace 512-d embeddings verify identity and log attendance.
                  </p>
                </div>
                <div className="text-[11px] font-mono text-muted-foreground pt-1 border-t border-border/50">
                  ESP32 LCD: Present / Beep
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ACTIVE CAPTURE VIEW: Camera Viewport with Clear Step Guidance */}
        {isCapturing && (
          <div className="p-6 space-y-4">
            {/* Viewport Frame */}
            <div className="relative aspect-video max-w-2xl mx-auto rounded-2xl overflow-hidden border border-border/80 bg-black shadow-2xl">
              <video
                ref={(el) => {
                  videoRef.current = el
                  if (el && streamRef.current && el.srcObject !== streamRef.current) {
                    el.srcObject = streamRef.current
                    el.play().catch(() => {})
                  }
                }}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover scale-x-[-1]"
              />

              {/* Overlay: Starting Camera */}
              {phase === 'starting-camera' && (
                <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center gap-3 text-white text-center p-6 animate-in fade-in">
                  <div className="size-12 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  <p className="text-sm font-bold">Initializing High-Definition Webcam...</p>
                  <p className="text-xs text-white/60">Position yourself in front of the camera</p>
                </div>
              )}

              {/* Overlay: Step 1 - Scan ID Card QR Code */}
              {(phase === 'scan_prompt' || phase === 'scanning_qr') && (
                <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex flex-col justify-between p-5 text-white text-center animate-in fade-in">
                  {/* Top Step Banner */}
                  <div className="flex justify-center">
                    <div className="inline-flex items-center gap-2 bg-emerald-500/95 text-black px-4 py-1.5 rounded-full text-xs font-bold shadow-xl">
                      <QrCode className="size-4" />
                      Step 1 of 3: Scan Student ID Card QR Code
                    </div>
                  </div>

                  {/* Center ID Card Reticle */}
                  <div className="relative flex-1 flex flex-col items-center justify-center py-2">
                    <div className="relative w-52 h-36 rounded-2xl border-2 border-dashed border-emerald-400/90 bg-emerald-500/10 flex flex-col items-center justify-center gap-2 shadow-2xl overflow-hidden">
                      {/* Animated Laser Scanline */}
                      <div className="absolute inset-x-0 h-0.5 bg-emerald-400 shadow-[0_0_12px_#34d399] animate-pulse" />
                      
                      <QrCode className="size-10 text-emerald-300 animate-pulse" />
                      <span className="text-[11px] font-extrabold uppercase tracking-widest text-emerald-300">
                        {phase === 'scanning_qr' ? 'Scanning QR...' : 'Position ID QR Here'}
                      </span>
                    </div>

                    {/* Countdown Badge */}
                    {phase === 'scan_prompt' && (
                      <div className="absolute size-14 rounded-full bg-emerald-500 text-black flex items-center justify-center font-black text-2xl shadow-xl shadow-emerald-500/50 animate-bounce">
                        {countdown}
                      </div>
                    )}
                  </div>

                  {/* Bottom Instruction Bar */}
                  <div className="max-w-md mx-auto">
                    <p className="text-xs text-emerald-200 font-semibold bg-black/70 backdrop-blur-md px-4 py-2 rounded-xl border border-emerald-500/30">
                      {phase === 'scanning_qr'
                        ? 'Reading QR code from ID badge... Please hold steady'
                        : 'Hold your student ID card steady in front of the camera'}
                    </p>
                  </div>
                </div>
              )}

              {/* Overlay: Step 1 Confirmation (QR Recognized) */}
              {phase === 'qr_success' && (
                <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center gap-3 text-white text-center p-6 animate-in zoom-in-95 duration-200">
                  <div className="size-14 rounded-full bg-emerald-500 text-black flex items-center justify-center shadow-2xl shadow-emerald-500/50 animate-pulse">
                    <CheckCircle2 className="size-8" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-lg font-black text-emerald-300">ID Code Recognized: {detectedCode}</p>
                    <p className="text-xs text-white/80">Get ready to look at the camera for face verification...</p>
                  </div>
                </div>
              )}

              {/* Overlay: Step 2 - Look at Camera & Blink Now */}
              {(phase === 'blink_prompt' || phase === 'capturing_face') && (
                <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex flex-col justify-between p-5 text-white text-center animate-in fade-in">
                  {/* Top Step Banner */}
                  <div className="flex justify-center">
                    <div className="inline-flex items-center gap-2 bg-sky-500/95 text-white px-4 py-1.5 rounded-full text-xs font-bold shadow-xl">
                      <Eye className="size-4" />
                      Step 2 of 3: Look at Camera & Blink Now
                    </div>
                  </div>

                  {/* Center Biometric Face Reticle */}
                  <div className="relative flex-1 flex flex-col items-center justify-center py-2">
                    <div className="relative w-44 h-56 rounded-[50%] border-2 border-dashed border-sky-400/90 bg-sky-500/10 flex flex-col items-center justify-center gap-2 shadow-2xl">
                      <Eye className="size-10 text-sky-300 animate-pulse" />
                      <span className="text-[11px] font-extrabold uppercase tracking-widest text-sky-300">
                        Blink Naturally
                      </span>
                      <span className="text-[11px] font-mono font-bold text-sky-200 bg-sky-950/70 px-2.5 py-0.5 rounded-full border border-sky-400/30">
                        {blinkProgress}%
                      </span>
                    </div>
                  </div>

                  {/* Bottom Instruction & Progress Bar */}
                  <div className="max-w-md w-full mx-auto space-y-2">
                    <div className="w-full bg-black/60 rounded-full h-2.5 overflow-hidden border border-sky-500/30">
                      <div
                        className="bg-sky-400 h-full transition-all duration-100 ease-out"
                        style={{ width: `${blinkProgress}%` }}
                      />
                    </div>
                    <p className="text-xs text-sky-200 font-semibold bg-black/70 backdrop-blur-md px-4 py-2 rounded-xl border border-sky-500/30">
                      Recording face burst — please blink naturally now
                    </p>
                  </div>
                </div>
              )}

              {/* Overlay: Step 3 - Processing & Verifying */}
              {phase === 'processing' && (
                <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center gap-3 text-white text-center p-6 animate-in fade-in">
                  <RefreshCw className="size-12 text-amber-400 animate-spin" />
                  <div className="space-y-1 max-w-sm">
                    <p className="text-base font-bold text-white">Verifying Biometric Identity...</p>
                    <p className="text-xs text-white/70">
                      Extracting ArcFace 512-d embeddings & validating against student database
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Transmitting result to ESP32 LCD
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* OUTCOME VIEW: Attendance Verified Success Card */}
        {phase === 'result' && result && (
          <div className="p-6 animate-in zoom-in-95 duration-200">
            <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-6 text-emerald-950 dark:text-emerald-200 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="size-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30">
                    <CheckCircle2 className="size-7" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-emerald-700 dark:text-emerald-300">
                      Attendance Verified & Present!
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Cross-validation matched ID QR code with real-time biometric face vector.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground bg-background/60 px-3 py-1.5 rounded-xl border border-border">
                    Auto-ready in {autoResetSeconds}s
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPhase('idle')
                      setTriggerStatus({ active: false, triggered_at: null })
                      setResult(null)
                    }}
                    className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Ready for Next Student
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="rounded-xl bg-background/50 p-3 border border-border/60">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">
                    Student Name
                  </span>
                  <span className="text-sm font-bold text-foreground mt-0.5 block">{result.name}</span>
                </div>

                <div className="rounded-xl bg-background/50 p-3 border border-border/60">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">
                    Student Code
                  </span>
                  <span className="text-sm font-mono font-bold text-foreground mt-0.5 block">{result.code}</span>
                </div>

                <div className="rounded-xl bg-background/50 p-3 border border-border/60">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">
                    Cosine Match Score
                  </span>
                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 block">
                    {(result.similarity * 100).toFixed(1)}% match
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground pt-1">
                Outcome dispatched to ESP32 LCD & buzzer: &ldquo;{result.name} Present&rdquo;.
              </p>
            </div>
          </div>
        )}

        {/* ERROR VIEW: Verification Incomplete or Failure */}
        {phase === 'error' && (
          <div className="p-6 animate-in zoom-in-95 duration-200">
            <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-6 text-rose-950 dark:text-rose-200 space-y-4">
              <div className="flex items-start gap-3.5">
                <div className="size-12 rounded-2xl bg-rose-500 text-white flex items-center justify-center shrink-0 shadow-lg shadow-rose-500/30">
                  <XCircle className="size-7" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-rose-700 dark:text-rose-300">
                    Verification Incomplete
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {errorMessage || 'Unable to cross-validate student identity. Please ensure ID card is held steady and your face is well-lit.'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-rose-500/20">
                <button
                  type="button"
                  onClick={() => runAttendanceCycle()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 text-xs font-semibold transition-colors cursor-pointer shadow-sm"
                >
                  <RefreshCw className="size-3.5" />
                  Retry Scan Now
                </button>
                <button
                  type="button"
                  onClick={handleCancelCycle}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background hover:bg-muted px-4 py-2 text-xs font-semibold text-foreground transition-colors cursor-pointer"
                >
                  Cancel / Return to Idle
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* =========================================================================
   2. LIVE ATTENDANCE SECTION (Hardware Station + Real-time Logs Feed)
   ========================================================================= */
function LiveAttendanceSection({
  recentRecords,
  onRecordAdded,
  onError,
  onSuccess,
}: {
  recentRecords: AttendanceRecord[]
  onRecordAdded: (r: AttendanceRecord) => void
  onError: (msg: string) => void
  onSuccess?: (msg: string) => void
}) {
  const [activeClass, setActiveClass] = useState<ClassSession | null>(null)

  useEffect(() => {
    let mounted = true
    const checkActive = async () => {
      try {
        const sess = await api.activeSession()
        if (mounted) setActiveClass(sess)
      } catch {}
    }
    checkActive()
    const timer = setInterval(checkActive, 8000)
    return () => {
      mounted = false
      clearInterval(timer)
    }
  }, [])

  return (
    <div className="space-y-6">
      {/* Active Scheduled Class Banner */}
      {activeClass && (
        <div className="rounded-2xl border border-sky-500/40 bg-sky-500/10 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm animate-in fade-in">
          <div className="flex items-center gap-3">
            <span className="flex size-3 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold uppercase tracking-wider text-sky-400 bg-sky-950/80 px-2 py-0.5 rounded border border-sky-500/30">
                  Active Lecture
                </span>
                <span className="text-sm font-bold text-foreground">{activeClass.subject_name}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Faculty: <strong className="text-foreground">{activeClass.teacher_name}</strong> ({activeClass.teacher_email}) &bull; Scheduled: {activeClass.start_time} - {activeClass.end_time}
              </p>
            </div>
          </div>
          <div className="text-xs shrink-0 flex items-center gap-2">
            {activeClass.is_within_cutoff ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <Clock className="size-3.5" />
                Cutoff: till {activeClass.cutoff_time} ({activeClass.cutoff_minutes}m window)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                <Clock className="size-3.5" />
                Cutoff Closed ({activeClass.cutoff_time})
              </span>
            )}
          </div>
        </div>
      )}

      {/* Top Banner Explainer */}
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ScanLine className="size-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold">Two-Factor Cross-Validation Station</h2>
            <p className="text-xs text-muted-foreground">
              1. Reads Student Code from QR &bull; 2. Computes Face ArcFace vector &bull; 3. If matched (&ge; 40% confidence), logs attendance to SQLite.
            </p>
          </div>
        </div>
      </div>

      {/* Unified Live Attendance Station */}
      <LiveAttendanceStation
        onRecordAdded={onRecordAdded}
        onError={onError}
        onSuccess={onSuccess || (() => {})}
      />

      {/* Real-time Attendance Stream Logs Table */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <HistoryIcon className="size-4 text-primary" />
            <h3 className="font-bold text-base">Live Attendance Stream</h3>
          </div>
          <span className="text-xs text-muted-foreground">Auto-updates on successful scans</span>
        </div>

        {recentRecords.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <ClipboardList className="size-8 mx-auto mb-2 opacity-30" />
            No scans recorded yet. Stand in front of the ESP32 ultrasonic sensor to mark attendance.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/30 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">Student</th>
                  <th className="px-4 py-2.5">Code</th>
                  <th className="px-4 py-2.5">Similarity</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentRecords.slice(0, 8).map((r, i) => (
                  <tr key={`${r.code}-${r.timestamp}-${i}`} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-semibold flex items-center gap-2">
                      <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-xs">
                        {getInitials(r.name)}
                      </div>
                      {r.name}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.code}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      {(r.similarity * 100).toFixed(1)}%
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                        <CheckCircle2 className="size-3 text-emerald-500" /> Present
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-muted-foreground font-mono">
                      {formatTime(r.timestamp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}


/* =========================================================================
   3. ENROLLMENT SECTION (Multiple Photos per Student)
   ========================================================================= */
function EnrollmentSection({
  onSuccess,
  onError,
  existingStudents = [],
}: {
  onSuccess: (msg: string) => void
  onError: (msg: string) => void
  existingStudents?: Student[]
}) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [enrolling, setEnrolling] = useState(false)
  const [images, setImages] = useState<{ file: File; preview: string }[]>([])
  const [cameraActive, setCameraActive] = useState(false)

  const matchedStudent = useMemo(() => {
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) return null
    return existingStudents.find((s) => s.code.toUpperCase() === trimmed) || null
  }, [code, existingStudents])

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
      setCameraActive(true)
    } catch (err: any) {
      onError('Unable to open camera: ' + err.message)
    }
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraActive(false)
  }

  useEffect(() => {
    return () => stopCamera()
  }, [])

  const capturePhoto = () => {
    if (!videoRef.current) return
    const video = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `snap_${Date.now()}.jpg`, { type: 'image/jpeg' })
        setImages((prev) => [...prev, { file, preview: URL.createObjectURL(blob) }])
      }
    }, 'image/jpeg', 0.95)
  }

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const newImgs = files.map((f) => ({ file: f, preview: URL.createObjectURL(f) }))
    setImages((prev) => [...prev, ...newImgs])
  }

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index))
  }

  const handleEnrollAll = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !code.trim()) {
      onError('Please fill in both Student Name and Code/ID.')
      return
    }
    if (images.length === 0) {
      onError('Please capture or upload at least 1 face image.')
      return
    }

    setEnrolling(true)
    let enrolledCount = 0
    const errors: string[] = []

    for (let i = 0; i < images.length; i++) {
      try {
        await api.enroll(name.trim(), code.trim().toUpperCase(), images[i].file)
        enrolledCount++
      } catch (err: any) {
        errors.push(`Image #${i + 1}: ${err.message}`)
      }
    }

    setEnrolling(false)
    if (enrolledCount > 0) {
      onSuccess(`Successfully enrolled ${enrolledCount} face image(s) for ${name.trim()} (${code.trim().toUpperCase()})`)
      setImages([])
      setName('')
      setCode('')
    }
    if (errors.length > 0) {
      onError(`Failed for some images: ${errors.join(', ')}`)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div>
          <h2 className="text-lg font-bold">Enroll Student Face Vector</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Capture multiple angles/expressions (3 to 8 recommended) for higher accuracy with the InsightFace ArcFace model.
          </p>
        </div>

        <form onSubmit={handleEnrollAll} className="mt-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Full Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. John Doe"
                className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Student ID / Code
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. CS-101 or 1RL23EC043"
                className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm font-mono uppercase outline-none focus:ring-2 focus:ring-primary"
                required
              />
              {matchedStudent && (
                <div className="mt-2 rounded-xl border border-primary/20 bg-primary/5 p-2.5 text-xs flex items-center justify-between">
                  <span className="text-primary font-medium">
                    Existing student found: <b>{matchedStudent.name}</b> ({matchedStudent.image_count} vectors saved)
                  </span>
                  {!name && (
                    <button
                      type="button"
                      onClick={() => setName(matchedStudent.name)}
                      className="text-xs font-semibold text-primary underline ml-2"
                    >
                      Use Name
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Camera Capture Area */}
          <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Capture Face Photos
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={cameraActive ? stopCamera : startCamera}
                  className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted"
                >
                  {cameraActive ? 'Close Camera' : 'Open Camera'}
                </button>
                <label className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted cursor-pointer inline-flex items-center gap-1">
                  <Upload className="size-3" /> Upload Files
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleFilePick}
                  />
                </label>
              </div>
            </div>

            {cameraActive && (
              <div className="flex flex-col sm:flex-row gap-4 items-center">
                <div className="relative aspect-video w-full sm:w-80 rounded-xl bg-black overflow-hidden border">
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover mirror" />
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={capturePhoto}
                    className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-xs font-semibold shadow hover:bg-primary/90 flex items-center gap-1.5"
                  >
                    <Camera className="size-4" /> Snap Photo
                  </button>
                  <p className="text-[11px] text-muted-foreground">Take 4-6 shots turning slightly left/right.</p>
                </div>
              </div>
            )}

            {/* Thumbnails */}
            {images.length > 0 ? (
              <div>
                <p className="text-xs text-muted-foreground mb-2">
                  Selected Photos ({images.length}) — will generate {images.length} 512-d embeddings
                </p>
                <div className="flex flex-wrap gap-3">
                  {images.map((img, i) => (
                    <div key={i} className="relative size-20 rounded-xl border border-border overflow-hidden group">
                      <img src={img.preview} alt="snap" className="size-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeImage(i)}
                        className="absolute top-1 right-1 size-5 rounded-full bg-rose-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-muted-foreground">
                No images captured yet. Open camera or upload student photos above.
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={enrolling || images.length === 0}
            className="w-full rounded-xl bg-primary text-primary-foreground py-3 text-sm font-semibold shadow hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {enrolling ? (
              <>
                <RefreshCw className="size-4 animate-spin" /> Enrolling Face Vectors in ChromaDB...
              </>
            ) : matchedStudent ? (
              <>
                <UserCheck className="size-4" /> Add {images.length} Face Vector{images.length === 1 ? '' : 's'} to {matchedStudent.name}
              </>
            ) : (
              <>
                <UserCheck className="size-4" /> Enroll Student ({images.length} images)
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}

/* =========================================================================
   3.5 ADD FACE VECTORS MODAL (Direct from Student Registry)
   ========================================================================= */
function AddFaceModal({
  student,
  onClose,
  onSuccess,
  onError,
}: {
  student: Student
  onClose: () => void
  onSuccess: (msg: string) => void
  onError: (msg: string) => void
}) {
  const [images, setImages] = useState<{ file: File; preview: string }[]>([])
  const [uploading, setUploading] = useState(false)
  const [progressMsg, setProgressMsg] = useState('')
  const [cameraActive, setCameraActive] = useState(false)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
      setCameraActive(true)
    } catch (err: any) {
      onError('Unable to open camera: ' + (err.message || String(err)))
    }
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraActive(false)
  }

  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [])

  const capturePhoto = () => {
    if (!videoRef.current) return
    const video = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `snap_${student.code}_${Date.now()}.jpg`, { type: 'image/jpeg' })
        setImages((prev) => [...prev, { file, preview: URL.createObjectURL(blob) }])
      }
    }, 'image/jpeg', 0.95)
  }

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const newImgs = files.map((f) => ({ file: f, preview: URL.createObjectURL(f) }))
    setImages((prev) => [...prev, ...newImgs])
  }

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    if (images.length === 0) {
      onError('Please snap or upload at least 1 photo to add.')
      return
    }

    setUploading(true)
    let addedCount = 0
    const errors: string[] = []

    for (let i = 0; i < images.length; i++) {
      setProgressMsg(`Processing photo ${i + 1} of ${images.length}...`)
      try {
        await api.enroll(student.name, student.code, images[i].file)
        addedCount++
      } catch (err: any) {
        errors.push(`Photo #${i + 1}: ${err.message || 'Face detection failed'}`)
      }
    }

    setUploading(false)
    setProgressMsg('')

    if (addedCount > 0) {
      stopCamera()
      onSuccess(`Successfully added ${addedCount} face vector(s) for ${student.name} (${student.code}). Total now: ${student.image_count + addedCount}`)
    }
    if (errors.length > 0) {
      onError(`Failed for some images: ${errors.join('; ')}`)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-card border border-border rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 my-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Camera className="size-5 text-primary" />
              Add Face Vectors
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Append additional facial angles or lighting conditions to boost recognition accuracy.
            </p>
          </div>
          <button
            onClick={() => {
              stopCamera()
              onClose()
            }}
            className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Student Target Banner */}
        <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 p-3.5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold text-sm">
              {getInitials(student.name)}
            </div>
            <div>
              <p className="text-sm font-semibold">{student.name}</p>
              <p className="text-xs font-mono text-muted-foreground">{student.code}</p>
            </div>
          </div>
          <span className="text-xs font-medium bg-background border border-border px-3 py-1 rounded-full text-foreground shadow-xs">
            {student.image_count} existing vectors
          </span>
        </div>

        {/* Action Toolbar */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Capture or Upload
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={cameraActive ? stopCamera : startCamera}
                className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted"
              >
                {cameraActive ? 'Close Camera' : 'Open Camera'}
              </button>
              <label className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted cursor-pointer inline-flex items-center gap-1.5">
                <Upload className="size-3" /> Upload Files
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleFilePick}
                />
              </label>
            </div>
          </div>

          {/* Camera Stream */}
          {cameraActive && (
            <div className="rounded-xl border border-border bg-black/60 p-3 flex flex-col items-center gap-3">
              <div className="relative aspect-video w-full rounded-lg bg-black overflow-hidden border border-border/50">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover mirror" />
              </div>
              <button
                type="button"
                onClick={capturePhoto}
                className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-xs font-semibold shadow hover:bg-primary/90 flex items-center gap-2"
              >
                <Camera className="size-4" /> Snap Photo
              </button>
            </div>
          )}

          {/* Pending Photos List */}
          {images.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>New Photos to Add ({images.length})</span>
                <button
                  type="button"
                  onClick={() => setImages([])}
                  className="text-xs text-rose-500 hover:underline"
                >
                  Clear all
                </button>
              </div>
              <div className="flex flex-wrap gap-2.5 max-h-40 overflow-y-auto p-2 border border-border/50 rounded-xl bg-muted/20">
                {images.map((img, i) => (
                  <div key={i} className="relative size-16 rounded-lg border border-border overflow-hidden group">
                    <img src={img.preview} alt={`new-${i}`} className="size-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      className="absolute top-1 right-1 size-5 rounded-full bg-rose-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
              No new photos selected yet. Open camera to snap shots or click Upload Files.
            </div>
          )}
        </div>

        {/* Footer Buttons */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
          <button
            type="button"
            onClick={() => {
              stopCamera()
              onClose()
            }}
            disabled={uploading}
            className="px-4 py-2 text-xs font-semibold rounded-xl border border-border hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={uploading || images.length === 0}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2 shadow"
          >
            {uploading ? (
              <>
                <RefreshCw className="size-3.5 animate-spin" />
                <span>{progressMsg || 'Saving Vectors...'}</span>
              </>
            ) : (
              <>
                <UserCheck className="size-3.5" />
                <span>Save {images.length > 0 ? `${images.length} Face Vector${images.length > 1 ? 's' : ''}` : 'Vectors'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

/* =========================================================================
   4. STUDENTS DIRECTORY
   ========================================================================= */
function StudentsSection({
  students,
  onRefresh,
  onDelete,
  onEnrollClick,
  onSuccess,
  onError,
}: {
  students: Student[]
  onRefresh: () => void
  onDelete: (code: string) => void
  onEnrollClick: () => void
  onSuccess?: (msg: string) => void
  onError?: (err: string) => void
}) {
  const [query, setQuery] = useState('')
  const [targetStudentForAdd, setTargetStudentForAdd] = useState<Student | null>(null)

  const filtered = useMemo(
    () =>
      students.filter(
        (s) =>
          s.name.toLowerCase().includes(query.toLowerCase()) ||
          s.code.toLowerCase().includes(query.toLowerCase())
      ),
    [students, query]
  )

  return (
    <div className="space-y-6">
      {targetStudentForAdd && (
        <AddFaceModal
          student={targetStudentForAdd}
          onClose={() => setTargetStudentForAdd(null)}
          onSuccess={(msg) => {
            setTargetStudentForAdd(null)
            onRefresh()
            onSuccess?.(msg)
          }}
          onError={(err) => {
            onError?.(err)
          }}
        />
      )}

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">Enrolled Student Registry</h2>
          <p className="text-xs text-muted-foreground">
            Students currently registered with vector face embeddings in ChromaDB
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onEnrollClick}
            className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-xs font-semibold shadow hover:bg-primary/90 flex items-center gap-1.5"
          >
            <Plus className="size-3.5" /> Enroll Student
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by student name or code..."
          className="w-full rounded-xl border border-input bg-card pl-9 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            <Users className="size-8 mx-auto mb-2 opacity-30" />
            No enrolled students found.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((s) => (
              <div key={s.code} className="flex items-center justify-between p-4 hover:bg-muted/40 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold text-sm">
                    {getInitials(s.name)}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{s.name}</p>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{s.code}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 sm:gap-3">
                  <span className="text-xs font-medium bg-muted px-2.5 py-1 rounded-full text-muted-foreground whitespace-nowrap">
                    {s.image_count} face vector{s.image_count === 1 ? '' : 's'}
                  </span>

                  <button
                    onClick={() => setTargetStudentForAdd(s)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 text-xs font-semibold transition-colors shadow-xs"
                    title={`Add more face vectors for ${s.name}`}
                  >
                    <Camera className="size-3.5" />
                    <span>+ Add Photos</span>
                  </button>

                  <button
                    onClick={() => {
                      if (confirm(`Are you sure you want to delete ${s.name} (${s.code}) and all associated face embeddings?`)) {
                        onDelete(s.code)
                      }
                    }}
                    className="p-2 text-muted-foreground hover:text-rose-600 rounded-lg hover:bg-rose-500/10 transition-colors"
                    title="Delete student"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* =========================================================================
   5. TESTER SECTION: Complete Auto-Match (QR + Face -> Live Attendance)
   ========================================================================= */
function TesterSection({
  onAttendanceMarked,
  onError,
  onSuccess,
}: {
  onAttendanceMarked: (r: AttendanceRecord) => void
  onError: (msg: string) => void
  onSuccess: (msg: string) => void
}) {
  // Dual-upload tester
  const [dualQrFile, setDualQrFile] = useState<File | null>(null)
  const [dualFaceFile, setDualFaceFile] = useState<File | null>(null)
  const [dualProcessing, setDualProcessing] = useState(false)
  const [dualResult, setDualResult] = useState<{
    decodedQr?: string
    faceMatch?: InferResult
    attendanceResult?: MarkAttendanceResult
  } | null>(null)

  // Single diagnostics
  const [inferResult, setInferResult] = useState<InferResult | null>(null)
  const [qrResult, setQrResult] = useState<QRDecodeResult | null>(null)
  const [inferLoading, setInferLoading] = useState(false)
  const [qrLoading, setQrLoading] = useState(false)

  // Complete Cross-Validation Flow
  const handleCompleteMatch = async () => {
    if (!dualQrFile || !dualFaceFile) {
      onError('Please upload both the QR Code Image and the Student Face Image.')
      return
    }

    setDualProcessing(true)
    setDualResult(null)

    try {
      // Step 1: Decode QR Code
      const qrRes = await api.qrDecode(dualQrFile)
      const decodedCode = qrRes.data?.trim().toUpperCase()
      if (!decodedCode) {
        throw new Error('Could not detect any QR code in the uploaded QR image.')
      }

      // Step 2: Test Face Recognition (ArcFace)
      const faceRes = await api.infer(dualFaceFile)

      // Step 3: Trigger Attendance Endpoint to persist to SQLite
      const markRes = await api.markAttendance(decodedCode, dualFaceFile)

      setDualResult({
        decodedQr: decodedCode,
        faceMatch: faceRes,
        attendanceResult: markRes,
      })

      if (markRes.marked && markRes.name && markRes.code) {
        onAttendanceMarked({
          code: markRes.code,
          name: markRes.name,
          similarity: markRes.similarity,
          timestamp: markRes.timestamp || new Date().toISOString(),
        })
      } else {
        onError(`Verification failed: ${markRes.reason || 'QR Code and Face Model prediction did not match.'}`)
      }
    } catch (err: any) {
      onError(err.message || 'Complete matching process failed')
    } finally {
      setDualProcessing(false)
    }
  }

  // Individual Face Inference
  const handleInferFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setInferLoading(true)
    setInferResult(null)
    try {
      const res = await api.infer(file)
      setInferResult(res)
      if (res.match) {
        onSuccess(`Face matched: ${res.name} (${res.code}) with ${(res.similarity * 100).toFixed(1)}% confidence`)
      } else {
        onError('No matching student found in vector DB.')
      }
    } catch (err: any) {
      onError(err.message || 'Inference failed')
    } finally {
      setInferLoading(false)
    }
  }

  // Individual QR Decode
  const handleQRFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setQrLoading(true)
    setQrResult(null)
    try {
      const res = await api.qrDecode(file)
      setQrResult(res)
      onSuccess(`Decoded QR: ${res.data}`)
    } catch (err: any) {
      onError(err.message || 'QR Decode failed')
    } finally {
      setQrLoading(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* 1. Complete End-to-End Pipeline Card */}
      <div className="rounded-2xl border-2 border-primary/40 bg-card p-6 shadow-md space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-xs">
                ★
              </span>
              <h3 className="font-bold text-lg">Complete QR Code + Face Image Match & Verification</h3>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Upload both images simultaneously: decodes QR &rarr; predicts face &rarr; validates match &rarr; <strong>automatically marks attendance in SQLite & Live Attendance!</strong>
            </p>
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          {/* QR Upload */}
          <div className="rounded-xl border border-dashed border-border p-5 bg-muted/20 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <QrCode className="size-4 text-primary" />
                <span className="text-xs font-bold uppercase tracking-wider">1. QR Code / Badge Photo</span>
              </div>
              <p className="text-xs text-muted-foreground mb-4">Image of student's QR code badge or ID.</p>
            </div>

            <label className="block w-full border-2 border-dashed border-border rounded-xl p-4 text-center hover:bg-muted/50 cursor-pointer transition-colors">
              <Upload className="size-6 mx-auto text-muted-foreground mb-1.5" />
              <span className="text-xs font-semibold text-primary">
                {dualQrFile ? dualQrFile.name : 'Select QR Code Image'}
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setDualQrFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>

          {/* Face Image Upload */}
          <div className="rounded-xl border border-dashed border-border p-5 bg-muted/20 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Eye className="size-4 text-primary" />
                <span className="text-xs font-bold uppercase tracking-wider">2. Student Face Photo</span>
              </div>
              <p className="text-xs text-muted-foreground mb-4">Photo of student to compare with ChromaDB vectors.</p>
            </div>

            <label className="block w-full border-2 border-dashed border-border rounded-xl p-4 text-center hover:bg-muted/50 cursor-pointer transition-colors">
              <Upload className="size-6 mx-auto text-muted-foreground mb-1.5" />
              <span className="text-xs font-semibold text-primary">
                {dualFaceFile ? dualFaceFile.name : 'Select Face Image'}
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setDualFaceFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>
        </div>

        <button
          onClick={handleCompleteMatch}
          disabled={dualProcessing || !dualQrFile || !dualFaceFile}
          className="w-full rounded-xl bg-primary text-primary-foreground py-3.5 px-4 font-bold text-sm shadow-md hover:bg-primary/90 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {dualProcessing ? (
            <>
              <RefreshCw className="size-4 animate-spin" /> Running Full QR & Face Verification Pipeline...
            </>
          ) : (
            <>
              <FileCheck2 className="size-5" /> Cross-Validate Both & Mark Attendance
            </>
          )}
        </button>

        {/* Dual Match Step-by-Step Breakdown */}
        {dualResult && (
          <div
            className={`rounded-2xl p-5 border text-xs space-y-4 ${
              dualResult.attendanceResult?.marked
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:text-emerald-200'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-950 dark:text-rose-200'
            }`}
          >
            <div className="flex items-center gap-3">
              {dualResult.attendanceResult?.marked ? (
                <CheckCircle2 className="size-6 text-emerald-500 shrink-0" />
              ) : (
                <XCircle className="size-6 text-rose-500 shrink-0" />
              )}
              <div>
                <p className="text-base font-bold">
                  {dualResult.attendanceResult?.marked
                    ? 'Success! Both Matched & Attendance Logged to DB!'
                    : 'Match Rejected! Attendance Not Marked'}
                </p>
                <p className="text-xs opacity-80 mt-0.5">
                  {dualResult.attendanceResult?.marked
                    ? 'This record is now saved in SQLite and appears in the Live Attendance tab.'
                    : dualResult.attendanceResult?.reason || 'Mismatch between decoded QR and predicted face.'}
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 pt-2 border-t border-current/10">
              <div className="bg-background/80 rounded-xl p-3 border border-border text-foreground">
                <span className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground block">
                  1. QR Decoded Value
                </span>
                <p className="font-mono text-sm font-bold mt-1 text-primary">{dualResult.decodedQr}</p>
              </div>

              <div className="bg-background/80 rounded-xl p-3 border border-border text-foreground">
                <span className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground block">
                  2. Model Face Prediction
                </span>
                <p className="font-mono text-sm font-bold mt-1 text-primary">
                  {dualResult.faceMatch?.code || 'None'}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">{dualResult.faceMatch?.name || 'No match'}</p>
              </div>

              <div className="bg-background/80 rounded-xl p-3 border border-border text-foreground">
                <span className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground block">
                  3. Similarity Score
                </span>
                <p className="text-sm font-bold mt-1">
                  {((dualResult.attendanceResult?.similarity || 0) * 100).toFixed(1)}%
                </p>
                <p className="text-[10px] text-muted-foreground">Threshold &ge; 40.0%</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. Diagnostics Section (Individual Testers) */}
      <div>
        <h4 className="text-sm font-bold mb-4 text-muted-foreground uppercase tracking-wider">
          Individual Endpoint Diagnostics
        </h4>
        <div className="grid gap-6 sm:grid-cols-2">
          {/* Face Inference Tester */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
            <div>
              <h3 className="font-bold text-base flex items-center gap-2">
                <Eye className="size-4 text-primary" /> Face Recognition Tester (/infer)
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Upload face image to see what code/name ArcFace and ChromaDB resolve it to.
              </p>
            </div>

            <label className="block w-full border-2 border-dashed border-border rounded-xl p-6 text-center hover:bg-muted/40 cursor-pointer transition-colors">
              <Upload className="size-8 mx-auto text-muted-foreground mb-2" />
              <span className="text-xs font-semibold text-primary">Upload Face Image</span>
              <p className="text-[11px] text-muted-foreground mt-1">JPEG, PNG</p>
              <input type="file" accept="image/*" className="hidden" onChange={handleInferFile} />
            </label>

            {inferLoading && (
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-3">
                <RefreshCw className="size-4 animate-spin text-primary" /> Running ArcFace inference...
              </div>
            )}

            {inferResult && (
              <div
                className={`rounded-xl p-4 border text-xs space-y-1.5 ${
                  inferResult.match
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:text-emerald-200'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-950 dark:text-amber-200'
                }`}
              >
                <p className="font-bold text-sm">{inferResult.match ? 'Student Identified' : 'No Match Found'}</p>
                {inferResult.match && (
                  <>
                    <p>
                      <span className="font-semibold">Name:</span> {inferResult.name}
                    </p>
                    <p>
                      <span className="font-semibold">Code:</span> {inferResult.code}
                    </p>
                  </>
                )}
                <p>
                  <span className="font-semibold">Cosine Similarity:</span> {(inferResult.similarity * 100).toFixed(2)}%
                </p>
              </div>
            )}
          </div>

          {/* QR Decoder Tester */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
            <div>
              <h3 className="font-bold text-base flex items-center gap-2">
                <QrCode className="size-4 text-primary" /> QR Detector Tester (/qr-decode)
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Upload an image of an ID badge or QR code to test OpenCV decoding.
              </p>
            </div>

            <label className="block w-full border-2 border-dashed border-border rounded-xl p-6 text-center hover:bg-muted/40 cursor-pointer transition-colors">
              <Upload className="size-8 mx-auto text-muted-foreground mb-2" />
              <span className="text-xs font-semibold text-primary">Upload QR Code Photo</span>
              <p className="text-[11px] text-muted-foreground mt-1">JPEG, PNG</p>
              <input type="file" accept="image/*" className="hidden" onChange={handleQRFile} />
            </label>

            {qrLoading && (
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-3">
                <RefreshCw className="size-4 animate-spin text-primary" /> Detecting QR Code...
              </div>
            )}

            {qrResult && (
              <div className="rounded-xl p-4 border bg-card text-xs space-y-1.5 border-border">
                <p className="font-bold text-sm text-foreground">Decoded QR Content</p>
                <p className="font-mono bg-muted p-2 rounded text-foreground font-semibold break-all">
                  {qrResult.data}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* =========================================================================
   6. HISTORY SECTION
   ========================================================================= */
function HistorySection({ records }: { records: AttendanceRecord[] }) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(
    () =>
      records.filter(
        (r) =>
          r.name.toLowerCase().includes(query.toLowerCase()) ||
          r.code.toLowerCase().includes(query.toLowerCase())
      ),
    [records, query]
  )

  const downloadCSV = () => {
    const headers = ['ID', 'Student Code', 'Student Name', 'Similarity', 'Timestamp']
    const rows = records.map((r) => [r.id || '', r.code, `"${r.name}"`, r.similarity, r.timestamp])
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `attendance_export_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">Attendance History Logs</h2>
          <p className="text-xs text-muted-foreground">Historical records stored in SQLite database</p>
        </div>
        <button
          onClick={downloadCSV}
          disabled={records.length === 0}
          className="rounded-xl border border-border bg-card px-4 py-2 text-xs font-semibold hover:bg-muted transition-colors disabled:opacity-50"
        >
          Export CSV
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter attendance history by student or code..."
          className="w-full rounded-xl border border-input bg-card pl-9 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            <ClipboardList className="size-8 mx-auto mb-2 opacity-30" />
            No attendance records found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Student</th>
                  <th className="px-5 py-3">Code / ID</th>
                  <th className="px-5 py-3">Match Confidence</th>
                  <th className="px-5 py-3 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((r, i) => (
                  <tr key={r.id || i} className="hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3.5 font-medium flex items-center gap-2.5">
                      <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-xs">
                        {getInitials(r.name)}
                      </div>
                      {r.name}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs text-muted-foreground">{r.code}</td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        {(r.similarity * 100).toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right text-xs text-muted-foreground">
                      {formatTime(r.timestamp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
