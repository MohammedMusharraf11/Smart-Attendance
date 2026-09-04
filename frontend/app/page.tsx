'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  api,
  type AttendanceRecord,
  type Student,
  type MarkAttendanceResult,
  type InferResult,
  type QRDecodeResult,
} from '@/lib/api'
import {
  AlertCircle,
  ArrowRight,
  Camera,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Eye,
  FileCheck2,
  GraduationCap,
  HelpCircle,
  History as HistoryIcon,
  Info,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  QrCode,
  Radio,
  RefreshCw,
  ScanLine,
  Search,
  Sparkles,
  Trash2,
  Upload,
  UserCheck,
  Users,
  Video,
  VideoOff,
  X,
  XCircle,
} from 'lucide-react'

type Section = 'overview' | 'live-attendance' | 'enroll' | 'students' | 'tester' | 'history'

const nav = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'live-attendance', label: 'Live Attendance', icon: Radio },
  { id: 'enroll', label: 'Student Enrollment', icon: UserCheck },
  { id: 'students', label: 'Enrolled Database', icon: Users },
  { id: 'tester', label: 'Model & QR Tester', icon: Sparkles },
  { id: 'history', label: 'Logs & History', icon: ClipboardList },
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
            />
          )}

          {section === 'enroll' && (
            <EnrollmentSection
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
   2. LIVE ATTENDANCE STATION (Camera + QR + Face Verification + Real-time Feed)
   ========================================================================= */
function LiveAttendanceSection({
  recentRecords,
  onRecordAdded,
  onError,
}: {
  recentRecords: AttendanceRecord[]
  onRecordAdded: (r: AttendanceRecord) => void
  onError: (msg: string) => void
}) {
  const [cameraActive, setCameraActive] = useState(false)
  const [qrCodeInput, setQrCodeInput] = useState('')
  const [qrImageFile, setQrImageFile] = useState<File | null>(null)
  const [qrDecoding, setQrDecoding] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [lastResult, setLastResult] = useState<MarkAttendanceResult | null>(null)
  const [faceImageFile, setFaceImageFile] = useState<File | null>(null)
  const [facePreview, setFacePreview] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Start Camera
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
      onError('Unable to access webcam: ' + (err.message || 'Permission denied'))
    }
  }

  // Stop Camera
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setCameraActive(false)
  }

  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [])

  // Capture frame as Blob
  const captureFrame = async (): Promise<Blob | null> => {
    if (!videoRef.current) return null
    const video = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    setFacePreview(canvas.toDataURL('image/jpeg'))

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.95)
    })
  }

  // Handle uploaded QR image and auto-decode
  const handleQRUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setQrImageFile(file)
    setQrDecoding(true)
    try {
      const res = await api.qrDecode(file)
      if (res.data) {
        setQrCodeInput(res.data.trim().toUpperCase())
      }
    } catch (err: any) {
      onError('QR Code Decode failed: ' + (err.message || 'No QR code found in photo'))
    } finally {
      setQrDecoding(false)
    }
  }

  // Handle uploaded face image
  const handleFaceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFaceImageFile(file)
    setFacePreview(URL.createObjectURL(file))
  }

  // Action: Mark Attendance
  const handleVerify = async () => {
    let codeToVerify = qrCodeInput.trim()

    // If QR code isn't typed yet, but user uploaded a QR file, decode it first
    if (!codeToVerify && qrImageFile) {
      setQrDecoding(true)
      try {
        const decoded = await api.qrDecode(qrImageFile)
        codeToVerify = decoded.data.trim().toUpperCase()
        setQrCodeInput(codeToVerify)
      } catch (err: any) {
        onError('Could not extract QR code: ' + err.message)
        setQrDecoding(false)
        return
      } finally {
        setQrDecoding(false)
      }
    }

    if (!codeToVerify) {
      onError('Please provide a Student QR Code (type ID, scan QR code image, or upload QR).')
      return
    }

    setProcessing(true)
    setLastResult(null)

    try {
      let faceBlob: Blob | File | undefined = faceImageFile || undefined
      if (!faceBlob && cameraActive) {
        faceBlob = (await captureFrame()) || undefined
      }

      if (!faceBlob) {
        throw new Error('Please start the camera or upload a face image to verify.')
      }

      const res = await api.markAttendance(codeToVerify, faceBlob)
      setLastResult(res)

      if (res.marked && res.name && res.code) {
        onRecordAdded({
          code: res.code,
          name: res.name,
          similarity: res.similarity,
          timestamp: res.timestamp || new Date().toISOString(),
        })
      }
    } catch (e: any) {
      onError(e.message || 'Failed to verify attendance')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Banner / Explainer */}
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ScanLine className="size-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold">Two-Factor Cross-Validation Station</h2>
            <p className="text-xs text-muted-foreground">
              1. Reads Student Code from QR or ID tag &bull; 2. Computes Face ArcFace vector &bull; 3. If matched (&ge; 40% cosine confidence), logs attendance to SQLite.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: Video & Face Capture */}
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Camera className="size-4 text-primary" />
                <h3 className="font-bold text-sm">Step 1: Face Capture</h3>
              </div>
              <button
                onClick={cameraActive ? stopCamera : startCamera}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  cameraActive
                    ? 'bg-rose-500/10 text-rose-600 hover:bg-rose-500/20'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90'
                }`}
              >
                {cameraActive ? <VideoOff className="size-3.5" /> : <Video className="size-3.5" />}
                {cameraActive ? 'Stop Camera' : 'Start Camera'}
              </button>
            </div>

            {/* Viewport */}
            <div className="relative aspect-video w-full rounded-xl bg-muted/60 border border-border overflow-hidden flex items-center justify-center">
              {cameraActive ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover mirror"
                />
              ) : facePreview ? (
                <img src={facePreview} alt="Captured face" className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center text-center p-6 text-muted-foreground">
                  <Video className="size-10 mb-2 opacity-30" />
                  <p className="text-sm font-medium">Webcam inactive</p>
                  <p className="text-xs mt-1 max-w-xs">
                    Start your camera or upload a student face image below.
                  </p>
                </div>
              )}

              {cameraActive && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="size-48 rounded-2xl border-2 border-dashed border-primary/80 animate-pulse" />
                </div>
              )}
            </div>

            {/* Fallback Face Upload */}
            <div className="mt-4 flex items-center justify-between pt-3 border-t border-border">
              <label className="cursor-pointer inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground font-medium">
                <Upload className="size-3.5" /> Or choose face photo from disk
                <input type="file" accept="image/*" className="hidden" onChange={handleFaceUpload} />
              </label>

              {facePreview && !cameraActive && (
                <button
                  onClick={() => {
                    setFacePreview(null)
                    setFaceImageFile(null)
                  }}
                  className="text-xs text-rose-500 hover:underline"
                >
                  Clear image
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right: QR Code Input & Verify Button */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm flex flex-col gap-4">
            <div>
              <h3 className="font-bold text-base">Step 2: Student QR / ID Code</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Scan/upload student QR code or type student ID code directly.
              </p>
            </div>

            <div className="space-y-3">
              {/* QR Upload helper */}
              <div className="rounded-xl border border-dashed border-border p-3 bg-muted/20">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <QrCode className="size-3.5 text-primary" /> Auto-Decode QR Image
                  </span>
                  <label className="cursor-pointer text-xs font-semibold text-primary hover:underline flex items-center gap-1">
                    <Upload className="size-3" /> Select QR file
                    <input type="file" accept="image/*" className="hidden" onChange={handleQRUpload} />
                  </label>
                </div>
                {qrDecoding && (
                  <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1.5">
                    <RefreshCw className="size-3 animate-spin text-primary" /> Decoding QR via backend OpenCV...
                  </p>
                )}
                {qrImageFile && !qrDecoding && (
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1.5 font-medium truncate">
                    Loaded QR: {qrImageFile.name}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Student Code Value
                </label>
                <div className="relative">
                  <QrCode className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={qrCodeInput}
                    onChange={(e) => setQrCodeInput(e.target.value.toUpperCase())}
                    placeholder="e.g. CS-2041 or 101"
                    className="w-full rounded-xl border border-input bg-background pl-9 pr-3 py-2.5 text-sm font-mono uppercase focus:ring-2 focus:ring-primary outline-none"
                  />
                </div>
              </div>

              <button
                onClick={handleVerify}
                disabled={processing || qrDecoding}
                className="w-full rounded-xl bg-primary text-primary-foreground py-3 px-4 font-semibold text-sm shadow hover:bg-primary/90 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {processing ? (
                  <>
                    <RefreshCw className="size-4 animate-spin" /> Verifying Face & QR...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="size-4" /> Match & Mark Attendance
                  </>
                )}
              </button>
            </div>

            {/* Verification Result Display */}
            {lastResult && (
              <div
                className={`rounded-xl p-4 border transition-all ${
                  lastResult.marked
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:text-emerald-200'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-950 dark:text-rose-200'
                }`}
              >
                <div className="flex items-start gap-3">
                  {lastResult.marked ? (
                    <CheckCircle2 className="size-5 text-emerald-500 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="size-5 text-rose-500 shrink-0 mt-0.5" />
                  )}
                  <div className="text-xs space-y-1">
                    <p className="font-bold text-sm">
                      {lastResult.marked ? 'Attendance Verified & Logged!' : 'Verification Failed'}
                    </p>
                    {lastResult.marked ? (
                      <>
                        <p>
                          <span className="font-semibold">Student:</span> {lastResult.name} ({lastResult.code})
                        </p>
                        <p>
                          <span className="font-semibold">Cosine Confidence:</span>{' '}
                          {(lastResult.similarity * 100).toFixed(1)}% (Threshold &ge; 40%)
                        </p>
                        <p className="text-[11px] opacity-80">{formatTime(lastResult.timestamp)}</p>
                      </>
                    ) : (
                      <>
                        <p>
                          <span className="font-semibold">Reason:</span> {lastResult.reason || 'Mismatch or low confidence'}
                        </p>
                        <p>
                          <span className="font-semibold">QR Code:</span> {lastResult.qr_code || '—'}
                        </p>
                        <p>
                          <span className="font-semibold">Face Vector Matched To:</span>{' '}
                          {lastResult.face_predicted || 'No face match in DB'} ({(lastResult.similarity * 100).toFixed(1)}%)
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Live Stream Attendance Logs Feed */}
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
            No scans recorded yet. Match student face + QR code above to see live updates.
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
                  <tr key={r.id || i} className="hover:bg-muted/30 transition-colors">
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
}: {
  onSuccess: (msg: string) => void
  onError: (msg: string) => void
}) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [enrolling, setEnrolling] = useState(false)
  const [images, setImages] = useState<{ file: File; preview: string }[]>([])
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
                placeholder="e.g. CS-101 or 2024-ECE-042"
                className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm font-mono uppercase outline-none focus:ring-2 focus:ring-primary"
                required
              />
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
   4. STUDENTS DIRECTORY
   ========================================================================= */
function StudentsSection({
  students,
  onRefresh,
  onDelete,
  onEnrollClick,
}: {
  students: Student[]
  onRefresh: () => void
  onDelete: (code: string) => void
  onEnrollClick: () => void
}) {
  const [query, setQuery] = useState('')
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

                <div className="flex items-center gap-4">
                  <span className="text-xs font-medium bg-muted px-2.5 py-1 rounded-full text-muted-foreground">
                    {s.image_count} face vector{s.image_count === 1 ? '' : 's'}
                  </span>
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
