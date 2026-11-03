// Runs inside the page (see ui-audit.ts). Plain JavaScript on purpose: it is sent to the browser as text.
(() => {
  const vw = window.innerWidth
  const visible = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0 }
  const label = (e) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).slice(0, 3).join('.') : ''} "${(e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)}"`
  const scrolls = (e) => { for (let n = e; n && n !== document.body; n = n.parentElement) { if (/(auto|scroll)/.test(getComputedStyle(n).overflowX)) return true } return false }
  const out = (r) => r.right > vw + 1 || r.left < -1

  const pageOverflow = document.documentElement.scrollWidth - vw
  const all = [...document.body.querySelectorAll('*')].filter(visible)

  const outside = all.filter(e => out(e.getBoundingClientRect()) && !scrolls(e.parentElement) && getComputedStyle(e).position !== 'fixed')
  const sticksOut = outside.filter(e => !outside.some(o => o !== e && o.contains(e))).slice(0, 6).map(label)

  // an element wider than the box it sits in (it is clipped or pushed out, so the person cannot see or reach all of it)
  const spills = all
    .filter(e => {
      const p = e.parentElement
      if (!p || p === document.body || e.tagName === 'svg' || getComputedStyle(e).position === 'absolute' || getComputedStyle(e).position === 'fixed') return false
      if (/(auto|scroll)/.test(getComputedStyle(p).overflowX)) return false
      const a = e.getBoundingClientRect(), b = p.getBoundingClientRect()
      return a.right > b.right + 2 && a.width > 8
    })
    .filter((e, _i, arr) => !arr.some(o => o !== e && o.contains(e)))
    .slice(0, 6).map(e => label(e) + ' is wider than ' + label(e.parentElement).slice(0, 50))

  const textBoxes = all.filter(e => [...e.childNodes].some(n => n.nodeType === 3 && (n.textContent || '').trim().length > 1) && getComputedStyle(e).position !== 'fixed')
  const overlaps = []
  for (let i = 0; i < textBoxes.length && overlaps.length < 6; i++) {
    for (let j = i + 1; j < textBoxes.length && overlaps.length < 6; j++) {
      const x = textBoxes[i], y = textBoxes[j]
      if (x.contains(y) || y.contains(x)) continue
      const p = x.getBoundingClientRect(), q = y.getBoundingClientRect()
      const w = Math.min(p.right, q.right) - Math.max(p.left, q.left), h = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top)
      if (w > 4 && h > 4 && w * h > 0.3 * Math.min(p.width * p.height, q.width * q.height)) overlaps.push(label(x) + '  <->  ' + label(y))
    }
  }

  const tooNarrow = all
    .filter(e => /^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName) && !['checkbox', 'radio', 'hidden', 'file', 'range'].includes(e.type) && e.getBoundingClientRect().width < 80 && e.tagName !== 'SELECT' && e.type !== 'color' && !(e.maxLength > 0 && e.maxLength <= 2))
    .slice(0, 6).map(e => label(e) + ' is ' + Math.round(e.getBoundingClientRect().width) + 'px wide')

  return { pageOverflow, sticksOut, spills, overlaps, tooNarrow }
})()
