// Miners config is stored as JSON in gm_settings under key 'miners_config'.
// If not set, returns the default 10-miner config.
const { verifyAdmin, cors } = require('./_auth');
const { getPool } = require('./_db');

const DEFAULT_MINERS = [
  { id: 1,  name: 'Stone Collector',     baseCost: 10,    dailyPct: 0.05, description: '' },
  { id: 2,  name: 'Copper Miner',        baseCost: 50,    dailyPct: 0.05, description: '' },
  { id: 3,  name: 'Ore Cart',            baseCost: 250,   dailyPct: 0.05, description: '' },
  { id: 4,  name: 'Crystal Hunter',      baseCost: 500,   dailyPct: 0.05, description: '' },
  { id: 5,  name: 'Forge Master',        baseCost: 1000,  dailyPct: 0.05, description: '' },
  { id: 6,  name: 'Mining Drone',        baseCost: 2000,  dailyPct: 0.08, description: '' },
  { id: 7,  name: 'Quantum Excavator',   baseCost: 5000,  dailyPct: 0.08, description: '' },
  { id: 8,  name: 'Satellite Extractor', baseCost: 10000, dailyPct: 0.08, description: '' },
  { id: 9,  name: 'Planet Miner',        baseCost: 15000, dailyPct: 0.08, description: '' },
  { id: 10, name: 'Gram Core Reactor',   baseCost: 20000, dailyPct: 0.08, description: '' },
];

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const db = getPool();
  const admin = await verifyAdmin(req, db);
  if (!admin) return res.status(403).json({ error: 'Forbidden' });

  if (req.method === 'GET') {
    try {
      const { rows } = await db.query(`SELECT value FROM gm_settings WHERE key = 'miners_config'`);
      const miners = rows[0] ? JSON.parse(rows[0].value) : DEFAULT_MINERS;
      return res.json(miners);
    } catch { return res.json(DEFAULT_MINERS); }
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { miners } = body || {};
    if (!Array.isArray(miners)) return res.status(400).json({ error: 'miners array required' });
    await db.query(
      `INSERT INTO gm_settings (key, value) VALUES ('miners_config', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify(miners)]
    );
    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
};
