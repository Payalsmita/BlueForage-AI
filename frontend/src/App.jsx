import { useEffect, useRef, useState } from 'react'
import { api, groupPath } from './api.js'
import Blueprint from './Blueprint.jsx'
import { Accuracy, GapCheck, Sources } from './Panels.jsx'
import Agent from './Agent.jsx'

/** The guided demo flow: one numbered step per page. */
const STEPS = [
  { id: 'overview', label: 'Overview', sub: 'What BlueprintForge does',
    explain: 'The big picture: how past implementations become a reviewed blueprint, and how the agent uses it for a new customer.' },
  { id: 'sources', label: 'Sources', sub: 'Past implementations',
    explain: 'These are the past implementation documents for the selected scenario. Add more here (PDF, DOCX and PPTX are converted to Markdown).' },
  { id: 'blueprint', label: 'Blueprint', sub: 'Review the industry template',
    explain: 'The AI pulled stages, roles and approval rules from every source doc. Code counted how many implementations contain each one and verified every quote. Approve, edit or reject each item.' },
  { id: 'eval', label: 'Accuracy', sub: 'Prove it against an answer key',
    explain: 'We scored the AI\'s extractions against a hand-checked answer key. No AI calls are made on this page.' },
  { id: 'gap', label: 'Gap check', sub: 'Quick check of a new customer',
    explain: 'A one-shot comparison of a new customer\'s notes with the blueprint: what they are missing, what is unique to them and what already matches.' },
  { id: 'agent', label: 'Implementation Agent', sub: 'Kickoff notes → handover',
    explain: 'The agent takes a new customer from kickoff notes to a validated configuration, UAT tests and a handover pack. It pauses for a consultant to answer questions and to approve the result.' },
]

export default function App() {
  const [groups, setGroups] = useState([])
  const [sel, setSel] = useState(0)
  // step lives in the URL hash so a refresh or a shared link keeps the place in the demo
  const [step, setStep] = useState(() => STEPS.some(s => `#${s.id}` === location.hash) ? location.hash.slice(1) : 'overview')
  const [status, setStatus] = useState({ msg: '', error: false })
  const [busy, setBusy] = useState(false)
  const [force, setForce] = useState(false)
  const [bp, setBp] = useState(null)
  const [doc, setDoc] = useState(null) // { id, text, quote }
  const dialog = useRef(null)
  const g = groups[sel]
  const gKey = g ? `${g.industry}/${g.workflowType}` : ''

  const fail = e => setStatus({ msg: e.message, error: true })

  /** Runs fn with an elapsed-seconds status line. fn may return a message to show when done. */
  async function run(label, fn) {
    const t0 = Date.now()
    const secs = () => Math.round((Date.now() - t0) / 1000)
    const tick = () => setStatus({ msg: `${label}… ${secs()}s`, error: false })
    tick()
    const id = setInterval(tick, 1000)
    setBusy(true)
    try {
      const msg = await fn()
      setStatus({ msg: typeof msg === 'string' ? msg : `Done in ${secs()}s.`, error: false })
    } catch (e) { fail(e) } finally { clearInterval(id); setBusy(false) }
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
    let live = true // ignore a slow response for a scenario the user already left
    setBp(null)
    api(`/api/blueprints/${groupPath(g)}`).then(b => live && setBp(b), e => { if (live && e.status !== 404) fail(e) })
    return () => { live = false }
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
  })

  const go = id => { setStep(id); history.replaceState(null, '', `#${id}`); window.scrollTo({ top: 0 }) }
  const idx = STEPS.findIndex(s => s.id === step)

  /** Every page: explainer on top, "Next" at the bottom. Pages stay mounted so their state survives navigation. */
  const page = (id, children) => {
    const n = STEPS.findIndex(s => s.id === id)
    const next = STEPS[n + 1]
    return (
      <section key={id} id={`page-${id}`} aria-labelledby={`step-${id}`} hidden={step !== id}>
        <h2 className="page-title"><span className="stepnum">{n}</span>{STEPS[n].label}</h2>
        <p className="explain"><b>What's happening here:</b> {STEPS[n].explain}</p>
        {children}
        {next && id !== 'overview' && <div className="next"><button className="primary" onClick={() => go(next.id)}>Next: {next.label} →</button></div>}
      </section>
    )
  }

  return (
    <>
      <header className="top">
        <h1>BlueprintForge AI <span>evidence-backed industry blueprints</span></h1>
        <div className="controls">
          <select aria-label="Scenario" value={sel} onChange={e => setSel(+e.target.value)}>
            {groups.map((x, i) => <option key={i} value={i}>{x.industry} · {x.workflowType} ({x.docCount})</option>)}
          </select>
          <label className="row" style={{ fontSize: 13, color: 'var(--muted)' }}>
            <input type="checkbox" checked={force} onChange={e => setForce(e.target.checked)} /> re-extract
          </label>
          <button className="primary" disabled={busy || !g} onClick={generate}>Generate blueprint</button>
        </div>
      </header>
      <div className={`status${status.error ? ' error' : ''}`} role="status" aria-live="polite">{status.msg}</div>
      <div className="layout">
        <nav className="rail" aria-label="Demo steps">
          <ol>
            {STEPS.map((s, n) => (
              <li key={s.id}>
                <button id={`step-${s.id}`} aria-current={step === s.id ? 'step' : undefined}
                        className={n < idx ? 'done' : ''} onClick={() => go(s.id)}>
                  <span className="stepnum">{n}</span>
                  <span className="lbl">{s.label}<small>{s.sub}</small></span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
        <main>
          {page('overview', <Overview groups={groups} onStart={() => go('sources')} />)}
          {g && <>
            {page('sources', <Sources key={gKey} g={g} run={run} busy={busy} openDoc={openDoc} onUploaded={loadGroups} fail={fail} />)}
            {page('blueprint', <Blueprint bp={bp} setBp={setBp} g={g} openDoc={openDoc} fail={fail} />)}
            {page('eval', <Accuracy key={gKey} g={g} run={run} busy={busy} />)}
            {page('gap', <GapCheck key={gKey} g={g} run={run} busy={busy} setStatus={setStatus} />)}
            {page('agent', <Agent g={g} hasBlueprint={!!bp} openDoc={openDoc} fail={fail} setStatus={setStatus} />)}
          </>}
        </main>
      </div>
      <dialog ref={dialog} onClose={() => setDoc(null)}>
        <header><strong>{doc?.id}</strong><button className="small" style={{ marginLeft: 'auto' }} onClick={() => dialog.current.close()}>Close</button></header>
        {doc && <pre><Highlighted text={doc.text} quote={doc.quote} /></pre>}
      </dialog>
    </>
  )
}

const PIPELINE = [
  ['Past implementations', '35 fictional customer docs, 7 industries'],
  ['AI extraction + verbatim check', 'every quote must exist in the source'],
  ['Industry blueprint', 'code counts support per country'],
  ['Consultant review', 'approve · edit · reject'],
  ['New customer: Implementation Agent', 'gaps → questions → config → validate → UAT'],
  ['Handover', 'config + tests + open items, approved by a human'],
]

function Overview({ groups, onStart }) {
  const docs = groups.reduce((a, x) => a + x.docCount, 0)
  const industries = new Set(groups.map(x => x.industry)).size
  return (
    <>
      <p className="pitch">
        Every new customer's hiring workflow gets configured from scratch, even though the same industry has been done dozens of times.
        <b> BlueprintForge AI</b> turns past implementations into an evidence-backed industry blueprint, then uses an
        <b> Implementation Agent</b> to take a new customer from kickoff notes to a validated configuration, with a consultant approving every decision.
      </p>
      <ol className="pipeline" aria-label="How it works">
        {PIPELINE.map(([t, s], n) => <li key={n}><b>{t}</b><span>{s}</span></li>)}
      </ol>
      <div className="stats">
        <div className="stat"><div className="big">{groups.length}</div><div>scenarios (industry × role)</div></div>
        <div className="stat"><div className="big">{industries}</div><div>industries</div></div>
        <div className="stat"><div className="big">{docs}</div><div>past implementation documents</div></div>
      </div>
      <button className="primary big-btn" onClick={onStart}>Start →</button>
    </>
  )
}

function Highlighted({ text, quote }) {
  const at = quote ? text.toLowerCase().indexOf(quote.toLowerCase()) : -1
  if (at < 0) return text
  return <>{text.slice(0, at)}<mark>{text.slice(at, at + quote.length)}</mark>{text.slice(at + quote.length)}</>
}
