import { useEffect, useState } from 'react'
import { KIND, SAMPLES, api, groupPath, json, pct } from './api.js'
import { Dimension, Icon, Tag, Verified } from './Draft.jsx'

// ---------- Gap check (X-401) ----------
export function GapCheck({ g, run, busy, setStatus }) {
  const [text, setText] = useState('')
  const [geo, setGeo] = useState('')
  const [report, setReport] = useState(null)

  async function loadSample() {
    const s = SAMPLES[g.industry]
    if (!s) return setStatus({ msg: `No sample customer for ${g.industry}; paste your own notes.`, error: false })
    setText(await api(s.file)); setGeo(s.geo)
  }

  const check = e => {
    e.preventDefault()
    run('Checking customer against blueprint', async () => {
      setReport(await api(`/api/blueprints/${groupPath(g)}/gap-check`, json({ text, geography: geo })))
    })
  }

  return (
    <>
      <form className="field-form" onSubmit={check}>
        <div className="field-row">
          <label className="field">Customer country
            <input type="text" size="6" placeholder="e.g. US" value={geo} onChange={e => setGeo(e.target.value)} />
          </label>
          <button type="button" className="btn-small" onClick={loadSample}><Icon name="doc" size={14} /> Load sample customer</button>
        </div>
        <label className="field">Customer requirements or meeting notes
          <textarea required value={text} onChange={e => setText(e.target.value)} placeholder="Paste kickoff notes, an email or a requirements list" />
        </label>
        <div><button className="btn-issue" disabled={busy || !text.trim()}>Check against blueprint</button></div>
      </form>
      {report && <Findings findings={report.findings} />}
    </>
  )
}

const FINDING = {
  MISSING: { title: 'Missing', note: 'Common among peers (50%+, country-aware) but absent from this customer', tag: <Tag kind="redline">Missing</Tag> },
  UNIQUE: { title: 'Unique to this customer', note: 'No peer does this; confirm it is intentional', tag: <Tag kind="ink">Unique</Tag> },
  ALIGNED: { title: 'Aligned', note: 'Matches the industry blueprint', tag: <Tag kind="ink" icon="check">Aligned</Tag> },
}

/** MISSING / UNIQUE / ALIGNED schedules; shared by the Gap check sheet and the Implementation agent. */
export function Findings({ findings = [] }) {
  return (
    <div className="schedules">
      {Object.entries(FINDING).map(([type, f]) => {
        const fs = findings.filter(x => x.type === type)
        return (
          <section key={type} className="schedule-col" aria-labelledby={`f-${type}`}>
            <h3 id={`f-${type}`} className="col-head">{f.title} <span className="mono">{fs.length}</span></h3>
            <p className="muted small">{f.note}.</p>
            {fs.length === 0 && <p className="none">None</p>}
            <ol className="entries">
              {fs.map((x, n) => (
                <li key={n} className={`entry find-${type}`}>
                  <div className="entry-head">
                    <span className="mono entry-id">{x.blueprintItemId || 'NEW'}</span>
                    <h4 className="entry-name">{x.name}</h4>
                    <span className="entry-status">{f.tag}</span>
                  </div>
                  <p className="entry-line"><span>{KIND[x.kind] || x.kind}</span> peers <b className="mono">{x.peerSupport}</b></p>
                  <p className="entry-detail">{x.message}</p>
                  {x.customerQuotes?.length > 0 && <ul className="quotes">{x.customerQuotes.map((q, k) => <li key={k}><Verified>{q}</Verified></li>)}</ul>}
                </li>
              ))}
            </ol>
          </section>
        )
      })}
    </div>
  )
}

// ---------- Accuracy (Q-301) ----------
export function Accuracy({ g, run, busy }) {
  const [r, setR] = useState(null)
  const evaluate = () => run('Scoring extractions against the answer key', async () => setR(await api(`/api/eval/${groupPath(g)}`)))

  return (
    <>
      <div className="field-row">
        <button type="button" className="btn-issue" disabled={busy} onClick={evaluate}>Run accuracy check</button>
        <p className="muted small">Answer key: <code>docs/ground_truth.json</code>. Generate the blueprint first.</p>
      </div>
      {r && <Report r={r} />}
    </>
  )
}

function Report({ r }) {
  const all = r.scores.reduce((a, s) => ({ m: a.m + s.matched, x: a.x + s.extracted, e: a.e + s.expected }), { m: 0, x: 0, e: 0 })
  const quoteRate = r.quotesKept / Math.max(1, r.quotesKept + r.quotesDropped)
  const list = (title, xs) => xs.length > 0 && (
    <details className="evidence"><summary>{title} <span className="mono">{xs.length}</span></summary><ul>{xs.map((x, n) => <li key={n} className="mono small">{x}</li>)}</ul></details>
  )
  return (
    <div className="report">
      <table className="schedule">
        <caption>Test report: {r.docsEvaluated} documents{r.docsSkipped.length ? `, skipped ${r.docsSkipped.join(', ')}` : ''}</caption>
        <thead><tr><th scope="col">Item type</th><th scope="col" className="num">Expected</th><th scope="col" className="num">Extracted</th><th scope="col" className="num">Matched</th><th scope="col" className="num">Precision</th><th scope="col" className="num">Recall</th><th scope="col">Differences</th></tr></thead>
        <tbody>
          {r.scores.map(s => (
            <tr key={s.kind}>
              <th scope="row">{KIND[s.kind]}</th>
              <td className="num">{s.expected}</td><td className="num">{s.extracted}</td><td className="num">{s.matched}</td>
              <td className="num">{pct(s.precision)}</td><td className="num strong">{pct(s.recall)}</td>
              <td>{list('Missed', s.missed)}{list('Extra', s.extra)}{!s.missed.length && !s.extra.length && <span className="muted small">None</span>}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">All items</th>
            <td className="num">{all.e}</td><td className="num">{all.x}</td><td className="num">{all.m}</td>
            <td className="num">{pct(all.m / Math.max(1, all.x))}</td><td className="num strong">{pct(all.m / Math.max(1, all.e))}</td><td />
          </tr>
        </tfoot>
      </table>

      <div className="report-dims">
        <Dimension share={all.m / Math.max(1, all.e)} label={`Recall ${pct(all.m / Math.max(1, all.e))}`} title="Answer-key items the AI found" />
        <Dimension share={all.m / Math.max(1, all.x)} label={`Precision ${pct(all.m / Math.max(1, all.x))}`} title="Extracted items that are correct" />
        <Dimension share={quoteRate} label={`Quotes verified ${pct(quoteRate)}`} title={`${r.quotesDropped} quotes dropped`} />
      </div>

      <aside className="notes self-check" aria-label="Self-check">
        <h3>Self-check</h3>
        {r.withoutSelfCheck ? <>
          <p>A second AI pass recovered <b className="mono">{r.selfCheckAdded}</b> item(s) the first pass missed.</p>
          <table className="schedule compact">
            <thead><tr><th scope="col">Recall</th><th scope="col" className="num">First pass</th><th scope="col" className="num">With self-check</th></tr></thead>
            <tbody>
              {r.withoutSelfCheck.map(s => (
                <tr key={s.kind}><th scope="row">{KIND[s.kind]}</th><td className="num">{pct(s.recall)}</td>
                  <td className="num strong">{pct(r.scores.find(x => x.kind === s.kind)?.recall ?? 0)}</td></tr>
              ))}
            </tbody>
          </table>
        </> : <p>The self-check found nothing the first pass missed for this project (or these extractions predate it; tick <i>Re-extract</i> and generate again).</p>}
      </aside>
    </div>
  )
}

// ---------- Sources (S-101) ----------
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
      return `Added ${d.docId}. Generate the blueprint for ${d.industry} · ${d.workflowType} to include it (only the new document is sent to the AI).`
    })
  }

  return (
    <>
      <h3 className="col-head">Document index <span className="mono">{mine.length}</span></h3>
      <ul className="doc-index">
        {mine.map(d => (
          <li key={d.docId}>
            <button type="button" className="doc-cell" onClick={() => openDoc(d.docId)} title={`Open ${d.filename}`}>
              <span className="doc-code">{d.docId}</span>
              <span className="doc-file">{d.filename.replace(/^[A-Z]+-\d+_/, '').replace(/\.md$/, '').replaceAll('_', ' ')}</span>
              <span className="geo">{d.geography}</span>
            </button>
          </li>
        ))}
      </ul>

      <h3 className="col-head">Add an implementation document</h3>
      <form className="field-form upload" onSubmit={upload}>
        <label className="field wide">File (.md, .txt, .pdf, .docx, .pptx)
          <input type="file" required accept=".md,.txt,.pdf,.docx,.pptx" onChange={e => setFile(e.target.files[0] || null)} />
        </label>
        <label className="field">Doc ID<input type="text" required pattern="[A-Za-z0-9-]{1,64}" placeholder="e.g. AIR-007" value={form.docId} onChange={set('docId')} /></label>
        <label className="field">Country<input type="text" required pattern="[A-Za-z0-9-]{1,64}" placeholder="e.g. US" value={form.geography} onChange={set('geography')} /></label>
        <label className="field">Industry<input type="text" required pattern="[A-Za-z0-9-]{1,64}" value={form.industry} onChange={set('industry')} /></label>
        <label className="field">Workflow type<input type="text" required pattern="[A-Za-z0-9-]{1,64}" value={form.workflowType} onChange={set('workflowType')} /></label>
        <div><button className="btn-issue" disabled={busy}><Icon name="upload" size={16} /> Add document</button></div>
      </form>
    </>
  )
}
