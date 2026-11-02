'use client'

import { useEffect, useState } from 'react'
import { api, type Teacher } from '@/lib/api'
import {
  BookOpen,
  GraduationCap,
  Mail,
  Plus,
  RefreshCw,
  Trash2,
  User,
  Users,
} from 'lucide-react'

export function TeachersSection({
  onShowToast,
}: {
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}) {
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [department, setDepartment] = useState('')

  const loadTeachers = async () => {
    setLoading(true)
    try {
      const data = await api.teachers()
      setTeachers(data)
    } catch (e: any) {
      onShowToast(e.message || 'Failed to load teachers', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTeachers()
  }, [])

  const handleAddTeacher = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !email.trim()) {
      onShowToast('Teacher name and email address are required.', 'error')
      return
    }

    setSubmitting(true)
    try {
      await api.addTeacher({
        name: name.trim(),
        email: email.trim(),
        subject: subject.trim(),
        department: department.trim(),
      })
      onShowToast(`Faculty member "${name}" registered successfully!`, 'success')
      setName('')
      setEmail('')
      setSubject('')
      setDepartment('')
      loadTeachers()
    } catch (e: any) {
      onShowToast(e.message || 'Failed to add teacher', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteTeacher = async (id: number, tName: string) => {
    if (!confirm(`Are you sure you want to remove ${tName}?`)) return
    try {
      await api.deleteTeacher(id)
      onShowToast(`Teacher ${tName} removed.`, 'info')
      loadTeachers()
    } catch (e: any) {
      onShowToast(e.message || 'Failed to remove teacher', 'error')
    }
  }

  const getInitials = (n = 'Teacher') => {
    return n
      .split(' ')
      .filter(Boolean)
      .map((x) => x[0])
      .join('')
      .slice(0, 2)
      .toUpperCase()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Faculty & Teachers Directory</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Register class teachers and their email IDs to receive automated attendance reports.
          </p>
        </div>
        <button
          onClick={loadTeachers}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-xl border border-border bg-card hover:bg-muted transition"
        >
          <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Add Teacher Form */}
        <div className="lg:col-span-1 rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2.5 border-b border-border pb-3">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Plus className="size-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold">Register New Faculty</h3>
              <p className="text-[11px] text-muted-foreground">Add teacher details for scheduling</p>
            </div>
          </div>

          <form onSubmit={handleAddTeacher} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                Teacher Name *
              </label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                <input
                  type="text"
                  required
                  placeholder="e.g. Dr. Ramesh Kumar"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                Teacher Email ID *
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                <input
                  type="email"
                  required
                  placeholder="e.g. ramesh.vlsi@college.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Attendance summaries will be emailed directly to this address.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                Default Subject / Course
              </label>
              <div className="relative">
                <BookOpen className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="e.g. VLSI Design"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                Department
              </label>
              <div className="relative">
                <GraduationCap className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="e.g. Electronics & Communication"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full mt-2 inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold text-primary-foreground bg-primary rounded-xl hover:bg-primary/90 transition shadow-sm disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <RefreshCw className="size-3.5 animate-spin" />
                  Saving Faculty...
                </>
              ) : (
                <>
                  <Plus className="size-4" />
                  Add to Directory
                </>
              )}
            </button>
          </form>
        </div>

        {/* Right: Teachers Directory Table */}
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-primary" />
              <h3 className="text-sm font-bold">Registered Teachers ({teachers.length})</h3>
            </div>
          </div>

          {teachers.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <User className="size-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-semibold">No teachers registered yet</p>
              <p className="text-xs mt-1">Use the form on the left to add your first faculty member.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
                    <th className="py-2.5 px-3.5">Faculty Name</th>
                    <th className="py-2.5 px-3.5">Email Address</th>
                    <th className="py-2.5 px-3.5">Subject</th>
                    <th className="py-2.5 px-3.5">Department</th>
                    <th className="py-2.5 px-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {teachers.map((t) => (
                    <tr key={t.id} className="hover:bg-muted/30 transition">
                      <td className="py-3 px-3.5 font-medium flex items-center gap-2.5">
                        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400 font-bold text-[10px]">
                          {getInitials(t.name)}
                        </div>
                        <span className="font-semibold text-foreground">{t.name}</span>
                      </td>
                      <td className="py-3 px-3.5 text-muted-foreground font-mono text-[11px]">{t.email}</td>
                      <td className="py-3 px-3.5">
                        <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium text-[11px]">
                          {t.subject || 'General'}
                        </span>
                      </td>
                      <td className="py-3 px-3.5 text-muted-foreground">{t.department || '—'}</td>
                      <td className="py-3 px-3.5 text-right">
                        <button
                          onClick={() => handleDeleteTeacher(t.id, t.name)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition"
                          title="Delete Teacher"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
