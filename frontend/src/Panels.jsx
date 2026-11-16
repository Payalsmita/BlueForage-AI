import { useEffect, useState } from 'react'
import { KIND, SAMPLES, api, groupPath, json, pct } from './api.js'


// ---------- Gap check ----------
export function GapCheck({ g, run, busy, setStatus }) {
  const [text, setText] = useState('')
  const [geo, setGeo] = useState('')
  const [report, setReport] = useState(null)

  async function loadSample() {
    const s = SAMPLES[g.industry]
    if (!s) return setStatus({ msg: `No sample customer for ${g.industry}; paste your own notes.`, error: false })
    setText(await api(s.file)); setGeo(s.geo)
  }

  const check = () => run('Checking customer against blueprint', async () => {
    setReport(await api(`/api/blueprints/${groupPath(g)}/gap-check`, json({ text, geography: geo })))
  })

  return (
    <>
      <div className="gap-form">
        <p className="hint">Paste a new customer's requirements or meeting notes. They are compared with the current blueprint (rejected items excluded).</p>
        <div className="row">
          <label>Customer country <input type="text" size="5" placeholder="e.g. US" value={geo} onChange={e => setGeo(e.target.value)} /></label>
          <button className="small" onClick={loadSample}>Load sample customer</button>
        </div>
        <textarea aria-label="Customer requirements" value={text} onChange={e => setText(e.target.value)} />
        <div><button className="primary" disabled={busy} onClick={check}>Check against blueprint</button></div>
      </div>
      {report && <Findings findings={report.findings} />}
    </>
  )
}

/** MISSING / UNIQUE / ALIGNED columns; shared by the Gap check page and the Implementation Agent. */
export function Findings({ findings = [] }) {
  const section = (type, title, hint) => {
    const fs = findings.filter(f => f.type === type)
    return (
      <div>
        <h2>{title} <small>{fs.length}</small></h2>
        <p className="hint">{hint}</p>
        {fs.length === 0 && <div className="empty" style={{ padding: 16 }}>None</div>}
        {fs.map((f, n) => (
          <div className="card" key={n}>
            <div className="row">
              <span className="id">{f.blueprintItemId || 'new'}</span>
              <span className="name">{f.name}</span>
              <span className={`pill ${type}`}>{KIND[f.kind] || f.kind}</span>
            </div>
            <div className="conf">peers: {f.peerSupport}</div>
            <div className="detail">{f.message}</div>
            {f.customerQuotes?.length > 0 && <ul className="ev">{f.customerQuotes.map((q, k) => <li key={k}>“{q}”</li>)}</ul>}
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="cols">
      {section('MISSING', 'Missing', 'Common among peers (50%+, country-aware) but absent from this customer.')}
      {section('UNIQUE', 'Unique to this customer', 'Not seen at any peer. Confirm it is intentional.')}
      {section('ALIGNED', 'Aligned', 'Matches the industry blueprint.')}
    </div>
  )
}

// ---------- Accuracy ----------
export function Accuracy({ g, run, busy }) {
  const [r, setR] = useState(null)
  const evaluate = () => run('Scoring extractions', async () => setR(await api(`/api/eval/${groupPath(g)}`)))

  let body = null
  if (r) {
    const all = r.scores.reduce((a, s) => ({ m: a.m + s.matched, x: a.x + s.extracted, e: a.e + s.expected }), { m: 0, x: 0, e: 0 })
    const quoteRate = r.quotesKept / Math.max(1, r.quotesKept + r.quotesDropped)
    const list = (title, xs) => xs.length > 0 && (
      <details><summary>{title} ({xs.length})</summary><ul className="ev">{xs.map((x, n) => <li key={n}>{x}</li>)}</ul></details>
    )
    body = (
      <>
        <div className="stats">
          <Stat big={pct(all.m / Math.max(1, all.e))} label="recall: items in the answer key that were found" />
          <Stat big={pct(all.m / Math.max(1, all.x))} label="precision: extracted items that are correct" />
          <Stat big={pct(quoteRate)} label={`quotes found verbatim in source (${r.quotesDropped} dropped)`} />
          <Stat big={r.docsEvaluated} label={`docs scored${r.docsSkipped.length ? ` · skipped ${r.docsSkipped.join(', ')}` : ''}`} />
        </div>
        {r.withoutSelfCheck ? (
          <p className="hint">
            <b>Self-check:</b> a second AI pass recovered {r.selfCheckAdded} item(s) the first pass missed. Recall without it:{' '}
            {r.withoutSelfCheck.map((s, n) => (
              <span key={s.kind}>{n > 0 && ' · '}{KIND[s.kind]} {pct(s.recall)} → <b>{pct(r.scores.find(x => x.kind === s.kind)?.recall ?? 0)}</b></span>
            ))}
          </p>
        ) : (
          <p className="hint">Self-check recovered nothing extra for these extractions (or they were cached before the self-check existed; tick <i>re-extract</i> and generate again).</p>
        )}
        <table>
          <thead><tr><th>Kind</th><th>Expected</th><th>Extracted</th><th>Matched</th><th>Precision</th><th>Recall</th><th></th></tr></thead>
          <tbody>
            {r.scores.map(s => (
              <tr key={s.kind}>
                <td>{KIND[s.kind]}</td><td className="num">{s.expected}</td><td className="num">{s.extracted}</td>
                <td className="num">{s.matched}</td><td className="num">{pct(s.precision)}</td><td className="num">{pct(s.recall)}</td>
                <td>{list('missed', s.missed)}{list('extra', s.extra)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    )
  }

  return (
    <>
      <p className="hint">Compares the AI's extractions with the answer key in <code>docs/ground_truth.json</code>. No AI calls; generate the blueprint first.</p>
      <button className="primary" disabled={busy} onClick={evaluate}>Run accuracy check</button>
      <div style={{ marginTop: 16 }}>{body}</div>
    </>
  )
}

const Stat = ({ big, label }) => <div className="stat"><div className="big">{big}</div><div>{label}</div></div>

// ---------- Sources ----------
export function Sources({ g, run, busy, openDoc, onUploaded, fail }) {
  const [docs, setDocs] = useState([])
  const [form, setForm] = useState({ docId: '', geography: '', industry: g.industry, workflowType: g.workflowType })
  const [file, setFile] = useState(null)

  const loadDocs = () => api('/api/docs').then(setDocs, fail)
  useEffect(() => { loadDocs() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const set = k => e => setForm({ ...form, [k]: e.target.value })
  const mine = docs.filter(d => d.industry === g.industry && d.workflowType === g.workflowType)

  const upload = e => {
    e.preventDefault()
    run(`Uploading ${file.name}`, async () => {
      const body = new FormData()
      body.append('file', file)
      Object.entries(form).forEach(([k, v]) => body.append(k, v.trim()))
      const d = await api('/api/docs', { method: 'POST', body })
      await Promise.all([loadDocs(), onUploaded(`${d.industry}/${d.workflowType}`)])
      e.target.reset(); setFile(null); setForm({ ...form, docId: '' })
      return `Uploaded ${d.docId}. Click Generate blueprint for ${d.industry} · ${d.workflowType} to include it (only the new doc is sent to the AI).`
    })
  }

  return (
    <>
      <h2>Source implementations <small>{mine.length}</small></h2>
      <table>
        <thead><tr><th>Doc</th><th>File</th><th>Country</th></tr></thead>
        <tbody>
          {mine.map(d => (
            <tr key={d.docId}>
              <td><button className="linkish" onClick={() => openDoc(d.docId)}>{d.docId}</button></td>
              <td>{d.filename}</td><td>{d.geography}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={{ marginTop: 24 }}>Add an implementation document</h2>
      <form className="upload" onSubmit={upload}>
        <label>File (.md, .txt, .pdf, .docx, .pptx)
          <input type="file" required accept=".md,.txt,.pdf,.docx,.pptx" onChange={e => setFile(e.target.files[0] || null)} />
        </label>
        <label>Doc ID<input type="text" required pattern="[A-Za-z0-9-]{1,64}" placeholder="e.g. AIR-007" value={form.docId} onChange={set('docId')} /></label>
        <label>Country<input type="text" required pattern="[A-Za-z0-9-]{1,64}" placeholder="e.g. US" value={form.geography} onChange={set('geography')} /></label>
        <label>Industry<input type="text" required pattern="[A-Za-z0-9-]{1,64}" value={form.industry} onChange={set('industry')} /></label>
        <label>Workflow type<input type="text" required pattern="[A-Za-z0-9-]{1,64}" value={form.workflowType} onChange={set('workflowType')} /></label>
        <div><button className="primary" disabled={busy}>Upload</button></div>
      </form>
    </>
  )
}
