'use client'

import { useEffect, useState } from 'react'
import { adviceOptionsOrDefault } from '@/lib/advice'

/** The clinic's list of advice the doctor can tick (Settings), or the starter list. Empty until it has loaded. */
export function useAdviceOptions(): string[] {
  const [options, setOptions] = useState<string[]>([])
  useEffect(() => {
    let live = true
    fetch('/api/doctor/profile')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (live && d?.doctor) setOptions(adviceOptionsOrDefault(d.doctor.adviceOptions)) })
      .catch(() => { /* the form works without the list; the doctor can still type advice */ })
    return () => { live = false }
  }, [])
  return options
}
