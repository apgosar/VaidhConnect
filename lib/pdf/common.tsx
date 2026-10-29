import { Text } from '@react-pdf/renderer'
import type { Style } from '@react-pdf/types'
import { scriptRuns, FONT_LATIN } from './fonts'

/** The clinic's logo, already converted to a format react-pdf can embed. */
export interface PdfImage { data: Buffer; format: 'png' | 'jpg' }

/** Clinic brand colour, falling back to the default look when it is not a #RRGGBB value. */
export const accentOf = (primary: string | undefined, fallback: string) =>
  typeof primary === 'string' && /^#[0-9a-fA-F]{6}$/.test(primary) ? primary : fallback

/** The profile default until a clinic fills in its registration number: not worth printing. */
export const printableRegistration = (reg?: string | null) =>
  reg && !/pending/i.test(reg) ? reg : undefined

/**
 * Text that picks the right font for each script inside the string. Wrap every
 * user-entered value (names, medicines, notes, addresses) in this, never a bare <Text>.
 */
export function Txt({ children, style }: { children?: string | number | null; style?: Style | Style[] }) {
  const value = children === undefined || children === null ? '' : String(children)
  const runs = scriptRuns(value)
  return (
    <Text style={style}>
      {runs.length <= 1
        ? <Text style={{ fontFamily: runs[0]?.family ?? FONT_LATIN }}>{value}</Text>
        : runs.map((r, i) => <Text key={i} style={{ fontFamily: r.family }}>{r.text}</Text>)}
    </Text>
  )
}
