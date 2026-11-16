export const KIND = { STAGE: 'Hiring stages', ROLE: 'Roles', APPROVAL_RULE: 'Approval rules' }
export const pct = x => Math.round(x * 100) + '%'
export const groupPath = g => `${encodeURIComponent(g.industry)}/${encodeURIComponent(g.workflowType)}`

/** fetch wrapper: throws Error(message) using the backend's {"message": ...} body. */
export async function api(url, opts = {}) {
  const res = await fetch(url, opts)
  if (!res.ok) {
    let msg = res.statusText
    try { msg = (await res.json()).message || msg } catch { /* not JSON */ }
    const err = new Error(msg); err.status = res.status; throw err
  }
  return res.headers.get('content-type')?.includes('json') ? res.json() : res.text()
}

export const json = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
