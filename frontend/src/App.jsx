import { useEffect, useRef, useState } from 'react'
import { api, groupPath, pct } from './api.js'
import Blueprint from './Blueprint.jsx'
import { Accuracy, GapCheck, Sources } from './Panels.jsx'
import Agent from './Agent.jsx'
import { Callout, Dimension, Icon } from './Draft.jsx'

/** The drawing set: one sheet per step of the demo, in reading order. */
const SHEETS = [
  { id: 'overview', no: 'G-001', title: 'Cover sheet',
    notes: ['How past implementations become a reviewed blueprint, and how the agent uses it for a new customer.'] },
  { id: 'sources', no: 'S-101', title: 'Source implementations',
    notes: ['The past implementation documents behind the selected project.', 'Add more here: PDF, DOCX and PPTX files are converted to Markdown with MarkItDown.'] },
  { id: 'blueprint', no: 'B-201', title: 'Industry blueprint',
    notes: ['The AI extracted stages, roles and approval rules from every source document.',
      'Code verified every quote word for word and counted how many implementations contain each item.',
      'Approve, edit or reject each item; only approved and edited items are exported.'] },
  { id: 'eval', no: 'Q-301', title: 'Accuracy check',
    notes: ['The AI\'s extractions scored against a hand-checked answer key.', 'No AI calls are made on this sheet.'] },
  { id: 'gap', no: 'X-401', title: 'Gap check',
    notes: ['A one-shot comparison of a new customer\'s notes with the blueprint: what they are missing, what is unique to them and what already matches.'] },
  { id: 'agent', no: 'A-501', title: 'Implementation agent',
    notes: ['The agent takes a new customer from kickoff notes to a validated configuration, UAT tests and a handover pack.',
      'It plans each step itself within code-enforced limits, and holds twice for the consultant: to answer its questions and to approve the result.'] },
]
const sheetOf = id => SHEETS.find(s => s.id === id)
const today = () => new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' })
const clock = () => new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })

export default function App() {
  const [groups, setGroups] = useState([])
  const [sel, setSel] = useState(0)
  // the open sheet lives in the URL hash so a refresh or a shared link keeps the place in the demo
  const [step, setStep] = useState(() => SHEETS.some(s => `#${s.id}` === location.hash) ? location.hash.slice(1) : 'overview')
  const [visited, setVisited] = useState(() => new Set([step]))
  const [live, setLive] = useState(null) // { msg } while something runs
  const [log, setLog] = useState([])     // revision/notes log, newest first
  const [busy, setBusy] = useState(false)
  const [force, setForce] = useState(false)
  const [bp, setBp] = useState(null)
  const [doc, setDoc] = useState(null) // { id, text, quote }
  const dialog = useRef(null)
  const g = groups[sel]
  const gKey = g ? `${g.industry}/${g.workflowType}` : ''

  const note = (msg, error = false) => setLog(l => [{ msg, error, at: clock() }, ...l].slice(0, 6))
  const fail = e => note(e.message, true)
  const setStatus = ({ msg, error }) => msg && note(msg, error) // children report through the log

  /** Runs fn with a live elapsed-seconds line. fn may return a message for the log. */
  async function run(label, fn) {
    const t0 = Date.now()
    const secs = () => Math.round((Date.now() - t0) / 1000)
    const tick = () => setLive({ msg: `${label}… ${secs()}s` })
    tick()
    const id = setInterval(tick, 1000)
    setBusy(true)
    try {
      const msg = await fn()
      note(typeof msg === 'string' ? msg : `${label}: done in ${secs()}s.`)
    } catch (e) { fail(e) } finally { clearInterval(id); setLive(null); setBusy(false) }
  }

  /** Reload scenarios, keeping the current one selected. */
  async function loadGroups(keep = gKey) {
    const list = await api('/api/groups')
    setGroups(list)
    setSel(Math.max(0, list.findIndex(x => `${x.industry}/${x.workflowType}` === keep)))
  }

  useEffect(() => { loadGroups().catch(e => fail(new Error('Cannot reach the backend: ' + e.message))) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!g) return
    let on = true // ignore a slow response for a project the user already left
    setBp(null)
    api(`/api/blueprints/${groupPath(g)}`).then(b => { if (!on) return; setBp(b); note(`Opened ${g.industry} · ${g.workflowType}: ${b.items.length} items from ${b.sourceDocIds.length} implementations.`) },
      e => { if (!on) return; if (e.status === 404) note(`${g.industry} · ${g.workflowType}: no blueprint issued yet.`); else fail(e) })
    return () => { on = false }
  }, [gKey]) // eslint-disable-line react-hooks/exhaustive-deps

  async function openDoc(id, quote) {
    try { setDoc({ id, quote, text: await api(`/api/docs/${encodeURIComponent(id)}/text`) }) } catch (e) { fail(e) }
  }

  useEffect(() => {
    if (!doc) return
    dialog.current.showModal()
    dialog.current.querySelector('mark')?.scrollIntoView({ block: 'center' })
  }, [doc])

  const generate = () => run(`Generating blueprint from ${g.docCount} implementations`, async () => {
    setBp(await api(`/api/blueprints/${groupPath(g)}?force=${force}`, { method: 'POST' }))
    return `Blueprint issued for ${g.industry} · ${g.workflowType}.`
  })

  const go = id => {
    setStep(id); setVisited(v => new Set(v).add(id))
    history.replaceState(null, '', `${location.search}#${id}`); window.scrollTo({ top: 0 })
  }
  const current = sheetOf(step)

  /** Every sheet: number + title, general notes, content, and the sheet it continues on. */
  const sheet = (id, children) => {
    const n = SHEETS.findIndex(s => s.id === id)
    const s = SHEETS[n], next = SHEETS[n + 1]
    return (
      <section key={id} id={`sheet-${id}`} aria-labelledby={`title-${id}`} hidden={step !== id} className="sheet-body">
        <header className="sheet-head">
          <span className="sheet-no">{s.no}</span>
          <h2 id={`title-${id}`}>{s.title}</h2>
        </header>
        <aside className="notes" aria-label="General notes">
          <h3>General notes</h3>
          <ol>{s.notes.map((t, k) => <li key={k}>{t}</li>)}</ol>
        </aside>
        {children}
        {next && id !== 'overview' && (
          <footer className="continue">
            <button type="button" className="btn-continue" onClick={() => go(next.id)}>
              <span>Continued on sheet</span>
              <b>{next.no}</b> {next.title} <Icon name="arrow" size={18} />
            </button>
          </footer>
        )}
      </section>
    )
  }

  return (
    <div className="drawing">
      <a className="skip" href="#sheet">Skip to sheet</a>
      <main id="sheet" className="sheet" tabIndex={-1}>
        <div className="zones zones-x" aria-hidden="true">{[1, 2, 3, 4, 5, 6].map(z => <span key={z}>{z}</span>)}</div>
        <div className="zones zones-y" aria-hidden="true">{['A', 'B', 'C', 'D'].map(z => <span key={z}>{z}</span>)}</div>
        {sheet('overview', <Cover groups={groups} g={g} go={go} />)}
        {g && <>
          {sheet('sources', <Sources key={gKey} g={g} run={run} busy={busy} openDoc={openDoc} onUploaded={loadGroups} fail={fail} />)}
          {sheet('blueprint', <Blueprint bp={bp} setBp={setBp} g={g} openDoc={openDoc} fail={fail} />)}
          {sheet('eval', <Accuracy key={gKey} g={g} run={run} busy={busy} />)}
          {sheet('gap', <GapCheck key={gKey} g={g} run={run} busy={busy} setStatus={setStatus} />)}
          {sheet('agent', <Agent g={g} hasBlueprint={!!bp} openDoc={openDoc} fail={fail} setStatus={setStatus} />)}
        </>}
      </main>

      <aside className="titleblock" aria-label="Title block">
        <div className="tb-cell tb-brand">
          <p className="tb-name">Blueprint<wbr />Forge <span>AI</span></p>
          <p className="tb-tag">Evidence-backed industry blueprints for recruiting-system implementations</p>
        </div>

        <div className="tb-cell">
          <label className="tb-label" htmlFor="project">Project</label>
          <select id="project" value={sel} onChange={e => setSel(+e.target.value)}>
            {groups.map((x, i) => <option key={i} value={i}>{x.industry} · {x.workflowType} ({x.docCount} docs)</option>)}
          </select>
          <div className="tb-issue">
            <label className="check"><input type="checkbox" checked={force} onChange={e => setForce(e.target.checked)} /> Re-extract</label>
            <button type="button" className="btn-issue" disabled={busy || !g} onClick={generate}>Generate blueprint</button>
          </div>
        </div>

        <nav className="tb-cell" aria-label="Sheet index">
          <h2 className="tb-label">Sheet index</h2>
          <ol className="index">
            {SHEETS.map(s => (
              <li key={s.id}>
                <a href={`#${s.id}`} aria-current={step === s.id ? 'page' : undefined}
                   className={visited.has(s.id) && step !== s.id ? 'seen' : ''}
                   onClick={e => { e.preventDefault(); go(s.id) }}>
                  <span className="ix-no">{s.no}</span>
                  <span className="ix-title">{s.title}</span>
                  {visited.has(s.id) && step !== s.id && <Icon name="check" size={14} label="viewed" />}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="tb-cell tb-log">
          <h2 className="tb-label">Revisions &amp; notes</h2>
          <div role="status" aria-live="polite" className="log-live">
            {live && <><span className="plotter" aria-hidden="true" />{live.msg}</>}
          </div>
          <div className="log-head" aria-hidden="true"><span>Rev</span><span>Time</span><span>Description</span></div>
          <ol className="log">
            {log.map((l, k) => (
              <li key={k} className={l.error ? 'err' : ''}>
                <span className="log-rev">{String.fromCharCode(65 + ((log.length - 1 - k) % 26))}</span>
                <span className="log-at">{l.at}</span>
                <span className="log-msg">{l.msg}</span>
              </li>
            ))}
          </ol>
        </div>

        <dl className="tb-cell tb-grid">
          <div><dt>Drawn by</dt><dd>AI agent</dd></div>
          <div><dt>Checked by</dt><dd>Consultant</dd></div>
          <div><dt>Sheet</dt><dd className="mono">{current.no}</dd></div>
          <div><dt>Date</dt><dd>{today()}</dd></div>
          <div className="wide"><dt>Data</dt><dd>All customers are fictional</dd></div>
        </dl>
      </aside>

      <dialog ref={dialog} onClose={() => setDoc(null)} aria-labelledby="detail-title">
        <header className="detail-head">
          <span className="sheet-no">Detail</span>
          <h2 id="detail-title">{doc?.id}</h2>
          {doc?.quote && <span className="detail-legend"><mark>Highlighted</mark> = quote verified against this document</span>}
          <button type="button" className="btn-ghost" onClick={() => dialog.current.close()}><Icon name="cross" /> Close</button>
        </header>
        {doc && <pre><Highlighted text={doc.text} quote={doc.quote} /></pre>}
      </dialog>
    </div>
  )
}

/** The pipeline, drawn as a sequence of detail callouts; each one opens the sheet that shows it. */
const PIPELINE = [
  { title: 'Past implementations', text: 'Source documents per industry, with country and role', sheet: 'sources' },
  { title: 'Extraction + verbatim check', text: 'The AI quotes; code checks every quote against the source', sheet: 'blueprint' },
  { title: 'Industry blueprint', text: 'Code counts support per item and per country', sheet: 'blueprint' },
  { title: 'Consultant review', text: 'Approve, edit or reject every item', sheet: 'blueprint' },
  { title: 'Implementation agent', text: 'Gaps, questions, config, validation, UAT', sheet: 'agent' },
  { title: 'Handover', text: 'Config, tests and open items, stamped by a human', sheet: 'agent' },
]

function Cover({ groups, g, go }) {
  const [score, setScore] = useState(null) // measured accuracy for the open project (no AI calls)
  const gKey = g ? `${g.industry}/${g.workflowType}` : ''
  useEffect(() => {
    if (!g) return
    let on = true
    setScore(null)
    api(`/api/eval/${groupPath(g)}`).then(r => on && setScore(r), () => on && setScore(false))
    return () => { on = false }
  }, [gKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const docs = groups.reduce((a, x) => a + x.docCount, 0)
  const industries = new Set(groups.map(x => x.industry)).size
  const all = score ? score.scores.reduce((a, s) => ({ m: a.m + s.matched, x: a.x + s.extracted, e: a.e + s.expected }), { m: 0, x: 0, e: 0 }) : null
  const quoteRate = score ? score.quotesKept / Math.max(1, score.quotesKept + score.quotesDropped) : 0

  return (
    <div className="cover">
      <h1 className="cover-title">BlueprintForge AI</h1>
      <p className="cover-lede">
        Every new customer's hiring workflow gets configured from scratch, even though the same industry has been done
        dozens of times. BlueprintForge turns past implementations into an evidence-backed industry blueprint, then an
        Implementation Agent takes a new customer from kickoff notes to a validated configuration, with a consultant
        approving every decision.
      </p>

      <ol className="section-line" aria-label="How it works">
        {PIPELINE.map((p, n) => (
          <li key={n}>
            <Callout top={n + 1} bottom={sheetOf(p.sheet).no} onClick={() => go(p.sheet)} title={`Open sheet ${sheetOf(p.sheet).no}`} />
            <b>{p.title}</b>
            <span>{p.text}</span>
          </li>
        ))}
      </ol>

      <div className="cover-data">
        <section aria-labelledby="measured">
          <h3 id="measured">Measured on {g ? `${g.industry} · ${g.workflowType}` : 'the open project'}</h3>
          {score === null && <p className="muted">Measuring…</p>}
          {score === false && <p className="muted">Not measured yet: generate this project's blueprint, then open sheet Q-301.</p>}
          {all && <>
            <Dimension share={all.m / Math.max(1, all.e)} label={`Recall ${pct(all.m / Math.max(1, all.e))}`} title="Answer-key items the AI found" />
            <Dimension share={all.m / Math.max(1, all.x)} label={`Precision ${pct(all.m / Math.max(1, all.x))}`} title="Extracted items that are correct" />
            <Dimension share={quoteRate} label={`Quotes verified ${pct(quoteRate)}`} title="Quotes found word for word in the source" />
            <p className="muted small">Scored against a hand-checked answer key across {score.docsEvaluated} documents.</p>
          </>}
        </section>
        <table className="schedule compact">
          <caption>Project data</caption>
          <tbody>
            <tr><th scope="row">Scenarios</th><td className="num">{groups.length}</td></tr>
            <tr><th scope="row">Industries</th><td className="num">{industries}</td></tr>
            <tr><th scope="row">Source documents</th><td className="num">{docs}</td></tr>
          </tbody>
        </table>
      </div>

      <button type="button" className="btn-issue big" onClick={() => go('sources')}>
        Open sheet S-101 <Icon name="arrow" size={18} />
      </button>
    </div>
  )
}

function Highlighted({ text, quote }) {
  const at = quote ? text.toLowerCase().indexOf(quote.toLowerCase()) : -1
  if (at < 0) return text
  return <>{text.slice(0, at)}<mark>{text.slice(at, at + quote.length)}</mark>{text.slice(at + quote.length)}</>
}
