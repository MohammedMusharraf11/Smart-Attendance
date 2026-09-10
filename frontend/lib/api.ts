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

export type MarkAttendanceResult = {
  marked: boolean
  code?: string
  name?: string
  similarity: number
  timestamp?: string
  qr_code?: string
  face_predicted?: string | null
  reason?: string
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
}

export { baseUrl }

