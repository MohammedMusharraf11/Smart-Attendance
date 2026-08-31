export type AttendanceRecord = {
  id?: string | number
  student_id?: string | number
  studentId?: string | number
  student_name?: string
  studentName?: string
  name?: string
  timestamp?: string
  created_at?: string
  status?: string
  class_id?: string | number
  class_name?: string
  className?: string
}

export type Student = {
  id?: string | number
  student_id?: string | number
  name: string
  email?: string
  department?: string
  year?: string | number
}

export type ClassItem = {
  id?: string | number
  name: string
  code?: string
  room?: string
  start_time?: string
  end_time?: string
  instructor?: string
}

const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || 'http://localhost:8000'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`API request failed (${response.status})`)
  return response.json()
}

export const api = {
  recent: () => request<AttendanceRecord[]>('/attendance/recent'),
  students: () => request<Student[]>('/students'),
  classes: () => request<ClassItem[]>('/classes'),
  enroll: (student: Student) => request<Student>('/students/enroll', { method: 'POST', body: JSON.stringify(student) }),
  markAttendance: (studentId: string | number) => request<AttendanceRecord>('/attendance/manual', { method: 'POST', body: JSON.stringify({ student_id: studentId }) }),
  createClass: (item: ClassItem) => request<ClassItem>('/classes', { method: 'POST', body: JSON.stringify(item) }),
}

export { baseUrl }
