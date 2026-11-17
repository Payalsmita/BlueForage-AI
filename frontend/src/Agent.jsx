import { useEffect, useRef, useState } from 'react'
import { KIND, SAMPLES, api, json, pct } from './api.js'
import { Findings } from './Panels.jsx'
import { Callout, Delta, Dimension, Icon, Stamp, Tag, Verified } from './Draft.jsx'

/** Words and tags for every enum value the run returns. */
const LABEL = {
  RUNNING: 'Drawing', WAITING_FOR_ANSWERS: 'Hold: answers', WAITING_FOR_APPROVAL: 'Hold: approval', COMPLETED: 'Approved',
  REJECTED: 'Rejected', FAILED: 'Failed', CUSTOMER_STATED: 'Customer stated', PEER_CONFIRMED: 'Peer practice, confirmed',
  CUSTOM: 'Customer-specific', DERIVED: 'Added by agent', INCLUDE: 'Include', EXCLUDE: 'Exclude', UNSURE: 'Unsure',
  POSITIVE: 'Positive', NEGATIVE: 'Negative', EDGE: 'Edge', PASS: 'Pass', WARN: 'Warn', FAIL: 'Fail', MISSING: 'Missing', UNIQUE: 'Unique',
}
const KINDOF = {
  RUNNING: 'ink', WAITING_FOR_ANSWERS: 'hold', WAITING_FOR_APPROVAL: 'hold', COMPLETED: 'ink', REJECTED: 'redline', FAILED: 'redline',
  CUSTOMER_STATED: 'ink', PEER_CONFIRMED: 'ink', CUSTOM: 'ink', DERIVED: 'redline',
  INCLUDE: 'ink', EXCLUDE: 'redline', UNSURE: 'hold', POSITIVE: 'ink', NEGATIVE: 'redline', EDGE: 'ink',
  PASS: 'ink', WARN: 'hold', FAIL: 'redline', MISSING: 'redline', UNIQUE: 'ink',
}
const T = ({ v, children }) => <Tag kind={KINDOF[v] || 'muted'} icon={v === 'PASS' || v === 'COMPLETED' ? 'check' : v === 'FAIL' || v === 'REJECTED' ? 'cross' : v?.startsWith?.('WAITING') ? 'pause' : undefined}>{children ?? LABEL[v] ?? v}</Tag>

/** The construction sequence, mapped to the tools the agent calls or the hold it waits in. */
const PHASES = [
  { label: 'Understand', tools: ['plan', 'extract_requirements', 'self_check'] },
  { label: 'Compare', tools: ['gap_check'] },
  { label: 'Ask', tools: ['draft_questions'] },
  { label: 'Consultant answers', hold: 'WAITING_FOR_ANSWERS', doneWhen: r => r.answers?.length > 0 || r.decisions?.length > 0 },
  { label: 'Decide', tools: ['apply_answers'] },
  { label: 'Configure', tools: ['draft_config'] },
  { label: 'Validate & revise', tools: ['validate_config', 'revise_config'], loop: true },
  { label: 'Test', tools: ['generate_uat'] },
  { label: 'Handover', tools: ['handover'] },
  { label: 'Consultant approval', hold: 'WAITING_FOR_APPROVAL', doneWhen: r => r.status === 'COMPLETED', failWhen: r => r.status === 'REJECTED' },
]

function phaseState(p, run) {
  const steps = run.steps || []
  if (p.hold) {
    if (run.status === p.hold) return 'hold'
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
  const lastStatus = useRef('')
  const [form, setForm] = useState({ customerName: '', geography: '', notes: '' })
  const [sending, setSending] = useState(false)

  const loadRuns = () => api('/api/runs').then(r => { setRuns(r); setUnavailable(false) },
    e => (e.status === 404 || e.status === 405 ? setUnavailable(true) : fail(e)))
  useEffect(() => { loadRuns() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Poll the selected run every 1.5 s while the agent is drawing.
  useEffect(() => {
    if (!runId) return
    let live = true, timer
    const tick = async () => {
      try {
        const r = await api(`/api/runs/${encodeURIComponent(runId)}`)
        if (!live) return
        setRun(r)
        if (lastStatus.current !== `${r.id}:${r.status}`) { // log each status change in the title block's revision table
          lastStatus.current = `${r.id}:${r.status}`
          setStatus({ msg: `${r.customerName} (${r.id}): ${LABEL[r.status] || r.status}.`, error: r.status === 'FAILED' })
        }
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
        <form className="field-form job-form" onSubmit={start} aria-labelledby="new-job">
          <h3 id="new-job" className="col-head">New implementation</h3>
          <p className="muted small">Project: <b>{g.industry} · {g.workflowType}</b> (change it in the title block).</p>
          {!hasBlueprint && <p className="hold-note"><Icon name="pause" size={14} /> Generate this project's blueprint first.</p>}
          <label className="field">Customer name<input type="text" required value={form.customerName} onChange={set('customerName')} placeholder="e.g. Polar Wings" /></label>
          <label className="field">Country<input type="text" required size="6" value={form.geography} onChange={set('geography')} placeholder="e.g. CA" /></label>
          <label className="field">Kickoff notes or requirements<textarea required value={form.notes} onChange={set('notes')} /></label>
          <div className="field-row">
            <button type="button" className="btn-small" onClick={loadSample}><Icon name="doc" size={14} /> Load sample customer</button>
            <button className="btn-issue" disabled={sending || unavailable}>{sending ? 'Starting…' : 'Run agent'}</button>
          </div>
        </form>

        <h3 className="col-head">Jobs <span className="mono">{runs.length}</span></h3>
        {unavailable && <p className="none">The agent API isn't available on this backend. Restart the backend after updating it.</p>}
        {!unavailable && runs.length === 0 && <p className="none">No jobs yet.</p>}
        <ul className="jobs">
          {[...runs].reverse().map(r => (
            <li key={r.id}>
              <button type="button" aria-current={r.id === runId ? 'true' : undefined} onClick={() => { setRunId(r.id); setRun(null) }}>
                <span className="job-top"><b>{r.customerName}</b><T v={r.status} /></span>
                <span className="mono small muted">{r.id} · {r.geography} · {r.createdAt ? new Date(r.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="agent-main">
        {!run
          ? <div className="empty"><p>{runId ? 'Loading job…' : 'Start a job or open one from the list. The agent\'s sequence, reasoning and drawings appear here.'}</p></div>
          : <RunView run={run} send={send} openDoc={openDoc} />}
      </div>
    </div>
  )
}

function RunView({ run, send, openDoc }) {
  const steps = [...(run.steps || [])].sort((a, b) => a.n - b.n)
  const finished = run.status !== 'RUNNING'
  return (
    <>
      <header className="job-head">
        <div>
          <h3>{run.customerName}</h3>
          <p className="mono small muted">{run.id} · {run.industry} · {run.workflowType} · {run.geography}</p>
        </div>
        <T v={run.status} />
        <span className="mono job-clock">{dur(secs(run.createdAt, finished ? run.updatedAt : null))}</span>
      </header>
      {run.status === 'FAILED' && <p className="hold-note err"><Icon name="cross" size={16} /> <b>The agent stopped:</b> {run.error || 'unknown error'}</p>}
      {run.status === 'WAITING_FOR_ANSWERS' && <p className="hold-note"><Icon name="pause" size={16} /> <b>Hold.</b> The agent is waiting for the consultant's answers. <a href="#art-questions">Answer the questions</a></p>}
      {run.status === 'WAITING_FOR_APPROVAL' && <p className="hold-note"><Icon name="pause" size={16} /> <b>Hold.</b> The handover is ready for the consultant's approval. <a href="#art-handover">Review and stamp it</a></p>}

      <ol className="sequence" aria-label="Construction sequence">
        {PHASES.map((p, n) => {
          const st = phaseState(p, run)
          return (
            <li key={p.label} className={`seq-${st}${p.hold ? ' seq-holdpoint' : ''}${p.loop && run.revisions > 0 ? ' seq-revised cloud' : ''}`}>
              <span className="seq-n mono">{n + 1}</span>
              <span className="seq-label">{p.label}{p.loop && run.revisions > 0 && <> <Delta n={run.revisions} title={`Revised ${run.revisions} time(s)`} /></>}</span>
              <span className="seq-state">{st === 'hold' ? 'hold' : st}</span>
            </li>
          )
        })}
      </ol>

      <Timeline steps={steps} />
      <Artifacts run={run} send={send} openDoc={openDoc} />
    </>
  )
}

/** Time axis: each step's bar is as long as it took; reasoning and result beside it. */
function Timeline({ steps }) {
  const box = useRef(null)
  const last = steps.at(-1)?.status
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight }, [steps.length, last])
  const lens = steps.map(s => secs(s.startedAt, s.status === 'RUNNING' ? null : s.finishedAt) ?? 0)
  const max = Math.max(5, ...lens)
  return (
    <section className="sub" aria-labelledby="activity">
      <h3 id="activity" className="col-head">Agent activity <span className="mono">{steps.length}</span></h3>
      <ol className="timeline" ref={box}>
        {steps.length === 0 && <li className="muted">Waiting for the agent to start…</li>}
        {steps.map((s, k) => (
          <li key={s.n} className={`tl-${s.status}${s.tool === 'revise_config' ? ' cloud' : ''}`}>
            <span className="tl-n mono">{String(s.n).padStart(2, '0')}</span>
            <div className="tl-body">
              <div className="tl-head">
                <code className="tl-tool">{s.tool}</code>
                <b className="tl-title">{s.title}</b>
                {s.tool === 'revise_config' && <Delta n={steps.slice(0, k + 1).filter(x => x.tool === 'revise_config').length} title="Revision by the agent" />}
                {s.status === 'FAILED' && <Tag kind="redline" icon="cross">Failed</Tag>}
              </div>
              <div className="tl-bar">
                <span className="tl-track"><span style={{ width: pct(lens[k] / max) }} className={s.status === 'RUNNING' ? 'plotting' : ''} /></span>
                <span className="mono tl-dur">{dur(lens[k])}</span>
              </div>
              {s.reasoning && <p className="tl-reason"><span>Agent note</span> {s.reasoning}</p>}
              {s.summary && <p className="tl-sum">{s.summary}</p>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** A sub-drawing of the job; open by default and only rendered once its data exists. */
const Sub = ({ id, title, badge, children }) => (
  <details className="sub" id={id} open>
    <summary><h3 className="col-head">{title} {badge}</h3></summary>
    {children}
  </details>
)

const Quotes = ({ qs }) => qs?.length ? <ul className="quotes">{qs.map((q, k) => <li key={k}><Verified>{q}</Verified></li>)}</ul> : null

function Artifacts({ run, send, openDoc }) {
  const req = run.requirements
  const base = `/api/runs/${encodeURIComponent(run.id)}`
  return (
    <>
      {req && (
        <Sub title="Requirements from the notes" badge={run.selfCheckAdded > 0 && <Tag kind="ink" icon="check">Self-check recovered {run.selfCheckAdded}</Tag>}>
          <div className="schedules">
            <table className="schedule">
              <caption>Hiring stages</caption>
              <thead><tr><th scope="col" className="num">No.</th><th scope="col">Stage</th></tr></thead>
              <tbody>{(req.stages || []).map((s, n) => <tr key={n}><td className="num">{s.order}</td><td>{s.name}<Quotes qs={s.quotes} /></td></tr>)}</tbody>
            </table>
            <table className="schedule">
              <caption>Roles</caption>
              <thead><tr><th scope="col">Role</th><th scope="col">Responsibilities</th></tr></thead>
              <tbody>{(req.roles || []).map((r, n) => <tr key={n}><td>{r.name}<Quotes qs={r.quotes} /></td><td>{(r.responsibilities || []).join('; ')}</td></tr>)}</tbody>
            </table>
            <table className="schedule">
              <caption>Approval rules</caption>
              <thead><tr><th scope="col">Trigger</th><th scope="col">Approvers</th></tr></thead>
              <tbody>{(req.approvalRules || []).map((r, n) => <tr key={n}><td>{r.trigger}<Quotes qs={r.quotes} /></td><td>{(r.approvers || []).join(', ')}</td></tr>)}</tbody>
            </table>
          </div>
        </Sub>
      )}

      {run.gaps && <Sub title="Gap analysis"><Findings findings={run.gaps.findings} /></Sub>}

      {run.questions && <Questions run={run} send={send} />}

      {run.decisions?.length > 0 && (
        <Sub title="Decisions" badge={<span className="mono">{run.decisions.length}</span>}>
          <table className="schedule">
            <thead><tr><th scope="col">Item</th><th scope="col">Decision</th><th scope="col">Rationale</th></tr></thead>
            <tbody>
              {run.decisions.map((d, n) => (
                <tr key={n}>
                  <th scope="row">{d.itemName}</th>
                  <td><T v={d.choice} /> {d.interpretedByAgent && <Tag kind="muted">AI-interpreted</Tag>}</td>
                  <td>{d.rationale}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Sub>
      )}

      {run.finalItems?.length > 0 && (
        <Sub title="Final requirements" badge={<span className="mono">{run.finalItems.length}</span>}>
          <div className="schedules">
            {Object.keys(KIND).map(k => {
              const items = run.finalItems.filter(i => i.kind === k)
              return (
                <section key={k} className="schedule-col" aria-label={KIND[k]}>
                  <h4 className="col-head">{KIND[k]} <span className="mono">{items.length}</span></h4>
                  <ol className="entries">
                    {items.map(i => (
                      <li className={`entry${i.source === 'DERIVED' ? ' cloud' : ''}`} key={i.ref}>
                        <div className="entry-head">
                          <span className="mono entry-id">{i.ref}</span>
                          <h5 className="entry-name">{i.name}</h5>
                          <span className="entry-status"><T v={i.source} /></span>
                        </div>
                        {i.peerSupport && <p className="entry-line"><span>Peers</span> <b className="mono">{i.peerSupport}</b>{i.blueprintItemId ? <> · <span className="mono">{i.blueprintItemId}</span></> : ''}</p>}
                        {i.approvers?.length > 0 && <p className="entry-line"><span>Approvers</span> {i.approvers.join(', ')}</p>}
                        {i.evidence?.length > 0 && (
                          <details className="evidence">
                            <summary>Evidence <span className="mono">{i.evidence.length}</span></summary>
                            <ol>
                              {i.evidence.map((e, n) => (
                                <li key={n}>
                                  {e.docId && e.docId !== 'CUSTOMER'
                                    ? <Callout top={n + 1} bottom={e.docId} onClick={() => openDoc(e.docId, e.quote)} title={`Open ${e.docId} at this quote`} />
                                    : <Callout top={n + 1} bottom="NOTES" title="From the customer's notes" />}
                                  <Verified>{e.quote}</Verified>
                                </li>
                              ))}
                            </ol>
                          </details>
                        )}
                      </li>
                    ))}
                  </ol>
                </section>
              )
            })}
          </div>
        </Sub>
      )}

      {run.config && (
        <Sub title="Configuration" badge={<><Tag kind="muted">Mock iCIMS format</Tag> <a className="small-link" href={`${base}/config.json`} target="_blank" rel="noreferrer">config.json <Icon name="open" size={13} /></a></>}>
          <pre className="json">{JSON.stringify(run.config, null, 2)}</pre>
        </Sub>
      )}

      {run.validation && <Validation v={run.validation} revisions={run.revisions} />}

      {run.uat && <Uat uat={run.uat} cov={run.uatCoverage} />}

      {(['WAITING_FOR_APPROVAL', 'COMPLETED', 'REJECTED'].includes(run.status) || run.steps?.some(x => x.tool === 'handover' && x.status === 'DONE')) && (
        <Sub id="art-handover" title="Handover">
          <div className="handover">
            <div>
              <p className="field-row">
                <a href={`${base}/handover.md`} target="_blank" rel="noreferrer">handover.md <Icon name="open" size={13} /></a>
                <a href={`${base}/config.json`} target="_blank" rel="noreferrer">config.json <Icon name="open" size={13} /></a>
              </p>
              {run.openItems?.length > 0 && <>
                <h4 className="col-head">Open items <span className="mono">{run.openItems.length}</span></h4>
                <ol className="open-items">{run.openItems.map((o, n) => <li key={n}>{o}</li>)}</ol>
              </>}
              {run.status === 'WAITING_FOR_APPROVAL' && <Approval send={send} />}
            </div>
            {run.status === 'COMPLETED' && (
              <div className="stamp-wrap">
                <Stamp title="Approved for implementation" line={run.approvalComment || 'Checked by consultant'}
                       date={run.updatedAt ? new Date(run.updatedAt).toLocaleDateString(undefined, { dateStyle: 'medium' }) : ''} />
              </div>
            )}
            {run.status === 'REJECTED' && (
              <div className="stamp-wrap">
                <Stamp tone="reject" title="Rejected" line={run.approvalComment || 'Returned by consultant'} />
              </div>
            )}
          </div>
        </Sub>
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
    <Sub id="art-questions" title="Questions for the customer" badge={<span className="mono">{run.questions.length}</span>}>
      {run.questions.length === 0 && <p className="none">The agent had nothing to ask.</p>}
      <form onSubmit={submit} className="questions">
        <ol className="entries">
          {run.questions.map(q => (
            <li key={q.id} className="entry">
              <fieldset disabled={!waiting}>
                <legend className="entry-head">
                  <span className="mono entry-id">{q.id}</span>
                  <span className="entry-name">{q.itemName}</span>
                  <span className="entry-status"><T v={q.findingType} /></span>
                </legend>
                <p className="q-text">{q.question}</p>
                {q.why && <p className="entry-line"><span>Why</span> {q.why}</p>}
                {waiting && <>
                  <div className="choices" role="radiogroup" aria-label={`Decision for ${q.id}`}>
                    {['INCLUDE', 'EXCLUDE', 'UNSURE'].map(c => (
                      <label key={c} className={`choice${a[q.id]?.choice === c ? ' on' : ''}`}>
                        <input type="radio" name={`q-${q.id}`} checked={a[q.id]?.choice === c} onChange={() => setQ(q.id, { choice: c })} /> {LABEL[c]}
                      </label>
                    ))}
                  </div>
                  <input type="text" className="q-note" aria-label={`Note for ${q.id}`} placeholder="Optional note"
                         value={a[q.id]?.note || ''} onChange={e => setQ(q.id, { note: e.target.value })} />
                </>}
              </fieldset>
            </li>
          ))}
        </ol>
        {waiting && run.questions.length > 0 && <>
          <label className="field">Or paste the customer's reply
            <span className="muted small">Sent for every question left without a choice; the agent interprets it and marks those decisions AI-interpreted.</span>
            <textarea value={reply} onChange={e => setReply(e.target.value)} />
          </label>
          <button className="btn-issue" disabled={sending}>{sending ? 'Sending…' : 'Send answers to the agent'}</button>
        </>}
      </form>
    </Sub>
  )
}

function Validation({ v, revisions }) {
  const count = s => v.filter(x => x.severity === s).length
  return (
    <Sub title="Validation" badge={<>
      <Tag kind="ink" icon="check">{count('PASS')} pass</Tag> <Tag kind="hold">{count('WARN')} warn</Tag> <Tag kind="redline" icon="cross">{count('FAIL')} fail</Tag>
    </>}>
      {revisions > 0 && <p className="entry-line"><Delta n={revisions} /> The agent revised the configuration {revisions} time{revisions > 1 ? 's' : ''} and checked it again.</p>}
      <table className="schedule">
        <thead><tr><th scope="col">Check</th><th scope="col">Result</th><th scope="col">Details</th></tr></thead>
        <tbody>
          {v.map((x, n) => (
            <tr key={x.id || n}>
              <th scope="row">{x.check}{x.ref && <span className="mono small muted"> {x.ref}</span>}</th>
              <td><T v={x.severity} />{x.autoFixable && <> <Tag kind="muted">Auto-fixable</Tag></>}</td>
              <td>{x.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Sub>
  )
}

function Uat({ uat, cov }) {
  return (
    <Sub title="UAT test cases" badge={<span className="mono">{uat.length}</span>}>
      {cov && <Dimension share={cov.covered / Math.max(1, cov.total)} label={`${cov.covered}/${cov.total} requirements covered`} />}
      {cov?.uncovered?.length > 0 && <p className="hold-note"><Icon name="pause" size={14} /> Not covered: {cov.uncovered.join(', ')}</p>}
      <table className="schedule">
        <thead><tr><th scope="col">ID</th><th scope="col">Req.</th><th scope="col">Type</th><th scope="col">Test</th><th scope="col">Expected</th></tr></thead>
        <tbody>
          {uat.map((t, n) => (
            <tr key={t.id || n}>
              <td className="mono">{t.id}</td>
              <td className="mono">{t.requirementRef}</td>
              <td><T v={t.type} /></td>
              <td><b>{t.title}</b><ol className="steps">{(t.steps || []).map((s, k) => <li key={k}>{s}</li>)}</ol></td>
              <td>{t.expected}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Sub>
  )
}

function Approval({ send }) {
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)
  const decide = async approved => { setSending(true); await send('approval', { approved, comment }); setSending(false) }
  return (
    <div className="approval">
      <h4 className="col-head">Consultant approval</h4>
      <label className="field">Comment (optional)<textarea value={comment} onChange={e => setComment(e.target.value)} /></label>
      <div className="field-row">
        <button type="button" className="btn-issue" disabled={sending} onClick={() => decide(true)}>Approve and stamp</button>
        <button type="button" className="btn-small" disabled={sending} onClick={() => decide(false)}><Icon name="cross" size={14} /> Reject</button>
      </div>
    </div>
  )
}
