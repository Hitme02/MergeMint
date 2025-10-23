const fetch = global.fetch || ((...args) => import('node-fetch').then(({default:f}) => f(...args)));

async function main() {
  const username = process.argv[2] || process.env.GH_USER || '';
  if (!username) {
    console.error('Usage: node scripts/dev_webhook.js <github_username>');
    process.exit(1);
  }
  const payload = {
    action: 'closed',
    pull_request: {
      merged: true,
      additions: 6,
      deletions: 0,
      head: { sha: 'deadbeefcafebabe' },
      user: { login: username }
    },
    repository: { owner: { login: 'accordproject' }, name: 'template-archive' }
  };
  const res = await fetch('http://localhost:4000/dev/webhook', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  const text = await res.text();
  console.log(res.status, text);
}

main().catch((e) => { console.error(e); process.exit(1); });
