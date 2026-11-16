import { useEffect, useRef, useState } from 'react'
import { KIND, SAMPLES, api, json, pct } from './api.js'
import { Findings } from './Panels.jsx'

/** Colour for any enum value the run returns. */
const TONE = {
  RUNNING: 'brand', WAITING_FOR_ANSWERS: 'warn', WAITING_FOR_APPROVAL: 'warn', COMPLETED: 'ok', REJECTED: 'bad', FAILED: 'bad',
  DONE: 'ok', PASS: 'ok', WARN: 'warn', FAIL: 'bad', POSITIVE: 'ok', NEGATIVE: 'bad', EDGE: 'warn',
  INCLUDE: 'ok', EXCLUDE: 'bad', UNSURE: 'warn', CUSTOMER_STATED: 'brand', PEER_CONFIRMED: 'ok', CUSTOM: 'warn',
  MISSING: 'bad', UNIQUE: 'warn', ALIGNED: 'ok',
}
const Pill = ({ v, children }) => <span className={`pill tone-${TONE[v] || 'none'}`}>{children ?? String(v ?? '').toLowerCase().replaceAll('_', ' ')}</span>

/** The agent's phases, mapped to the tools it calls (steps[].tool) or the run status it waits in. */
const PHASES = [
  { label: 'Understand', tools: ['plan', 'extract_requirements', 'self_check'] },
  { label: 'Compare', tools: ['gap_check'] },
  { label: 'Ask', tools: ['draft_questions'] },
  { label: '⏸ Consultant answers', wait: 'WAITING_FOR_ANSWERS', doneWhen: r => r.answers?.length > 0 || r.decisions?.length > 0 },
  { label: 'Decide', tools: ['apply_answers'] },
  { label: 'Configure', tools: ['draft_config'] },
  { label: 'Validate ↺ Revise', tools: ['validate_config', 'revise_config'], loop: true },
  { label: 'Test (UAT)', tools: ['generate_uat'] },
  { label: 'Handover', tools: ['handover'] },
  { label: '⏸ Consultant approval', wait: 'WAITING_FOR_APPROVAL', doneWhen: r => r.status === 'COMPLETED', failWhen: r => r.status === 'REJECTED' },
]

function phaseState(p, run) {
  const steps = run.steps || []
  if (p.wait) {
    if (run.status === p.wait) return 'waiting'
    if (p.failWhen?.(run)) return 'failed'
    return p.doneWhen(run) ? 'done' : 'pending'
  }
  const mine = steps.filter(s => p.tools.includes(s.tool))
  if (mine.some(s => s.status === 'RUNNING')) return 'active'
  if (mine.some(s => s.status === 'FAILED')) return 'failed'
  return mine.length ? 'done' : 'pending'
}

const secs = (a, b) => (a ? Math.max(0, Math.round(((b ? Date.parse(b) : Date.now()) - Date.parse(a)) / 1000)) : null)
const dur = s => (s == null ? '' : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`)

export default function Agent({ g, hasBlueprint, openDoc, fail, setStatus }) {
  const [runs, setRuns] = useState([])
  const [unavailable, setUnavailable] = useState(false)
  // ?run=<id> opens a run directly (shareable link for the demo)
  const [runId, setRunIdState] = useState(() => new URLSearchParams(location.search).get('run'))
  const setRunId = id => {
    setRunIdState(id)
    const q = new URLSearchParams(location.search); q.set('run', id)
    history.replaceState(null, '', `?${q}${location.hash}`)
  }
  const [run, setRun] = useState(null)
  const [poll, setPoll] = useState(0) // bump to resume polling after answers/approval
  const [form, setForm] = useState({ customerName: '', geography: '', notes: '' })
  const [sending, setSending] = useState(false)

  const loadRuns = () => api('/api/runs').then(r => { setRuns(r); setUnavailable(false) },
    e => (e.status === 404 || e.status === 405 ? setUnavailable(true) : fail(e)))
  useEffect(() => { loadRuns() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Poll the selected run every 1.5 s while the agent is working.
  useEffect(() => {
    if (!runId) return
    let live = true, timer
    const tick = async () => {
      try {
        const r = await api(`/api/runs/${encodeURIComponent(runId)}`)
        if (!live) return
        setRun(r)
        if (r.status === 'RUNNING') timer = setTimeout(tick, 1500)
        else loadRuns()
      } catch (e) { if (live) fail(e) }
    }
    tick()
    return () => { live = false; clearTimeout(timer) }
  }, [runId, poll]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadSample() {
    const s = SAMPLES[g.industry]
    if (!s) return setStatus({ msg: `No sample customer for ${g.industry}; paste your own notes.`, error: false })
    try { setForm({ customerName: s.name, geography: s.geo, notes: await api(s.file) }) } catch (e) { fail(e) }
  }

  async function start(e) {
    e.preventDefault()
    setSending(true)
    try {
      const r = await api('/api/runs', json({ industry: g.industry, workflowType: g.workflowType, ...form }))
      setRun(r); setRunId(r.id); setPoll(p => p + 1); loadRuns()
      setStatus({ msg: `Agent started for ${r.customerName}.`, error: false })
    } catch (err) { fail(err) } finally { setSending(false) }
  }

  /** POST answers/approval, then resume polling. */
  async function send(path, body) {
    try { setRun(await api(`/api/runs/${encodeURIComponent(run.id)}/${path}`, json(body))); setPoll(p => p + 1) } catch (e) { fail(e) }
  }

  const set = k => e => setForm({ ...form, [k]: e.target.value })

  return (
    <div className="agent">
      <aside className="agent-side">
        <form className="card agent-form" onSubmit={start}>
          <h2>New implementation</h2>
          <p className="hint">Scenario: <b>{g.industry} · {g.workflowType}</b> (change it in the header).
            {!hasBlueprint && <><br /><span className="warn-text">Generate this scenario's blueprint first.</span></>}</p>
          <label>Customer name<input type="text" required value={form.customerName} onChange={set('customerName')} placeholder="e.g. Polar Wings" /></label>
          <label>Country<input type="text" required size="5" value={form.geography} onChange={set('geography')} placeholder="e.g. CA" /></label>
          <label>Kickoff notes / requirements<textarea required value={form.notes} onChange={set('notes')} style={{ minHeight: 160 }} /></label>
          <div className="row">
            <button type="button" className="small" onClick={loadSample}>Load sample customer</button>
            <button className="primary" disabled={sending || unavailable} style={{ marginLeft: 'auto' }}>{sending ? 'Starting…' : 'Run agent'}</button>
          </div>
        </form>
        <h2 style={{ marginTop: 20 }}>Runs <small>{runs.length}</small></h2>
        {unavailable && <div className="empty" style={{ padding: 16 }}>The agent API isn't available on this backend yet. Restart the backend after updating it.</div>}
        {!unavailable && runs.length === 0 && <div className="empty" style={{ padding: 16 }}>No runs yet.</div>}
        <ul className="runs">
          {[...runs].reverse().map(r => (
            <li key={r.id}>
              <button className={r.id === runId ? 'sel' : ''} aria-current={r.id === runId ? 'true' : undefined} onClick={() => { setRunId(r.id); setRun(null) }}>
                <span className="row"><b>{r.customerName}</b><Pill v={r.status} /></span>
                <small>{r.industry} · {r.workflowType} · {r.geography} · {r.createdAt ? new Date(r.createdAt).toLocaleString() : ''}</small>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <div className="agent-main">
        {!run
          ? <div className="empty">{runId ? 'Loading run…' : 'Start a run or pick one from the list. The agent\'s phases, reasoning and outputs appear here.'}</div>
          : <RunView run={run} send={send} openDoc={openDoc} />}
      </div>
    </div>
  )
}

function RunView({ run, send, openDoc }) {
  const steps = [...(run.steps || [])].sort((a, b) => a.n - b.n)
  const finished = !['RUNNING'].includes(run.status)
  return (
    <>
      <div className="run-head">
        <div>
          <h2 style={{ margin: 0 }}>{run.customerName}</h2>
          <small>{run.industry} · {run.workflowType} · {run.geography}</small>
        </div>
        <Pill v={run.status} />
        <span className="hint" style={{ margin: 0 }}>elapsed {dur(secs(run.createdAt, finished ? run.updatedAt : null))}</span>
      </div>
      {run.status === 'FAILED' && <div className="banner bad"><b>Agent failed:</b> {run.error || 'unknown error'}</div>}
      {run.status === 'WAITING_FOR_ANSWERS' && <div className="banner warn">⏸ The agent is waiting for a consultant to answer its questions (see <a href="#art-questions">Questions</a>).</div>}
      {run.status === 'WAITING_FOR_APPROVAL' && <div className="banner warn">⏸ The handover is ready and waiting for consultant approval (see <a href="#art-handover">Handover</a>).</div>}

      <ol className="phases" aria-label="Agent phases">
        {PHASES.map(p => {
          const st = phaseState(p, run)
          return (
            <li key={p.label} className={st}>
              <span className="dot" aria-hidden="true" />
              {p.label}{p.loop && run.revisions > 0 ? ` (${run.revisions}×)` : ''}
              <small>{st}</small>
            </li>
          )
        })}
      </ol>

      <Timeline steps={steps} />
      <Artifacts run={run} send={send} openDoc={openDoc} />
    </>
  )
}

function Timeline({ steps }) {
  const box = useRef(null)
  const last = steps.at(-1)?.status
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight }, [steps.length, last])
  return (
    <div className="art">
      <h2>Agent activity <small>{steps.length} steps</small></h2>
      <ol className="timeline" ref={box}>
        {steps.length === 0 && <li className="hint">Waiting for the agent to start…</li>}
        {steps.map(s => (
          <li key={s.n} className={s.status}>
            <div className="row">
              <span className="id">#{s.n}</span>
              <code className="tool">{s.tool}</code>
              <b>{s.title}</b>
              {s.status === 'RUNNING' ? <span className="spinner" aria-label="running" /> : <Pill v={s.status} />}
              <span className="hint" style={{ margin: 0 }}>{dur(secs(s.startedAt, s.finishedAt))}</span>
            </div>
            {s.reasoning && <p className="reason"><i>Agent: {s.reasoning}</i></p>}
            {s.summary && <p className="sum">{s.summary}</p>}
          </li>
        ))}
      </ol>
    </div>
  )
}

/** Collapsible card, open by default; only rendered once its data exists. */
const Art = ({ id, title, badge, children }) => (
  <details className="art" id={id} open>
    <summary><h2>{title} {badge}</h2></summary>
    {children}
  </details>
)

const Quotes = ({ qs }) => qs?.length ? <ul className="ev">{qs.map((q, k) => <li key={k}>“{q}”</li>)}</ul> : null

function Artifacts({ run, send, openDoc }) {
  const req = run.requirements
  const base = `/api/runs/${encodeURIComponent(run.id)}`
  return (
    <>
      {req && (
        <Art title="Requirements" badge={run.selfCheckAdded > 0 && <Pill v="DONE">self-check recovered {run.selfCheckAdded}</Pill>}>
          <div className="cols">
            <table>
              <caption>Hiring stages</caption>
              <thead><tr><th>#</th><th>Stage</th></tr></thead>
              <tbody>{(req.stages || []).map((s, n) => <tr key={n}><td className="num">{s.order}</td><td>{s.name}<Quotes qs={s.quotes} /></td></tr>)}</tbody>
            </table>
            <table>
              <caption>Roles</caption>
              <thead><tr><th>Role</th><th>Responsibilities</th></tr></thead>
              <tbody>{(req.roles || []).map((r, n) => <tr key={n}><td>{r.name}<Quotes qs={r.quotes} /></td><td>{(r.responsibilities || []).join('; ')}</td></tr>)}</tbody>
            </table>
            <table>
              <caption>Approval rules</caption>
              <thead><tr><th>Trigger</th><th>Approvers</th></tr></thead>
              <tbody>{(req.approvalRules || []).map((r, n) => <tr key={n}><td>{r.trigger}<Quotes qs={r.quotes} /></td><td>{(r.approvers || []).join(', ')}</td></tr>)}</tbody>
            </table>
          </div>
        </Art>
      )}

      {run.gaps && <Art title="Gap analysis"><Findings findings={run.gaps.findings} /></Art>}

      {run.questions && <Questions run={run} send={send} />}

      {run.decisions?.length > 0 && (
        <Art title="Decisions" badge={<small>{run.decisions.length}</small>}>
          <table>
            <thead><tr><th>Item</th><th>Decision</th><th>Rationale</th></tr></thead>
            <tbody>
              {run.decisions.map((d, n) => (
                <tr key={n}>
                  <td>{d.itemName}</td>
                  <td><Pill v={d.choice} /> {d.interpretedByAgent && <Pill v="UNIQUE">AI-interpreted</Pill>}</td>
                  <td>{d.rationale}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Art>
      )}

      {run.finalItems?.length > 0 && (
        <Art title="Final requirements" badge={<small>{run.finalItems.length}</small>}>
          <div className="cols">
            {Object.keys(KIND).map(k => {
              const items = run.finalItems.filter(i => i.kind === k)
              return (
                <div key={k}>
                  <h2>{KIND[k]} <small>{items.length}</small></h2>
                  {items.map(i => (
                    <div className="card" key={i.ref}>
                      <div className="row"><span className="id">{i.ref}</span><span className="name">{i.name}</span><Pill v={i.source} /></div>
                      {i.peerSupport && <div className="conf">peers: {i.peerSupport}{i.blueprintItemId ? ` · ${i.blueprintItemId}` : ''}</div>}
                      {i.approvers?.length > 0 && <div className="approvers">Approvers: {i.approvers.join(', ')}</div>}
                      {i.evidence?.length > 0 && (
                        <details>
                          <summary>Evidence ({i.evidence.length})</summary>
                          <ul className="ev">
                            {i.evidence.map((e, n) => (
                              <li key={n}>“{e.quote}” —{' '}
                                {e.docId && e.docId !== 'CUSTOMER' ? <button onClick={() => openDoc(e.docId, e.quote)}>{e.docId}</button> : (e.docId || 'customer')}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </Art>
      )}

      {run.config && (
        <Art title="Configuration (mock iCIMS)" badge={<a className="small-link" href={`${base}/config.json`} target="_blank" rel="noreferrer">open config.json</a>}>
          <pre className="json">{JSON.stringify(run.config, null, 2)}</pre>
        </Art>
      )}

      {run.validation && <Validation v={run.validation} revisions={run.revisions} />}

      {run.uat && <Uat uat={run.uat} cov={run.uatCoverage} />}

      {(['WAITING_FOR_APPROVAL', 'COMPLETED', 'REJECTED'].includes(run.status) || run.steps?.some(x => x.tool === 'handover' && x.status === 'DONE')) && (
        <Art id="art-handover" title="Handover">
          <p className="row">
            <a href={`${base}/handover.md`} target="_blank" rel="noreferrer">handover.md</a> ·
            <a href={`${base}/config.json`} target="_blank" rel="noreferrer">config.json</a>
          </p>
          {run.openItems?.length > 0 && <>
            <h3>Open items <small>{run.openItems.length}</small></h3>
            <ul>{run.openItems.map((o, n) => <li key={n}>{o}</li>)}</ul>
          </>}
          {run.status === 'WAITING_FOR_APPROVAL' && <Approval send={send} />}
          {['COMPLETED', 'REJECTED'].includes(run.status) && (
            <p><Pill v={run.status}>{run.status === 'COMPLETED' ? 'approved by consultant' : 'rejected by consultant'}</Pill> {run.approvalComment}</p>
          )}
        </Art>
      )}
    </>
  )
}

function Questions({ run, send }) {
  const [a, setA] = useState({}) // questionId -> { choice, note }
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const waiting = run.status === 'WAITING_FOR_ANSWERS'
  const setQ = (id, patch) => setA(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))

  async function submit(e) {
    e.preventDefault()
    setSending(true)
    const answers = run.questions.map(q => {
      const x = a[q.id] || {}
      return { questionId: q.id, choice: x.choice || null, text: x.note?.trim() || (!x.choice && reply.trim()) || null }
    })
    await send('answers', { answers })
    setSending(false)
  }

  return (
    <Art id="art-questions" title="Questions for the customer" badge={<small>{run.questions.length}</small>}>
      {run.questions.length === 0 && <p className="hint">The agent had nothing to ask.</p>}
      <form onSubmit={submit}>
        {run.questions.map(q => (
          <fieldset key={q.id} className="card q" disabled={!waiting}>
            <legend className="row"><span className="id">{q.id}</span><Pill v={q.findingType} /> <b>{q.itemName}</b>
              {q.peerSupport && <span className="hint" style={{ margin: 0 }}>peers: {q.peerSupport}</span>}</legend>
            <p style={{ margin: '4px 0' }}>{q.question}</p>
            {q.why && <p className="hint">Why: {q.why}</p>}
            {waiting && <>
              <div className="row">
                {['INCLUDE', 'EXCLUDE', 'UNSURE'].map(c => (
                  <label key={c} className="radio">
                    <input type="radio" name={`q-${q.id}`} checked={a[q.id]?.choice === c} onChange={() => setQ(q.id, { choice: c })} /> {c.toLowerCase()}
                  </label>
                ))}
              </div>
              <input type="text" aria-label={`Note for ${q.id}`} placeholder="Optional note" value={a[q.id]?.note || ''}
                     onChange={e => setQ(q.id, { note: e.target.value })} style={{ width: '100%', marginTop: 6 }} />
            </>}
          </fieldset>
        ))}
        {waiting && run.questions.length > 0 && <>
          <label className="stack">Paste the customer's reply <small className="hint">(optional; sent for every question you left without a choice, and the agent interprets it)</small>
            <textarea value={reply} onChange={e => setReply(e.target.value)} style={{ minHeight: 100 }} />
          </label>
          <button className="primary" disabled={sending}>{sending ? 'Sending…' : 'Send answers to the agent'}</button>
        </>}
      </form>
    </Art>
  )
}

function Validation({ v, revisions }) {
  const count = s => v.filter(x => x.severity === s).length
  return (
    <Art title="Validation" badge={<>
      <Pill v="PASS">{count('PASS')} pass</Pill> <Pill v="WARN">{count('WARN')} warn</Pill> <Pill v="FAIL">{count('FAIL')} fail</Pill>
    </>}>
      {revisions > 0 && <p className="hint">The agent revised the configuration {revisions} time{revisions > 1 ? 's' : ''} to fix failed checks.</p>}
      <table>
        <thead><tr><th>Check</th><th>Result</th><th>Details</th></tr></thead>
        <tbody>
          {v.map((x, n) => (
            <tr key={x.id || n}>
              <td>{x.check}{x.ref && <div className="id">{x.ref}</div>}</td>
              <td><Pill v={x.severity} />{x.autoFixable && <> <Pill v="EDGE">auto-fixable</Pill></>}</td>
              <td>{x.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Art>
  )
}

function Uat({ uat, cov }) {
  return (
    <Art title="UAT test cases" badge={<small>{uat.length}</small>}>
      {cov && (
        <div className="conf" style={{ maxWidth: 520 }}>
          <div className="bar" role="img" aria-label={pct(cov.covered / Math.max(1, cov.total))}><i style={{ width: pct(cov.covered / Math.max(1, cov.total)) }} /></div>
          {cov.covered}/{cov.total} requirements covered
        </div>
      )}
      {cov?.uncovered?.length > 0 && <p className="warn-text">Not covered: {cov.uncovered.join(', ')}</p>}
      <table>
        <thead><tr><th>ID</th><th>Requirement</th><th>Type</th><th>Test</th><th>Expected</th></tr></thead>
        <tbody>
          {uat.map((t, n) => (
            <tr key={t.id || n}>
              <td className="id">{t.id}</td>
              <td className="id">{t.requirementRef}</td>
              <td><Pill v={t.type} /></td>
              <td><b>{t.title}</b><ol className="steps">{(t.steps || []).map((s, k) => <li key={k}>{s}</li>)}</ol></td>
              <td>{t.expected}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Art>
  )
}

function Approval({ send }) {
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)
  const decide = async approved => { setSending(true); await send('approval', { approved, comment }); setSending(false) }
  return (
    <div className="approval">
      <h3>Consultant approval</h3>
      <textarea aria-label="Approval comment" placeholder="Comment (optional)" value={comment} onChange={e => setComment(e.target.value)} style={{ minHeight: 70 }} />
      <div className="row">
        <button className="primary" disabled={sending} onClick={() => decide(true)}>Approve handover</button>
        <button disabled={sending} onClick={() => decide(false)}>Reject</button>
      </div>
    </div>
  )
}
