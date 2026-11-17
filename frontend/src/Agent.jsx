import { useEffect, useRef, useState } from 'react'
import { KIND, SAMPLES, api, json, pct } from './api.js'
import { COLS, Empty, Ev, EvList, Findings, H2, HINT, ID, LINK, More, Pill, Quotes } from './Panels.jsx'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'

const FIELD = 'grid gap-1 text-muted-foreground'
const A = 'underline underline-offset-2'
const PHASE = {
  done: ['border-emerald-600', 'bg-emerald-600'],
  active: ['border-primary ring-2 ring-primary/20', 'bg-primary animate-pulse'],
  waiting: ['border-amber-500 bg-amber-50 dark:bg-amber-950/50', 'bg-amber-500 animate-pulse'],
  failed: ['border-destructive', 'bg-destructive'],
  pending: ['opacity-60', 'bg-border'],
}
const STEP = { DONE: 'border-l-emerald-600', RUNNING: 'border-l-primary bg-muted', FAILED: 'border-l-destructive bg-red-50 dark:bg-red-950/40' }

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
    <div className="grid items-start gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside>
        <Card size="sm">
          <CardHeader><CardTitle className="font-heading text-base">New implementation</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-2.5" onSubmit={start}>
              <p className={HINT}>Scenario: <b>{g.industry} · {g.workflowType}</b> (change it in the header).
                {!hasBlueprint && <><br /><span className="text-amber-700 dark:text-amber-400">Generate this scenario's blueprint first.</span></>}</p>
              <Label className={FIELD}>Customer name<Input required value={form.customerName} onChange={set('customerName')} placeholder="e.g. Polar Wings" /></Label>
              <Label className={FIELD}>Country<Input required className="w-24" value={form.geography} onChange={set('geography')} placeholder="e.g. CA" /></Label>
              <Label className={FIELD}>Kickoff notes / requirements<Textarea required className="min-h-40 font-mono" value={form.notes} onChange={set('notes')} /></Label>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={loadSample}>Load sample customer</Button>
                <Button type="submit" className="ml-auto" disabled={sending || unavailable}>{sending ? 'Starting…' : 'Run agent'}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
        <H2 count={runs.length} className="mt-5">Runs</H2>
        {unavailable && <Empty className="p-4">The agent API isn't available on this backend yet. Restart the backend after updating it.</Empty>}
        {!unavailable && runs.length === 0 && <Empty className="p-4">No runs yet.</Empty>}
        <ul className="grid gap-1.5">
          {[...runs].reverse().map(r => (
            <li key={r.id}>
              <Button variant="outline" aria-current={r.id === runId ? 'true' : undefined} onClick={() => { setRunId(r.id); setRun(null) }}
                      className="grid h-auto w-full justify-stretch gap-0.5 py-2 text-left whitespace-normal aria-[current=true]:border-primary aria-[current=true]:shadow-[inset_3px_0_0_var(--primary)]">
                <span className="flex flex-wrap items-center gap-2"><b>{r.customerName}</b><Pill v={r.status} className="ml-auto" /></span>
                <small className="font-normal text-muted-foreground">{r.industry} · {r.workflowType} · {r.geography} · {r.createdAt ? new Date(r.createdAt).toLocaleString() : ''}</small>
              </Button>
            </li>
          ))}
        </ul>
      </aside>
      <div className="min-w-0">
        {!run
          ? <Empty>{runId ? 'Loading run…' : 'Start a run or pick one from the list. The agent\'s phases, reasoning and outputs appear here.'}</Empty>
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
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div>
          <h2 className="font-heading text-lg font-semibold">{run.customerName}</h2>
          <small className="text-muted-foreground">{run.industry} · {run.workflowType} · {run.geography}</small>
        </div>
        <Pill v={run.status} />
        <span className={HINT}>elapsed {dur(secs(run.createdAt, finished ? run.updatedAt : null))}</span>
      </div>
      {run.status === 'FAILED' && <Alert variant="destructive" className="mb-3"><AlertDescription><b>Agent failed:</b> {run.error || 'unknown error'}</AlertDescription></Alert>}
      {run.status === 'WAITING_FOR_ANSWERS' && <Waiting>⏸ The agent is waiting for a consultant to answer its questions (see <a className={A} href="#art-questions">Questions</a>).</Waiting>}
      {run.status === 'WAITING_FOR_APPROVAL' && <Waiting>⏸ The handover is ready and waiting for consultant approval (see <a className={A} href="#art-handover">Handover</a>).</Waiting>}

      <ol className="mb-4 flex gap-1.5 overflow-x-auto pb-1.5" aria-label="Agent phases">
        {PHASES.map(p => {
          const st = phaseState(p, run)
          return (
            <li key={p.label} className={cn('grid min-w-28 flex-none gap-0.5 border bg-card px-2.5 py-2 text-xs font-semibold', PHASE[st][0])}>
              <span className={cn('size-2 rounded-full', PHASE[st][1])} aria-hidden="true" />
              {p.label}{p.loop && run.revisions > 0 ? ` (${run.revisions}×)` : ''}
              <small className="font-normal text-muted-foreground">{st}</small>
            </li>
          )
        })}
      </ol>

      <Impact run={run} steps={steps} />
      <Timeline steps={steps} />
      <Artifacts run={run} send={send} openDoc={openDoc} />
    </>
  )
}

/** Measured impact of this run. Only the manual baseline is an assumption, and it is labelled and editable. */
function Impact({ run, steps }) {
  const [baseline, setBaseline] = useState(16)
  const agentSecs = steps.reduce((a, s) => a + (secs(s.startedAt, s.finishedAt) || 0), 0)
  const items = run.finalItems || []
  const by = src => items.filter(i => i.source === src).length
  const fromPeers = by('PEER_CONFIRMED') + by('DERIVED')
  const fixes = (run.validation || []).filter(c => c.autoFixable).length
  if (!steps.length) return null
  return (
    <Card size="sm" className="mb-4 border-t-2 border-t-primary">
      <CardContent className="grid gap-3">
        <H2 className="mb-0">Impact of this run</H2>
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <Metric big={dur(agentSecs)} label="agent working time (excludes waiting for the consultant)" />
          <Metric big={items.length || '—'} label={`config items produced · ${by('CUSTOMER_STATED')} stated by customer, ${fromPeers} filled in from peer evidence, ${by('CUSTOM')} customer-specific`} />
          <Metric big={run.questions?.length ?? '—'} label="questions sent to the consultant (instead of a blank form)" />
          <Metric big={run.revisions ?? 0} label={`self-revisions after validation${fixes ? ` · ${fixes} auto-fixable checks` : ''}`} />
          <Metric big={run.uatCoverage ? `${run.uatCoverage.covered}/${run.uatCoverage.total}` : '—'} label={`requirements covered by ${run.uat?.length || 0} generated UAT tests`} />
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
          <Label htmlFor="baseline" className="text-muted-foreground">Manual baseline (assumption, edit it):</Label>
          <Input id="baseline" type="number" min="1" value={baseline} onChange={e => setBaseline(+e.target.value)} className="h-7 w-20" />
          <span>consultant hours to draft the same config + UAT by hand, vs <b className="text-foreground">{dur(agentSecs)}</b> of agent drafting plus the consultant's review.</span>
        </div>
      </CardContent>
    </Card>
  )
}

const Metric = ({ big, label }) => (
  <div className="grid max-w-56 gap-0.5"><b className="font-heading text-2xl">{big}</b><span className="text-xs text-muted-foreground">{label}</span></div>
)

function Timeline({ steps }) {
  const box = useRef(null)
  const last = steps.at(-1)?.status
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight }, [steps.length, last])
  return (
    <Card size="sm" className="mb-3.5">
      <CardContent>
        <H2 count={`${steps.length} steps`}>Agent activity</H2>
        <ol className="grid max-h-90 gap-2 overflow-auto" ref={box}>
          {steps.length === 0 && <li className={HINT}>Waiting for the agent to start…</li>}
          {steps.map(s => (
            <li key={s.n} className={cn('border-l-[3px] px-2.5 py-1', STEP[s.status])}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={ID}>#{s.n}</span>
                <code className="bg-muted px-1.5 font-mono text-[11px]">{s.tool}</code>
                <b>{s.title}</b>
                {s.status === 'RUNNING'
                  ? <span className="size-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" role="img" aria-label="running" />
                  : <Pill v={s.status} />}
                <span className={HINT}>{dur(secs(s.startedAt, s.finishedAt))}</span>
              </div>
              {s.reasoning && <p className="mt-1 text-muted-foreground"><i>Agent: {s.reasoning}</i></p>}
              {s.summary && <p className="mt-1">{s.summary}</p>}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}

const Waiting = ({ children }) => (
  <Alert className="mb-3 border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"><AlertDescription className="text-inherit">{children}</AlertDescription></Alert>
)

/** Collapsible card, open by default; only rendered once its data exists. */
const Art = ({ id, title, badge, children }) => (
  <Collapsible defaultOpen id={id} render={<Card size="sm" className="mb-3.5" />}>
    <CardContent>
      <CollapsibleTrigger className="group flex items-center gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span aria-hidden="true" className="text-muted-foreground transition-transform group-data-[panel-open]:rotate-90">▸</span>
        <H2 className="m-0 inline-flex items-center gap-2">{title} {badge}</H2>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2.5">{children}</CollapsibleContent>
    </CardContent>
  </Collapsible>
)

const Tbl = ({ caption, children }) => <Table className="border">{caption && <TableCaption className="mt-0 mb-2 caption-top text-left font-semibold text-foreground">{caption}</TableCaption>}{children}</Table>
const TH = ({ cols }) => <TableHeader><TableRow>{cols.map(c => <TableHead key={c}>{c}</TableHead>)}</TableRow></TableHeader>
const TD = ({ className, ...p }) => <TableCell className={cn('align-top whitespace-normal', className)} {...p} />

function Artifacts({ run, send, openDoc }) {
  const req = run.requirements
  const base = `/api/runs/${encodeURIComponent(run.id)}`
  return (
    <>
      {req && (
        <Art title="Requirements" badge={run.selfCheckAdded > 0 && <Pill v="DONE">self-check recovered {run.selfCheckAdded}</Pill>}>
          <div className={COLS}>
            <Tbl caption="Hiring stages">
              <TH cols={['#', 'Stage']} />
              <TableBody>{(req.stages || []).map((s, n) => <TableRow key={n}><TD className="tabular-nums">{s.order}</TD><TD>{s.name}<Quotes qs={s.quotes} /></TD></TableRow>)}</TableBody>
            </Tbl>
            <Tbl caption="Roles">
              <TH cols={['Role', 'Responsibilities']} />
              <TableBody>{(req.roles || []).map((r, n) => <TableRow key={n}><TD>{r.name}<Quotes qs={r.quotes} /></TD><TD>{(r.responsibilities || []).join('; ')}</TD></TableRow>)}</TableBody>
            </Tbl>
            <Tbl caption="Approval rules">
              <TH cols={['Trigger', 'Approvers']} />
              <TableBody>{(req.approvalRules || []).map((r, n) => <TableRow key={n}><TD>{r.trigger}<Quotes qs={r.quotes} /></TD><TD>{(r.approvers || []).join(', ')}</TD></TableRow>)}</TableBody>
            </Tbl>
          </div>
        </Art>
      )}

      {run.gaps && <Art title="Gap analysis"><Findings findings={run.gaps.findings} /></Art>}

      {run.questions && <Questions run={run} send={send} />}

      {run.decisions?.length > 0 && (
        <Art title="Decisions" badge={<Count n={run.decisions.length} />}>
          <Tbl>
            <TH cols={['Item', 'Decision', 'Rationale']} />
            <TableBody>
              {run.decisions.map((d, n) => (
                <TableRow key={n}>
                  <TD>{d.itemName}</TD>
                  <TD><Pill v={d.choice} /> {d.interpretedByAgent && <Pill v="UNIQUE">AI-interpreted</Pill>}</TD>
                  <TD>{d.rationale}</TD>
                </TableRow>
              ))}
            </TableBody>
          </Tbl>
        </Art>
      )}

      {run.finalItems?.length > 0 && (
        <Art title="Final requirements" badge={<Count n={run.finalItems.length} />}>
          <div className={COLS}>
            {Object.keys(KIND).map(k => {
              const items = run.finalItems.filter(i => i.kind === k)
              return (
                <div key={k} className="grid gap-2.5">
                  <H2 count={items.length} className="mb-0">{KIND[k]}</H2>
                  {items.map(i => (
                    <Card size="sm" key={i.ref}>
                      <CardContent className="grid gap-1.5">
                        <div className="flex flex-wrap items-center gap-2"><span className={ID}>{i.ref}</span><span className="font-semibold">{i.name}</span><Pill v={i.source} className="ml-auto" /></div>
                        {i.peerSupport && <div className="text-xs text-muted-foreground">peers: {i.peerSupport}{i.blueprintItemId ? ` · ${i.blueprintItemId}` : ''}</div>}
                        {i.approvers?.length > 0 && <div className="text-xs text-muted-foreground">Approvers: {i.approvers.join(', ')}</div>}
                        {i.evidence?.length > 0 && (
                          <More title={`Evidence (${i.evidence.length})`}>
                            <EvList>
                              {i.evidence.map((e, n) => (
                                <Ev key={n}>“{e.quote}” —{' '}
                                  {e.docId && e.docId !== 'CUSTOMER' ? <Button variant="link" className={LINK} onClick={() => openDoc(e.docId, e.quote)}>{e.docId}</Button> : (e.docId || 'customer')}
                                </Ev>
                              ))}
                            </EvList>
                          </More>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )
            })}
          </div>
        </Art>
      )}

      {run.config && (
        <Art title="Configuration (mock iCIMS)" badge={<a className={cn(A, 'font-mono text-xs font-normal')} href={`${base}/config.json`} target="_blank" rel="noreferrer">open config.json</a>}>
          <pre className="max-h-105 overflow-auto bg-muted p-3 font-mono text-xs/relaxed">{JSON.stringify(run.config, null, 2)}</pre>
        </Art>
      )}

      {run.validation && <Validation v={run.validation} revisions={run.revisions} />}

      {run.uat && <Uat uat={run.uat} cov={run.uatCoverage} />}

      {(['WAITING_FOR_APPROVAL', 'COMPLETED', 'REJECTED'].includes(run.status) || run.steps?.some(x => x.tool === 'handover' && x.status === 'DONE')) && (
        <Art id="art-handover" title="Handover">
          <p className="flex gap-2">
            <a className={A} href={`${base}/handover.md`} target="_blank" rel="noreferrer">handover.md</a> ·
            <a className={A} href={`${base}/config.json`} target="_blank" rel="noreferrer">config.json</a>
          </p>
          {run.openItems?.length > 0 && <>
            <H3>Open items <Count n={run.openItems.length} /></H3>
            <ul className="list-disc pl-5">{run.openItems.map((o, n) => <li key={n}>{o}</li>)}</ul>
          </>}
          {run.status === 'WAITING_FOR_APPROVAL' && <Approval send={send} />}
          {['COMPLETED', 'REJECTED'].includes(run.status) && (
            <p className="mt-3"><Pill v={run.status}>{run.status === 'COMPLETED' ? 'approved by consultant' : 'rejected by consultant'}</Pill> {run.approvalComment}</p>
          )}
        </Art>
      )}
    </>
  )
}

const Count = ({ n }) => <small className="font-mono text-xs font-normal text-muted-foreground">{n}</small>
const H3 = ({ children }) => <h3 className="mt-3 mb-1.5 font-heading text-sm font-semibold">{children}</h3>

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
    <Art id="art-questions" title="Questions for the customer" badge={<Count n={run.questions.length} />}>
      {run.questions.length === 0 && <p className={HINT}>The agent had nothing to ask.</p>}
      <form onSubmit={submit} className="grid gap-2.5">
        {run.questions.map(q => (
          <fieldset key={q.id} disabled={!waiting} className="grid gap-1.5 border p-3">
            <legend className="flex flex-wrap items-center gap-2 px-1"><span className={ID}>{q.id}</span><Pill v={q.findingType} /> <b>{q.itemName}</b>
              {q.peerSupport && <span className={HINT}>peers: {q.peerSupport}</span>}</legend>
            <p>{q.question}</p>
            {q.why && <p className={HINT}>Why: {q.why}</p>}
            {waiting && <>
              <RadioGroup aria-label={`Answer for ${q.id}`} value={a[q.id]?.choice ?? null} onValueChange={v => setQ(q.id, { choice: v })} className="flex flex-wrap gap-4">
                {['INCLUDE', 'EXCLUDE', 'UNSURE'].map(c => (
                  <Label key={c} className="font-normal"><RadioGroupItem value={c} /> {c.toLowerCase()}</Label>
                ))}
              </RadioGroup>
              <Input aria-label={`Note for ${q.id}`} placeholder="Optional note" value={a[q.id]?.note || ''} onChange={e => setQ(q.id, { note: e.target.value })} />
            </>}
          </fieldset>
        ))}
        {waiting && run.questions.length > 0 && <>
          <Label className={FIELD}><span>Paste the customer's reply <small>(optional; sent for every question you left without a choice, and the agent interprets it)</small></span>
            <Textarea className="min-h-25" value={reply} onChange={e => setReply(e.target.value)} />
          </Label>
          <div><Button type="submit" disabled={sending}>{sending ? 'Sending…' : 'Send answers to the agent'}</Button></div>
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
      {revisions > 0 && <p className={cn(HINT, 'mb-2')}>The agent revised the configuration {revisions} time{revisions > 1 ? 's' : ''} to fix failed checks.</p>}
      <Tbl>
        <TH cols={['Check', 'Result', 'Details']} />
        <TableBody>
          {v.map((x, n) => (
            <TableRow key={x.id || n}>
              <TD>{x.check}{x.ref && <div className={ID}>{x.ref}</div>}</TD>
              <TD><Pill v={x.severity} />{x.autoFixable && <> <Pill v="EDGE">auto-fixable</Pill></>}</TD>
              <TD>{x.message}</TD>
            </TableRow>
          ))}
        </TableBody>
      </Tbl>
    </Art>
  )
}

function Uat({ uat, cov }) {
  const share = cov ? cov.covered / Math.max(1, cov.total) : 0
  return (
    <Art title="UAT test cases" badge={<Count n={uat.length} />}>
      {cov && (
        <div className="mb-2 flex max-w-130 items-center gap-2 text-xs text-muted-foreground">
          <Progress value={share * 100} aria-label={pct(share)} className="flex-1" />
          {cov.covered}/{cov.total} requirements covered
        </div>
      )}
      {cov?.uncovered?.length > 0 && <p className="mb-2 text-amber-700 dark:text-amber-400">Not covered: {cov.uncovered.join(', ')}</p>}
      <Tbl>
        <TH cols={['ID', 'Requirement', 'Type', 'Test', 'Expected']} />
        <TableBody>
          {uat.map((t, n) => (
            <TableRow key={t.id || n}>
              <TD className={ID}>{t.id}</TD>
              <TD className={ID}>{t.requirementRef}</TD>
              <TD><Pill v={t.type} /></TD>
              <TD><b>{t.title}</b><ol className="mt-1 list-decimal pl-4.5">{(t.steps || []).map((s, k) => <li key={k}>{s}</li>)}</ol></TD>
              <TD>{t.expected}</TD>
            </TableRow>
          ))}
        </TableBody>
      </Tbl>
    </Art>
  )
}

function Approval({ send }) {
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)
  const decide = async approved => { setSending(true); await send('approval', { approved, comment }); setSending(false) }
  return (
    <div className="mt-3 grid max-w-160 gap-2 border-t pt-3">
      <H3>Consultant approval</H3>
      <Textarea aria-label="Approval comment" placeholder="Comment (optional)" className="min-h-18" value={comment} onChange={e => setComment(e.target.value)} />
      <div className="flex gap-2">
        <Button disabled={sending} onClick={() => decide(true)}>Approve handover</Button>
        <Button variant="outline" disabled={sending} onClick={() => decide(false)}>Reject</Button>
      </div>
    </div>
  )
}
