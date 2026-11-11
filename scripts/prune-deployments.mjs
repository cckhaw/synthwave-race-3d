#!/usr/bin/env node
// Deletes every Vercel deployment of this project except the newest READY
// production deployment. Requires VERCEL_TOKEN and VERCEL_PROJECT_ID
// (plus VERCEL_TEAM_ID / VERCEL_ORG_ID for team-owned projects).

const { VERCEL_TOKEN, VERCEL_PROJECT_ID } = process.env;
const teamId = process.env.VERCEL_TEAM_ID || process.env.VERCEL_ORG_ID || '';

if (!VERCEL_TOKEN || !VERCEL_PROJECT_ID) {
  console.error('VERCEL_TOKEN and VERCEL_PROJECT_ID are required.');
  process.exit(1);
}

const API = 'https://api.vercel.com';
const team = teamId.startsWith('team_') ? `&teamId=${teamId}` : '';

async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
  });
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path.split('?')[0]} -> ${res.status} ${await res.text()}`);
  return res.json();
}

async function listDeployments() {
  const all = [];
  let until = '';
  for (;;) {
    const page = await api(`/v6/deployments?projectId=${VERCEL_PROJECT_ID}&limit=100${team}${until}`);
    all.push(...page.deployments);
    if (!page.pagination?.next) break;
    until = `&until=${page.pagination.next}`;
  }
  return all.sort((a, b) => b.created - a.created);
}

const deployments = await listDeployments();
const keep = deployments.find((d) => d.target === 'production' && d.state === 'READY');

if (!keep) {
  console.error('No READY production deployment found — refusing to delete anything.');
  process.exit(1);
}

console.log(`Keeping ${keep.uid} (https://${keep.url})`);
let failed = 0;
for (const d of deployments) {
  if (d.uid === keep.uid) continue;
  try {
    await api(`/v13/deployments/${d.uid}?${team.slice(1)}`, { method: 'DELETE' });
    console.log(`Deleted ${d.uid} (${d.target || 'preview'}, ${d.state})`);
  } catch (err) {
    failed++;
    console.error(`Failed to delete ${d.uid}: ${err.message}`);
  }
}
console.log(`Done. ${deployments.length - 1 - failed} deleted, ${failed} failed.`);
process.exit(failed ? 1 : 0);
