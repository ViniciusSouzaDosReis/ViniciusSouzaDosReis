// Gera assets/stats-dark.svg e assets/stats-light.svg a partir da API do GitHub.
// Sem dependências: Node 18+. Rodado pelo workflow .github/workflows/stats.yml.
const LOGIN = process.env.GH_LOGIN || 'ViniciusSouzaDosReis';
const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) { console.error('GITHUB_TOKEN ausente'); process.exit(1); }

const QUERY = `
query($login:String!, $cursor:String){
  user(login:$login){
    createdAt
    contributionsCollection{ contributionCalendar{ totalContributions } }
    repositories(first:100, after:$cursor, ownerAffiliations:OWNER, isFork:false, privacy:PUBLIC){
      totalCount
      pageInfo{ hasNextPage endCursor }
      nodes{ primaryLanguage{ name } }
    }
  }
}`;

async function gql(cursor) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: QUERY, variables: { login: LOGIN, cursor } }),
  });
  if (!res.ok) throw new Error(`GitHub respondeu ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data.user;
}

async function collect() {
  let cursor = null, user = null, langs = new Map(), total = 0;
  do {
    user = await gql(cursor);
    total = user.repositories.totalCount;
    for (const r of user.repositories.nodes) {
      const l = r.primaryLanguage?.name;
      if (l) langs.set(l, (langs.get(l) || 0) + 1);
    }
    cursor = user.repositories.pageInfo.hasNextPage ? user.repositories.pageInfo.endCursor : null;
  } while (cursor);

  const ranked = [...langs].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  const withLang = ranked.reduce((s, l) => s + l.count, 0);
  return {
    repos: total,
    contributions: user.contributionsCollection.contributionCalendar.totalContributions,
    since: new Date(user.createdAt).getUTCFullYear(),
    languages: ranked.length,
    top: ranked.slice(0, 5).map(l => ({ ...l, pct: l.count / withLang })),
    topRest: Math.max(0, withLang - ranked.slice(0, 5).reduce((s, l) => s + l.count, 0)) / (withLang || 1),
  };
}

// Pastéis para o tema escuro; os mesmos matizes dessaturados e mais profundos
// para o tema claro, onde pastel puro não teria contraste suficiente.
const RAMPS = {
  dark:  ['#7FC9BA', '#94D0A9', '#A9D69C', '#BEDC96', '#D3E290'],
  light: ['#3E9C8A', '#4C9F81', '#5BA377', '#71A663', '#86A94E'],
};
const GRADS = {
  dark:  { de: '#8ED1C0', para: '#A9D6A0', fim: '#CFE39B' },
  light: { de: '#3E9C8A', para: '#5BA377', fim: '#7A9B45' },
};
const br = n => n.toLocaleString('pt-BR');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function svg(d, dark) {
  const RAMP = RAMPS[dark ? 'dark' : 'light'];
  const G = GRADS[dark ? 'dark' : 'light'];
  const c = dark
    ? { bg: '#0D1117', card: '#0F141B', border: '#1F2A36', label: '#6E7B8B', value: '#E6EDF3', dim: '#8B96A5', track: '#1B2430' }
    : { bg: '#FFFFFF', card: '#FBFCFD', border: '#D8DEE6', label: '#6E7781', value: '#1F2328', dim: '#57606A', track: '#EAEEF2' };

  const tiles = [
    { v: br(d.repos), l: 'REPOSITÓRIOS PÚBLICOS' },
    { v: br(d.contributions), l: 'CONTRIBUIÇÕES / 12 MESES' },
    { v: br(d.languages), l: 'LINGUAGENS EM USO' },
    { v: String(d.since), l: 'NO GITHUB DESDE' },
  ];

  const tileSvg = tiles.map((t, i) => {
    const x = 44 + i * 232;
    return `  <text x="${x}" y="106" fill="url(#sneon)" font-family="ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif" font-size="42" font-weight="800">${t.v}</text>
  <text x="${x}" y="130" fill="${c.label}" font-family="ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace" font-size="10" letter-spacing="1.6">${t.l}</text>`;
  }).join('\n');

  const BAR_X = 44, BAR_W = 912, GAP = 3;
  let cursor = BAR_X;
  const segs = d.top.map((l, i) => {
    const w = Math.max(6, l.pct * (BAR_W - GAP * d.top.length));
    const s = `  <rect class="seg" style="animation-delay:${(0.12 * i).toFixed(2)}s" x="${cursor.toFixed(1)}" y="176" width="${w.toFixed(1)}" height="10" rx="5" fill="${RAMP[i]}"/>`;
    cursor += w + GAP;
    return s;
  }).join('\n');

  const legend = d.top.map((l, i) => {
    const x = BAR_X + i * 184;
    return `  <circle cx="${x + 4}" cy="209" r="4" fill="${RAMP[i]}"/>
  <text x="${x + 16}" y="213" fill="${c.dim}" font-family="ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace" font-size="12">${esc(l.name)} <tspan fill="${c.label}">${Math.round(l.pct * 100)}%</tspan></text>`;
  }).join('\n');

  const updated = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 240" width="1000" height="240" role="img" aria-label="Atividade de ${esc(LOGIN)} no GitHub">
  <title>Atividade no GitHub — ${br(d.repos)} repositórios públicos, ${br(d.contributions)} contribuições em 12 meses</title>
  <defs>
    <linearGradient id="sneon" x1="0" y1="0" x2="1" y2="0" gradientUnits="objectBoundingBox">
      <stop offset="0%" stop-color="${G.de}"/><stop offset="100%" stop-color="${G.para}"/>
    </linearGradient>
    <linearGradient id="stop" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${G.de}"/><stop offset="55%" stop-color="${G.para}"/><stop offset="100%" stop-color="${G.fim}"/>
    </linearGradient>
    <style>
      @keyframes grow { from { transform: scaleX(0) } to { transform: scaleX(1) } }
      .seg { transform-box: fill-box; transform-origin: left center;
             animation: grow .8s cubic-bezier(.2,.8,.2,1) both; }
      @media (prefers-reduced-motion: reduce) { .seg { animation: none } }
    </style>
  </defs>
  <rect width="1000" height="240" rx="12" fill="${c.card}" stroke="${c.border}"/>
  <rect x="12" y="0" width="976" height="3" rx="1.5" fill="url(#stop)"/>
  <text x="44" y="48" fill="${c.dim}" font-family="ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace" font-size="12" letter-spacing="4">ATIVIDADE NO GITHUB</text>
  <text x="956" y="48" text-anchor="end" fill="${c.label}" font-family="ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace" font-size="11">atualizado em ${updated}</text>
${tileSvg}
  <text x="44" y="162" fill="${c.label}" font-family="ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace" font-size="10" letter-spacing="1.6">LINGUAGEM PRINCIPAL POR REPOSITÓRIO</text>
  <rect x="${BAR_X}" y="176" width="${BAR_W}" height="10" rx="5" fill="${c.track}"/>
${segs}
${legend}
</svg>
`;
}

const { writeFileSync } = await import('node:fs');
const data = await collect();
writeFileSync('assets/stats-dark.svg', svg(data, true));
writeFileSync('assets/stats-light.svg', svg(data, false));
console.log('stats gerados:', JSON.stringify(data));
