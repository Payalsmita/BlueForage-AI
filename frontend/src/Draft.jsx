/* Drawing-set primitives: the vocabulary every sheet is built from. */

/** Authored line icons, one stroke weight. */
const PATHS = {
  arrow: 'M4 12h15M13 6l6 6-6 6',
  check: 'M4.5 12.5l5 5L19.5 7',
  cross: 'M6 6l12 12M18 6L6 18',
  pause: 'M9 5v14M15 5v14',
  delta: 'M12 4L21 19H3z',
  open: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  doc: 'M6 3h8l4 4v14H6zM14 3v4h4',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  plus: 'M12 5v14M5 12h14',
}
export function Icon({ name, size = 16, label }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.75" strokeLinecap="square" strokeLinejoin="miter"
         role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <path d={PATHS[name]} />
    </svg>
  )
}

/** Detail callout: a split circle, number on top, sheet/doc reference below. */
export function Callout({ top, bottom, onClick, title }) {
  const body = <><span className="co-top">{top}</span><span className="co-bot">{bottom}</span></>
  return onClick
    ? <button type="button" className="callout" onClick={onClick} title={title}>{body}</button>
    : <span className="callout" title={title}>{body}</span>
}

/** Dimension string: a measured line whose length is the share, against a dashed full-scale baseline. */
export function Dimension({ share, label, title }) {
  const v = Math.max(0, Math.min(1, share || 0))
  return (
    <div className={`dim${v < 0.4 ? ' dim-short' : ''}`} title={title}>
      <span className="dim-line" style={{ width: `${v * 100}%` }}><b className="dim-label">{label}</b></span>
    </div>
  )
}

/** Rectangular drawing tag. kind: ink | verified | redline | muted. */
export const Tag = ({ kind = 'ink', icon, children, title }) => (
  <span className={`tag tag-${kind}`} title={title}>{icon && <Icon name={icon} size={12} />}{children}</span>
)

/** Revision delta: the triangle checkers put beside a changed item. */
export const Delta = ({ n, title = `Revision ${n}` }) => (
  <span className="delta" title={title} aria-label={title}><svg viewBox="0 0 24 22" aria-hidden="true"><path d="M12 1.5L22.5 20.5H1.5z" /></svg><b>{n}</b></span>
)

/** The consultant's rubber stamp; it lands once (see .stamp animation). */
export function Stamp({ title, line, date, tone = 'approve' }) {
  return (
    <div className={`stamp stamp-${tone}`} role="img" aria-label={`${title}. ${line}${date ? `, ${date}` : ''}`}>
      <span className="stamp-title">{title}</span>
      <span className="stamp-line">{line}</span>
      {date && <span className="stamp-date">{date}</span>}
    </div>
  )
}

/** Verbatim quote, highlighted the way a checker marks what was verified against source. */
export const Verified = ({ children }) => <q className="verified">{children}</q>
