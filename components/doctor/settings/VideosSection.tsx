'use client'

import { X } from 'lucide-react'
import { Section } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

/** Settings → YouTube Videos: the list of video links shown on the clinic's public page. */
export function VideosSection({ links, onChange }: { links: string[]; onChange: (links: string[]) => void }) {
  return (
    <Section title="YouTube Videos" description="Embed YouTube videos on your vCard (e.g., patient testimonials, treatments).">
      <div className="space-y-3">
        {links.map((link, idx) => (
          <div key={idx} className="flex gap-2">
            <input
              aria-label={`YouTube link ${idx + 1}`}
              className="form-input flex-1"
              placeholder="https://youtube.com/watch?v=..."
              value={link}
              onChange={e => onChange(links.map((l, i) => (i === idx ? e.target.value : l)))}
            />
            <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 px-3" aria-label={`Remove YouTube link ${idx + 1}`} onClick={() => onChange(links.filter((_, i) => i !== idx))}>
              <X size={16} aria-hidden="true" />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => onChange([...links, ''])}>+ Add YouTube Link</Button>
      </div>
    </Section>
  )
}
