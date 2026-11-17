import { useState } from 'react'
import { KIND, api, groupPath, json } from './api.js'
import { Callout, Delta, Dimension, Icon, Tag, Verified } from './Draft.jsx'

export default function Blueprint({ bp, setBp, g, openDoc, fail }) {
  if (!bp) return (
    <div className="empty">
      <p><b>No blueprint issued yet</b> for {g.industry} · {g.workflowType} ({g.docCount} source implementations).</p>
      <p>Use <b>Generate blueprint</b> in the title block.</p>
    </div>
  )

  const review = async (id, status, editedDetail) => {
    try {
      setBp(await api(`/api/blueprints/${groupPath(g)}/items/${encodeURIComponent(id)}`, { ...json({ status, editedDetail }), method: 'PATCH' }))
    } catch (e) { fail(e) }
  }
  const counts = bp.items.reduce((a, i) => ({ ...a, [i.status]: (a[i.status] || 0) + 1 }), {})
  const base = `/api/blueprints/${groupPath(g)}`

  return (
    <>
      <div className="strip">
        <p><b className="mono">{bp.items.length}</b> items from <b className="mono">{bp.sourceDocIds.length}</b> implementations</p>
        <p className="strip-counts">
          <Tag kind="ink" icon="check">{counts.APPROVED || 0} approved</Tag>
          <Tag kind="redline">{counts.EDITED || 0} edited</Tag>
          <Tag kind="muted">{counts.PENDING || 0} pending</Tag>
          <Tag kind="muted">{counts.REJECTED || 0} rejected</Tag>
        </p>
        <p className="strip-exports">Export approved + edited:
          <a href={`${base}/export.md`} target="_blank" rel="noreferrer">Markdown <Icon name="open" size={13} /></a>
          <a href={`${base}/export.json`} target="_blank" rel="noreferrer">JSON <Icon name="open" size={13} /></a>
          <a href={`${base}/export.icims.json`} target="_blank" rel="noreferrer">iCIMS config (mock) <Icon name="open" size={13} /></a>
        </p>
      </div>

      <Legend />
      <OrderConflicts conflicts={bp.orderConflicts} />

      <div className="schedules">
        {Object.keys(KIND).map(k => {
          const items = bp.items.filter(i => i.kind === k)
          return (
            <section key={k} className="schedule-col" aria-labelledby={`col-${k}`}>
              <h3 id={`col-${k}`} className="col-head">{KIND[k]} <span className="mono">{items.length}</span></h3>
              <ol className="entries">{items.map(i => <Entry key={i.id} item={i} review={review} openDoc={openDoc} />)}</ol>
            </section>
          )
        })}
      </div>
    </>
  )
}

function Legend() {
  return (
    <details className="legend">
      <summary>Legend</summary>
      <dl>
        <div><dt><Verified>quote</Verified></dt><dd>Quote verified word for word against its source document</dd></div>
        <div><dt><span className="dim-mini" /></dt><dd>Dimension: share of implementations that contain the item</dd></div>
        <div><dt><span className="geo full">US 3/3</span> <span className="geo">CA 1/2</span> <span className="geo none">DE 0/1</span></dt><dd>Country support: all · some · none</dd></div>
        <div><dt><Callout top="1" bottom="AIR-004" /></dt><dd>Detail callout: opens the source document at the quote</dd></div>
        <div><dt><Delta n="1" /></dt><dd>Edited by the consultant (revision cloud)</dd></div>
      </dl>
    </details>
  )
}

function OrderConflicts({ conflicts }) {
  if (!conflicts?.length) return null
  return (
    <aside className="cloud seq-note" aria-label="Sequence differences">
      <h3>Sequence differences <span className="mono">{conflicts.length}</span></h3>
      <ul>
        {conflicts.map((c, n) => (
          <li key={n}>
            <b>{c.stageA}</b> before <b>{c.stageB}</b> in <span className="mono">{(c.aFirstDocIds || []).join(', ') || '—'}</span>;
            after it in <span className="mono">{(c.bFirstDocIds || []).join(', ') || '—'}</span>
          </li>
        ))}
      </ul>
    </aside>
  )
}

function Entry({ item: i, review, openDoc }) {
  const [editing, setEditing] = useState(false)
  const current = i.status === 'EDITED' ? i.editedDetail : i.detail
  const [draft, setDraft] = useState(current)
  const share = i.support / i.total
  const rejected = i.status === 'REJECTED'

  return (
    <li className={`entry st-${i.status}${i.status === 'EDITED' ? ' cloud' : ''}`}>
      <div className="entry-head">
        <span className="mono entry-id">{i.id}</span>
        <h4 className="entry-name">{i.name}</h4>
        {i.status === 'EDITED' && <Delta n="1" title="Edited by the consultant" />}
        <span className="entry-status">
          {i.status === 'APPROVED' && <Tag kind="ink" icon="check">Approved</Tag>}
          {i.status === 'EDITED' && <Tag kind="redline">Edited</Tag>}
          {i.status === 'REJECTED' && <Tag kind="redline" icon="cross">Rejected</Tag>}
          {i.status === 'PENDING' && <Tag kind="muted">Pending</Tag>}
        </span>
      </div>

      <Dimension share={share} label={`${i.support}/${i.total}`} title={`${i.support} of ${i.total} implementations`} />
      <div className="entry-meta">
        {(i.geoSupport || []).map(gs => (
          <span key={gs.geography} className={`geo ${gs.support === gs.total ? 'full' : gs.support === 0 ? 'none' : ''}`}
                title={`${gs.support} of ${gs.total} in ${gs.geography}`}>{gs.geography} {gs.support}/{gs.total}</span>
        ))}
        {i.support === 1 && i.total > 2 && <Tag kind="ink" title="Seen at only one company">Unique practice</Tag>}
      </div>
      {i.aliases?.length > 0 && <p className="entry-line"><span>Also called</span> {i.aliases.join(', ')}</p>}
      {i.approvers?.length > 0 && <p className="entry-line"><span>Approvers</span> {i.approvers.join(', ')}</p>}

      {editing
        ? <textarea className="entry-edit" aria-label={`Edited description for ${i.name}`} autoFocus value={draft} onChange={e => setDraft(e.target.value)} />
        : <p className="entry-detail">{current}</p>}

      <div className="entry-actions">
        {editing ? <>
          <button type="button" className="btn-small solid" onClick={() => { setEditing(false); review(i.id, 'EDITED', draft) }}>Save revision</button>
          <button type="button" className="btn-small" onClick={() => { setEditing(false); setDraft(current) }}>Cancel</button>
        </> : <>
          <button type="button" className="btn-small" disabled={i.status === 'APPROVED'} onClick={() => review(i.id, 'APPROVED')}><Icon name="check" size={14} /> Approve</button>
          <button type="button" className="btn-small" onClick={() => { setDraft(current); setEditing(true) }}>Edit</button>
          <button type="button" className="btn-small" disabled={rejected} onClick={() => review(i.id, 'REJECTED')}><Icon name="cross" size={14} /> Reject</button>
        </>}
      </div>

      <details className="evidence">
        <summary>Evidence <span className="mono">{i.evidence.length}</span></summary>
        <ol>
          {i.evidence.map((e, n) => (
            <li key={n}>
              <Callout top={n + 1} bottom={e.docId} onClick={() => openDoc(e.docId, e.quote)} title={`Open ${e.docId} at this quote`} />
              <Verified>{e.quote}</Verified>
            </li>
          ))}
        </ol>
      </details>
    </li>
  )
}
