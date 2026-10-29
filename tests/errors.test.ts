import { describe, it, expect } from 'vitest'
import { apiError, errorText, ERROR_STATUS, type ErrorCode } from '@/lib/errors'
import { failureText, readFailure, networkFailureText } from '@/lib/clientErrors'
import { message, scriptLang, LANGS } from '@/lib/messages'
import { en } from '@/lib/messages/en'
import { hi } from '@/lib/messages/hi'
import { gu } from '@/lib/messages/gu'

describe('apiError', () => {
  it('answers with the standard status, wording and a machine-readable code', async () => {
    const res = apiError('CLINIC_NOT_FOUND')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Clinic not found', code: 'CLINIC_NOT_FOUND' })
  })

  it('keeps the long-standing { error } string so existing readers do not change', async () => {
    const body = await apiError('UNAUTHORIZED').json()
    expect(body.error).toBe('Unauthorized')
    expect(apiError('UNAUTHORIZED').status).toBe(401)
  })

  it('every code has a status, an English line and a Hindi and Gujarati line', () => {
    for (const code of Object.keys(ERROR_STATUS) as ErrorCode[]) {
      expect(ERROR_STATUS[code]).toBeGreaterThanOrEqual(400)
      for (const lang of LANGS) expect(message(`error.${code}`, lang).length, `${code}/${lang}`).toBeGreaterThan(3)
    }
  })

  it('allows specific wording, another status and extra fields', async () => {
    const res = apiError('VALIDATION', { message: 'Enter a valid mobile number', status: 422, extra: { field: 'phone' } })
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'Enter a valid mobile number', code: 'VALIDATION', field: 'phone' })
  })
})

describe('errorText', () => {
  it('returns catalogue wording for our codes only', () => {
    expect(errorText('RATE_LIMITED')).toBe(en['error.RATE_LIMITED'])
    expect(errorText('PIN_WRONG')).toBeUndefined()
    expect(errorText(undefined)).toBeUndefined()
    expect(errorText(42)).toBeUndefined()
  })
  it('follows the language', () => {
    expect(errorText('NOT_FOUND', 'hi')).toBe(hi['error.NOT_FOUND'])
    expect(errorText('NOT_FOUND', 'gu')).toBe(gu['error.NOT_FOUND'])
  })
})

describe('failureText (what a screen shows for a failed call)', () => {
  it('prefers a specific message the server wrote for this case', () => {
    expect(failureText({ error: 'Incorrect PIN. 3 tries left.', code: 'PIN_WRONG' }, 'fallback')).toBe('Incorrect PIN. 3 tries left.')
    expect(failureText({ error: 'Enter a valid mobile number', code: 'VALIDATION' })).toBe('Enter a valid mobile number')
  })

  it('shows the catalogue wording, in the language, when the server only sent the general one', () => {
    const general = { error: en['error.UNAUTHORIZED'], code: 'UNAUTHORIZED' }
    expect(failureText(general)).toBe(en['error.UNAUTHORIZED'])
    expect(failureText(general, undefined, 'gu')).toBe(gu['error.UNAUTHORIZED'])
  })

  it('falls back to the caller\'s wording, then to a generic line, and never throws on odd input', () => {
    expect(failureText({}, 'Could not save the notes.')).toBe('Could not save the notes.')
    expect(failureText(null)).toBe(en['error.SERVER_ERROR'])
    expect(failureText('nonsense', undefined, 'hi')).toBe(hi['error.SERVER_ERROR'])
    expect(failureText({ error: '' }, 'x')).toBe('x')
  })

  it('reads a failed response and survives an unreadable body', async () => {
    expect(await readFailure(new Response(JSON.stringify({ error: 'Too many requests', code: 'X' }), { status: 429 }))).toBe('Too many requests')
    expect(await readFailure(new Response('<html>oops</html>', { status: 502 }), 'Could not do that')).toBe('Could not do that')
    expect(networkFailureText('hi')).toBe(hi['error.NETWORK'])
  })
})

describe('message catalogue', () => {
  const keys = Object.keys(en).sort()
  it.each([['Hindi', hi], ['Gujarati', gu]])('%s has exactly the English keys, none empty', (_n, cat) => {
    expect(Object.keys(cat).sort()).toEqual(keys)
    for (const k of keys) expect((cat as Record<string, string>)[k].trim().length, k).toBeGreaterThan(0)
  })
  it('the Hindi and Gujarati lines are in their own scripts', () => {
    expect(scriptLang(hi['error.SERVER_ERROR'])).toBe('hi')
    expect(scriptLang(gu['error.SERVER_ERROR'])).toBe('gu')
  })
  it('falls back to English for an unknown language', () => {
    expect(message('common.home', 'xx' as never)).toBe(en['common.home'])
  })
})

describe('scriptLang', () => {
  it('names the language of Indic text and leaves Latin text alone', () => {
    expect(scriptLang('આશા રાવ')).toBe('gu')
    expect(scriptLang('आशा राव')).toBe('hi')
    expect(scriptLang('Asha Rao')).toBeUndefined()
    expect(scriptLang('Asha आशा')).toBe('hi')
    expect(scriptLang('')).toBeUndefined()
    expect(scriptLang(null)).toBeUndefined()
  })
})
