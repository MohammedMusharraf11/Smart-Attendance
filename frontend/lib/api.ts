export type AttendanceRecord = {
  id?: number
  code: string
  name: string
  similarity: number
  timestamp: string
}

export type Student = {
  code: string
  name: string
  image_count: number
}

export type InferResult = {
  match: boolean
  code: string | null
  name: string | null
  similarity: number
}

export type QRDecodeResult = {
  data: string
}

export type LivenessResult = {
  passed: boolean
  reason: string
  frames_total: number
  frames_with_face: number
  baseline_ear: number
  min_ear: number
  closed_run_length: number
  best_frame_index: number
  closed_threshold?: number
  open_threshold?: number
}

export type MarkAttendanceResult = {
  marked: boolean
  code?: string
  name?: string
  similarity: number
  timestamp?: string
  qr_code?: string
  face_predicted?: string | null
  reason?: string
  liveness?: LivenessResult
}

export type Teacher = {
  id: number
  name: string
  email: string
  subject?: string
  department?: string
  created_at?: string
}

export type ClassSession = {
  id: number
  subject_name: string
  teacher_name: string
  teacher_email: string
  session_date: string
  start_time: string
  end_time: string
  cutoff_minutes: number
  status: string
  email_sent: number
  email_sent_at?: string
  created_at?: string
  is_within_cutoff?: boolean
  cutoff_time?: string
}

export type SessionReport = {
  session: ClassSession
  summary: {
    total_enrolled: number
    present_count: number
    absent_count: number
    attendance_percentage: number
    cutoff_minutes: number
  }
  present: Array<{
    code: string
    name: string
    similarity: number
    time_in: string
    timestamp: string
  }>
  absent: Array<{
    code: string
    name: string
    status: string
  }>
}

export type EmailSettings = {
  smtp_host: string
  smtp_port: number
  smtp_user: string
  smtp_password?: string
  sender_name: string
  updated_at?: string
  has_password?: boolean
}

export type HealthStatus = {
  status: string
}

export type TriggerStatus = {
  active: boolean
  triggered_at: number | null
}

export type LatestResult = Partial<MarkAttendanceResult> & {
  available: boolean
}

export type DeviceState = {
  state: 'idle' | 'scan_qr' | 'blink' | 'processing' | 'result_ok' | 'result_fail'
  detail: string
  timestamp: number
  student_name?: string | null
  student_code?: string | null
  similarity?: number | null
}

const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || 'http://127.0.0.1:8000'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { ...(init?.headers || {}) },
    cache: 'no-store',
  })
  if (!response.ok) {
    let detail = `API request failed (${response.status})`
    try {
      const err = await response.json()
      if (err?.detail) detail = err.detail
    } catch {}
    throw new Error(detail)
  }
  return response.json()
}

export const api = {
  health: () => request<HealthStatus>('/health'),

  students: async (): Promise<Student[]> => {
    const data = await request<{ students: Student[] }>('/students')
    return data.students || []
  },

  deleteStudent: (code: string) =>
    request<{ status: string; code: string; images_removed: number }>(`/students/${encodeURIComponent(code)}`, {
      method: 'DELETE',
    }),

  enroll: async (name: string, code: string, imageFile: File | Blob) => {
    const form = new FormData()
    form.append('name', name)
    form.append('code', code)
    form.append('image', imageFile, 'face.jpg')

    return request<{ status: string; code: string; name: string; entry_id: string }>('/enroll', {
      method: 'POST',
      body: form,
    })
  },

  infer: async (imageFile: File | Blob) => {
    const form = new FormData()
    form.append('image', imageFile, 'face.jpg')

    return request<InferResult>('/infer', {
      method: 'POST',
      body: form,
    })
  },

  qrDecode: async (imageFile: File | Blob) => {
    const form = new FormData()
    form.append('image', imageFile, 'qr.jpg')

    return request<QRDecodeResult>('/qr-decode', {
      method: 'POST',
      body: form,
    })
  },

  markAttendance: async (qrCode: string, imageFile: File | Blob) => {
    const form = new FormData()
    form.append('qr_code', qrCode)
    form.append('image', imageFile, 'face.jpg')

    return request<MarkAttendanceResult>('/mark-attendance', {
      method: 'POST',
      body: form,
    })
  },

  markAttendanceLive: async (qrCode: string, frameBlobs: Blob[]): Promise<MarkAttendanceResult> => {
    const form = new FormData()
    form.append('qr_code', qrCode)
    frameBlobs.forEach((blob, idx) => {
      const pad = String(idx).padStart(2, '0')
      form.append('frames', blob, `frame_${pad}.jpg`)
    })

    return request<MarkAttendanceResult>('/mark-attendance-live', {
      method: 'POST',
      body: form,
    })
  },

  markAttendanceSingle: async (imageFile: File | Blob) => {
    const form = new FormData()
    form.append('image', imageFile, 'capture.jpg')

    return request<MarkAttendanceResult>('/mark-attendance-single', {
      method: 'POST',
      body: form,
    })
  },

  recent: async (limit = 50): Promise<AttendanceRecord[]> => {
    try {
      const data = await request<{ records: AttendanceRecord[] }>(`/attendance/recent?limit=${limit}`)
      return data.records || []
    } catch {
      return []
    }
  },

  trigger: () =>
    request<{ status: string }>('/trigger', {
      method: 'POST',
    }),

  triggerReset: () =>
    request<{ status: string }>('/trigger/reset', {
      method: 'POST',
    }),

  triggerFail: async (reason = 'verification_failed') => {
    try {
      return await request<{ status: string }>('/trigger/fail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
    } catch {
      return null
    }
  },

  triggerStatus: () => request<TriggerStatus>('/trigger-status'),

  latestResult: () => request<LatestResult & { phase?: string }>('/latest-result'),

  setPhase: async (phase: 'scanning_qr' | 'blink' | 'processing') => {
    try {
      return await request<{ status: string; phase: string }>('/phase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase }),
      })
    } catch {
      return null
    }
  },

  getDeviceState: () => request<DeviceState>('/device-state'),

  triggerDevice: () =>
    request<{ status: string }>('/device/trigger', {
      method: 'POST',
    }),

  getDeviceWsUrl: () => {
    const wsProto = baseUrl.startsWith('https') ? 'wss:' : 'ws:'
    const host = baseUrl.replace(/^https?:\/\//, '')
    return `${wsProto}//${host}/ws/device-state`
  },

  // Teachers API
  teachers: async (): Promise<Teacher[]> => {
    const data = await request<{ teachers: Teacher[] }>('/teachers')
    return data.teachers || []
  },

  addTeacher: (teacher: Partial<Teacher>) =>
    request<Teacher>('/teachers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(teacher),
    }),

  deleteTeacher: (id: number) =>
    request<{ status: string; id: number }>(`/teachers/${id}`, {
      method: 'DELETE',
    }),

  // Class Sessions & Scheduling API
  sessions: async (): Promise<ClassSession[]> => {
    const data = await request<{ sessions: ClassSession[] }>('/sessions')
    return data.sessions || []
  },

  addSession: (session: Partial<ClassSession>) =>
    request<ClassSession>('/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(session),
    }),

  deleteSession: (id: number) =>
    request<{ status: string; id: number }>(`/sessions/${id}`, {
      method: 'DELETE',
    }),

  activeSession: async (): Promise<ClassSession | null> => {
    try {
      const data = await request<{ session: ClassSession | null }>('/sessions/active')
      return data.session
    } catch {
      return null
    }
  },

  sessionReport: (sessionId: number): Promise<SessionReport> =>
    request<SessionReport>(`/sessions/${sessionId}/report`),

  sendSessionEmail: (sessionId: number) =>
    request<{ status: string; recipient: string; subject: string }>(`/sessions/${sessionId}/send-email`, {
      method: 'POST',
    }),

  // Email / SMTP Settings API
  emailSettings: async (): Promise<EmailSettings> => {
    const data = await request<{ settings: EmailSettings }>('/settings/email')
    return data.settings
  },

  saveEmailSettings: (settings: Partial<EmailSettings>) =>
    request<{ status: string; settings: EmailSettings }>('/settings/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    }),

  testEmail: (recipient: string) =>
    request<{ status: string; recipient: string }>('/settings/email/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient }),
    }),
}

export { baseUrl }

