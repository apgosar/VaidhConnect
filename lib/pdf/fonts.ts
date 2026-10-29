import path from 'node:path'
import { Font } from '@react-pdf/renderer'

/**
 * PDF fonts. The built-in Helvetica cannot draw Hindi/Gujarati (patient names
 * and notes are often in those scripts) or the rupee sign, so three Noto
 * families are bundled in public/fonts/pdf (SIL Open Font License) and chosen
 * per run of text: Latin by default, Devanagari for Hindi and the rupee sign,
 * Gujarati for Gujarati. They live in /public so the Docker image carries them.
 */
export const FONT_LATIN = 'NotoSans'
export const FONT_DEVANAGARI = 'NotoSansDevanagari'
export const FONT_GUJARATI = 'NotoSansGujarati'

let registered = false

export function registerPdfFonts() {
  if (registered) return
  registered = true
  const dir = path.join(process.cwd(), 'public', 'fonts', 'pdf')
  const family = (name: string, file: string) =>
    Font.register({
      family: name,
      fonts: [
        { src: path.join(dir, `${file}-400-normal.woff`), fontWeight: 400 },
        { src: path.join(dir, `${file}-700-normal.woff`), fontWeight: 700 },
      ],
    })
  family(FONT_LATIN, 'noto-sans-latin')
  family(FONT_DEVANAGARI, 'noto-sans-devanagari')
  family(FONT_GUJARATI, 'noto-sans-gujarati')
  // Never break words with a hyphen: a split medicine name is worse than a long line.
  Font.registerHyphenationCallback(word => [word])
}

const isGujarati = (cp: number) => cp >= 0x0a80 && cp <= 0x0aff
// Devanagari block plus the rupee sign, which only the Devanagari subset carries.
const isDevanagari = (cp: number) => (cp >= 0x0900 && cp <= 0x097f) || cp === 0x20b9

export interface ScriptRun { text: string; family: string }

/**
 * Split text into runs that each use one font. Only Hindi/Gujarati characters (and the rupee sign)
 * leave the Latin font; spaces, digits and punctuation stay Latin because the Indic subsets do not carry them.
 */
export function scriptRuns(text: string): ScriptRun[] {
  const runs: ScriptRun[] = []
  for (const ch of text) {
    const cp = ch.codePointAt(0)!
    const family = isGujarati(cp) ? FONT_GUJARATI : isDevanagari(cp) ? FONT_DEVANAGARI : FONT_LATIN
    const last = runs[runs.length - 1]
    if (last && last.family === family) last.text += ch
    else runs.push({ text: ch, family })
  }
  return runs
}
