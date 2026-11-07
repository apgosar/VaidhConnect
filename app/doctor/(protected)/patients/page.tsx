'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Search, Users, ChevronRight, Calendar, ChevronLeft } from 'lucide-react'
import { ContactButtons } from '@/components/doctor/ContactButtons'
import { computeAge } from '@/lib/slots'
import { LangText } from '@/components/ui/LangText'

interface Patient {
  id: string
  name: string
  phone: string
  dob: string
  medicalHistory?: string
  email?: string
  _count: { appointments: number }
}

export default function PatientsPage() {
  const [query, setQuery] = useState('')
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [searched, setSearched] = useState(false)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    const timer = setTimeout(() => {
      searchPatients(query, page, limit)
    }, 300)
    return () => clearTimeout(timer)
  }, [query, page, limit])

  const searchPatients = async (q: string, p: number, l: number) => {
    setLoading(true)
    if (q.length > 0) setSearched(true)
    else setSearched(false)
    
    try {
      const res = await fetch(`/api/patients/search?q=${encodeURIComponent(q)}&page=${p}&limit=${l}`)
      const data = await res.json()
      setPatients(data.patients ?? [])
      setTotal(data.total ?? 0)
    } finally {
      setLoading(false)
    }
  }

  const formatPatientId = (id: string) => `PAT-${id.slice(-6).toUpperCase()}`

  const totalPages = Math.ceil(total / limit) || 1

  return (
    <div className="space-y-5 animate-fade-in max-w-3xl">
      <div className="flex items-center justify-between">
        <h1
          className="text-2xl font-bold"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--color-charcoal)' }}
        >
          Patients
        </h1>
        <div className="flex items-center gap-2">
          <label htmlFor="show" className="text-sm font-medium" style={{ color: 'var(--color-sage)' }}>Show:</label>
          <select id="show"
            value={limit}
            onChange={e => {
              setLimit(Number(e.target.value))
              setPage(1)
            }}
            className="form-input py-1.5 px-3 text-sm cursor-pointer"
            style={{ width: 'auto' }}
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={30}>30</option>
          </select>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-sage)' }} />
        <input aria-label="Search patients by name or phone number"
          type="text"
          className="form-input pl-10 py-3 text-base"
          placeholder="Search by name or phone number..."
          value={query}
          onChange={e => {
            setQuery(e.target.value)
            setPage(1)
          }}
          autoComplete="off"
        />
        {loading && <div className="spinner absolute right-3 top-1/2 -translate-y-1/2" />}
      </div>

      {/* Results */}
      {patients.length === 0 && !loading ? (
        <div className="text-center py-12">
          {searched ? (
            <p style={{ color: 'var(--color-sage)' }}>No patients found for &quot;{query}&quot;</p>
          ) : (
            <>
              <Users size={40} className="mx-auto mb-3" style={{ color: 'var(--color-sage-light)' }} />
              <p style={{ color: 'var(--color-sage)' }}>No patients registered yet.</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-3">
          {patients.map(patient => (
            // The whole card opens the patient (the name link stretches over it); Call and WhatsApp sit above that link.
            <div
              key={patient.id}
              className="card relative p-4 flex items-center justify-between gap-3 hover:shadow-md transition-shadow group"
            >
              <div className="flex items-center gap-4">
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
                  style={{ background: 'var(--color-forest)' }}
                >
                  {patient.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="font-semibold" style={{ color: 'var(--color-charcoal)' }}>
                      <Link href={`/doctor/patients/${patient.id}`} className="after:absolute after:inset-0"><LangText>{patient.name}</LangText></Link>
                    </p>
                    <span
                      className="text-xs font-bold px-2 py-0.5 rounded-full font-tabular tracking-wide whitespace-nowrap"
                      style={{ background: 'var(--color-primary-bg)', color: 'var(--color-forest)' }}
                    >
                      {formatPatientId(patient.id)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                    <span className="text-xs font-tabular whitespace-nowrap" style={{ color: 'var(--color-sage)' }}>
                      {computeAge(patient.dob)} yrs
                    </span>
                    <span className="text-xs flex items-center gap-1 whitespace-nowrap" style={{ color: 'var(--color-sage-light)' }}>
                      <Calendar size={11} /> {patient._count.appointments} appt{patient._count.appointments !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <ContactButtons phone={patient.phone} name={patient.name} className="relative z-10 mt-2" />
                </div>
              </div>
              <ChevronRight size={16} className="shrink-0" style={{ color: 'var(--color-sage-light)' }} />
            </div>
          ))}

          {/* Pagination Controls */}
          {total > limit && (
            <div className="flex items-center justify-between pt-4 border-t" style={{ borderColor: 'var(--color-sage-border)' }}>
              <p className="text-xs" style={{ color: 'var(--color-sage)' }}>
                Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total} patients
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p: any) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="btn btn-outline btn-sm px-2 disabled:opacity-50"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm font-medium" style={{ color: 'var(--color-charcoal)' }}>
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p: any) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="btn btn-outline btn-sm px-2 disabled:opacity-50"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
