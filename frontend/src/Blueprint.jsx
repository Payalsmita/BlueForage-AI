import { useState } from 'react'
import { KIND, api, groupPath, json, pct } from './api.js'

export default function Blueprint({ bp, setBp, g, openDoc, fail }) {
  if (!bp) return (
    <div className="empty">
      No blueprint yet for <b>{g.industry} / {g.workflowType}</b> ({g.docCount} source implementations).<br />
      Click <b>Generate blueprint</b>.
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
      <div className="summary">
        <span><b>{bp.items.length}</b> items from <b>{bp.sourceDocIds.length}</b> implementations</span>
        <span>{['APPROVED', 'EDITED', 'PENDING', 'REJECTED'].map(s => `${s.toLowerCase()} ${counts[s] || 0}`).join(' · ')}</span>
        <span>Export (approved + edited):{' '}
          <a href={`${base}/export.md`} target="_blank" rel="noreferrer">Markdown</a> ·{' '}
          <a href={`${base}/export.json`} target="_blank" rel="noreferrer">JSON</a> ·{' '}
          <a href={`${base}/export.icims.json`} target="_blank" rel="noreferrer">iCIMS config (mock)</a>
        </span>
      </div>
      <OrderConflicts conflicts={bp.orderConflicts} />
      <div className="cols">
        {Object.keys(KIND).map(k => {
          const items = bp.items.filter(i => i.kind === k)
          return (
            <div key={k}>
              <h2>{KIND[k]} <small>{items.length}</small></h2>
              {items.map(i => <Card key={i.id} item={i} review={review} openDoc={openDoc} />)}
            </div>
          )
        })}
      </div>
    </>
  )
}

function OrderConflicts({ conflicts }) {
  if (!conflicts?.length) return null
  return (
    <div className="conflicts">
      <h2>Order differences <small>{conflicts.length}</small></h2>
      <ul>
        {conflicts.map((c, n) => (
          <li key={n}>
            <b>{c.stageA}</b> before <b>{c.stageB}</b> in {(c.aFirstDocIds || []).join(', ') || '—'}
            {' · '}after in {(c.bFirstDocIds || []).join(', ') || '—'}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Card({ item: i, review, openDoc }) {
  const [editing, setEditing] = useState(false)
  const current = i.status === 'EDITED' ? i.editedDetail : i.detail
  const [draft, setDraft] = useState(current)
  const share = i.support / i.total

  return (
    <div className={`card${i.status === 'REJECTED' ? ' rejected' : ''}`}>
      <div className="row">
        <span className="id">{i.id}</span>
        <span className="name">{i.name}</span>
        {i.support === 1 && i.total > 2 && <span className="pill outlier" title="Seen at only one company">unique practice</span>}
        <span className={`pill ${i.status}`}>{i.status.toLowerCase()}</span>
      </div>
      <div className="conf">
        <div className="bar" role="img" aria-label={pct(share)}><i style={{ width: pct(share) }} /></div>
        {i.support}/{i.total} implementations
      </div>
      <div className="geo">
        {(i.geoSupport || []).map(gs => (
          <span key={gs.geography} className={gs.support === gs.total ? 'full' : gs.support === 0 ? 'none' : ''}
                title={`${gs.support} of ${gs.total} in ${gs.geography}`}>{gs.geography} {gs.support}/{gs.total}</span>
        ))}
      </div>
      {i.aliases?.length > 0 && <div className="aliases">Also called: {i.aliases.join(', ')}</div>}
      {i.approvers?.length > 0 && <div className="approvers">Approvers: {i.approvers.join(', ')}</div>}
      {editing
        ? <div className="detail"><textarea style={{ minHeight: 80 }} aria-label="Edited description" autoFocus value={draft} onChange={e => setDraft(e.target.value)} /></div>
        : <div className="detail">{current}</div>}
      <div className="actions">
        {editing ? <>
          <button className="small primary" onClick={() => { setEditing(false); review(i.id, 'EDITED', draft) }}>Save</button>
          <button className="small" onClick={() => { setEditing(false); setDraft(current) }}>Cancel</button>
        </> : <>
          <button className="small" onClick={() => review(i.id, 'APPROVED')}>Approve</button>
          <button className="small" onClick={() => { setDraft(current); setEditing(true) }}>Edit</button>
          <button className="small" onClick={() => review(i.id, 'REJECTED')}>Reject</button>
        </>}
      </div>
      <details>
        <summary>Evidence ({i.evidence.length})</summary>
        <ul className="ev">
          {i.evidence.map((e, n) => (
            <li key={n}>“{e.quote}” — <button onClick={() => openDoc(e.docId, e.quote)}>{e.docId}</button></li>
          ))}
        </ul>
      </details>
    </div>
  )
}
