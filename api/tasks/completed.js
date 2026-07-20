// GET /api/tasks/completed
// Header: x-init-data  (matches what Tasks.tsx sends)
// Returns an array of task_id numbers the current user has completed.
const { verifyTelegramUser, cors } = require('../admin/_auth');
const { getPool } = require('../admin/_db');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Tasks.tsx fetches with header 'x-init-data' (not 'x-telegram-initdata')
  const initData = req.headers['x-init-data'];
  if (!initData || !TOKEN) return res.json([]);

  const user = verifyTelegramUser(initData);
  if (!user) return res.json([]);

  const db = getPool();
  if (!db) return res.json([]);

  try {
    const { rows } = await db.query(
      `SELECT task_id FROM gm_task_completions WHERE telegram_id = $1`,
      [user.id]
    );
    return res.json(rows.map(r => r.task_id));
  } catch {
    return res.json([]);
  }
};
