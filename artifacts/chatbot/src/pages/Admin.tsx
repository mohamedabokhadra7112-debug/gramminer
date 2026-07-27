import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Shield, BarChart3, MessageSquare, ClipboardList, Radio, DollarSign,
  Users, Plus, Trash2, Eye, EyeOff, Ban, Coins, AlertTriangle,
  ChevronDown, ChevronUp, Send, Wrench, Settings, Pickaxe, ArrowDownUp,
  UserPlus, Search, Check, X, ArrowUp, Sparkles, Trophy, Clock, Flame,
  ShoppingBag,
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

// In dev, always use relative paths so the Vite proxy forwards to the API server.
// In production, use VITE_API_URL if the frontend and API are on different origins.
const API = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL ?? '');

function initData(): string { return window.Telegram?.WebApp?.initData ?? ''; }
function adminHeaders(): HeadersInit {
  return { 'Content-Type': 'application/json', 'x-telegram-initdata': initData() };
}
async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}/api${path}`, {
    method,
    headers: adminHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`${res.status} ${txt}`);
  }
  return res.json() as Promise<T>;
}

// ─── Types ─────────────────────────────────────────────────────────────────
interface Stats { totalUsers: number; blockedUsers: number; activeUsers: number }
interface Task  { id: number; title: string; description: string; reward: number; isDaily: boolean; isHidden: boolean; channelUsername?: string | null }
interface Withdrawal { id: number; telegram_id: number; first_name: string | null; username: string | null; wallet_address: string; amount: number; status: string; created_at: string; tx_hash: string | null; rejection_reason: string | null }
interface Channel { id: number; channelUsername: string; channelName: string }
interface User { id: number; telegramId: number; username: string|null; firstName: string|null; lastName: string|null; balance: number; isBanned: boolean; restrictWithdrawal: boolean; blockedBot: boolean }
interface Miner { id: number; name: string; baseCost: number; dailyPct: number; description: string }
interface SubAdmin { telegramId: number; username: string; permissions: string[] }

const ALL_PERMISSIONS = [
  { key: 'stats',       labelKey: 'admin_perm_stats' },
  { key: 'broadcast',   labelKey: 'admin_perm_broadcast' },
  { key: 'maintenance', labelKey: 'admin_perm_maintenance' },
  { key: 'welcome',     labelKey: 'admin_perm_welcome' },
  { key: 'tasks',       labelKey: 'admin_perm_tasks' },
  { key: 'referral',    labelKey: 'admin_perm_referral' },
  { key: 'users',       labelKey: 'admin_perm_users' },
  { key: 'miners',      labelKey: 'admin_perm_miners' },
  { key: 'limits',      labelKey: 'admin_perm_limits' },
  { key: 'channels',    labelKey: 'admin_perm_channels' },
];

// ─── Shared UI ─────────────────────────────────────────────────────────────
function Section({ title, icon: Icon, children, defaultOpen = false }: {
  title: string; icon: React.ElementType; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-secondary/40 border border-white/5 rounded-2xl overflow-hidden mb-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3.5 text-left"
      >
        <div className="flex items-center gap-2.5">
          <Icon className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="font-black text-white text-sm">{title}</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">{children}</div>}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-primary/50 ${props.className ?? ''}`}
    />
  );
}

function Btn({ children, onClick, variant = 'primary', size = 'md', disabled, className = '' }: {
  children: React.ReactNode; onClick?: () => void;
  variant?: 'primary'|'danger'|'ghost'|'success'; size?: 'sm'|'md';
  disabled?: boolean; className?: string;
}) {
  const colors = {
    primary: 'bg-primary text-black hover:opacity-90',
    danger:  'bg-destructive/20 text-destructive hover:bg-destructive/30',
    ghost:   'bg-white/5 text-white hover:bg-white/10',
    success: 'bg-success/20 text-success hover:bg-success/30',
  };
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2.5 text-sm' };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${colors[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </button>
  );
}

function StatusMsg({ msg, isError }: { msg: string; isError?: boolean }) {
  if (!msg) return null;
  return <div className={`text-xs text-center py-1 ${isError ? 'text-destructive' : 'text-success'}`}>{msg}</div>;
}

// ─── 1. Statistics ─────────────────────────────────────────────────────────
function StatsSection() {
  const { t } = useLanguage();
  const [stats, setStats] = useState<Stats|null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { api<Stats>('GET', '/admin/general?type=stats').then(setStats).catch(e => setErr(e.message)); }, []);

  if (err) return <div className="text-destructive text-sm">{err}</div>;
  if (!stats) return <div className="text-muted-foreground text-sm">{t('admin_loading')}</div>;

  return (
    <div className="grid grid-cols-3 gap-2">
      {[
        { label: t('admin_stat_total'), value: stats.totalUsers, color: 'text-primary' },
        { label: t('admin_stat_active'), value: stats.activeUsers, color: 'text-success' },
        { label: t('admin_stat_blocked'), value: stats.blockedUsers, color: 'text-destructive' },
      ].map(c => (
        <div key={c.label} className="bg-black/40 rounded-xl p-3 text-center border border-white/5">
          <div className={`text-2xl font-black ${c.color}`}>{c.value}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{c.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── 2. Broadcast ──────────────────────────────────────────────────────────
function BroadcastSection() {
  const { t } = useLanguage();
  const [msg, setMsg] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const send = async () => {
    if (!msg.trim()) return;
    setLoading(true); setStatus('');
    try {
      const { sent, failed, total } = await api<{ sent: number; failed: number; total: number }>(
        'POST', '/admin/general?type=broadcast', { message: msg }
      );
      setStatus(t('admin_broadcast_sent', { sent: String(sent), total: String(total), failed: String(failed) }));
      setMsg('');
    } catch (e: any) { setStatus(`❌ ${e.message}`); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{t('admin_broadcast_html_hint')}</p>
      <textarea
        value={msg}
        onChange={e => setMsg(e.target.value)}
        rows={5}
        placeholder={t('admin_broadcast_placeholder')}
        className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white text-sm resize-none focus:outline-none focus:border-primary/50"
      />
      <StatusMsg msg={status} isError={status.startsWith('❌')} />
      <Btn onClick={send} disabled={loading || !msg.trim()} className="w-full">
        <Send className="w-3.5 h-3.5" />{loading ? t('admin_sending') : t('admin_broadcast_send_all')}
      </Btn>
    </div>
  );
}

// ─── 3. Maintenance Mode ───────────────────────────────────────────────────
function MaintenanceSection() {
  const { t } = useLanguage();
  const [on, setOn] = useState(false);
  const [msg, setMsg] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Record<string, string>>('GET', '/admin/general?type=settings').then(s => {
      setOn(s['maintenance_mode'] === 'true');
      setMsg(s['maintenance_message'] || t('admin_maintenance_default'));
    }).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    try {
      await Promise.all([
        api('POST', '/admin/general?type=settings', { key: 'maintenance_mode', value: String(on) }),
        api('POST', '/admin/general?type=settings', { key: 'maintenance_message', value: msg }),
      ]);
      setStatus(t('admin_saved'));
    } catch { setStatus(t('admin_save_failed')); }
    setTimeout(() => setStatus(''), 2000);
  };

  if (loading) return <div className="text-muted-foreground text-sm">{t('admin_loading')}</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between bg-black/40 rounded-xl px-4 py-3">
        <span className="text-white font-bold text-sm">{t('admin_maintenance_mode')}</span>
        <button
          onClick={() => setOn(o => !o)}
          className={`w-12 h-6 rounded-full transition-colors relative ${on ? 'bg-destructive' : 'bg-white/20'}`}
        >
          <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${on ? 'right-1' : 'left-1'}`} />
        </button>
      </div>
      <textarea
        value={msg}
        onChange={e => setMsg(e.target.value)}
        rows={3}
        placeholder={t('admin_maintenance_placeholder')}
        className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white text-sm resize-none focus:outline-none focus:border-primary/50"
      />
      <StatusMsg msg={status} isError={status.startsWith('❌')} />
      <Btn onClick={save} className="w-full"><Wrench className="w-3.5 h-3.5" />{t('admin_save_settings')}</Btn>
    </div>
  );
}

// ─── 4. Welcome Message ────────────────────────────────────────────────────
function WelcomeSection() {
  const { t } = useLanguage();
  const [msg, setMsg] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Record<string, string>>('GET', '/admin/general?type=settings')
      .then(s => setMsg(s['welcome_message'] || ''))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    try {
      await api('POST', '/admin/general?type=settings', { key: 'welcome_message', value: msg });
      setStatus(t('admin_saved'));
    } catch { setStatus(t('admin_failed')); }
    setTimeout(() => setStatus(''), 2000);
  };

  if (loading) return <div className="text-muted-foreground text-sm">{t('admin_loading')}</div>;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{t('admin_welcome_hint_pre')} <code className="text-primary">{'{first_name}'}</code> {t('admin_welcome_hint_post')}</p>
      <textarea
        value={msg}
        onChange={e => setMsg(e.target.value)}
        rows={6}
        placeholder={t('admin_welcome_placeholder')}
        className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white text-sm resize-none focus:outline-none focus:border-primary/50"
      />
      <StatusMsg msg={status} isError={status.startsWith('❌')} />
      <Btn onClick={save} className="w-full"><MessageSquare className="w-3.5 h-3.5" />{t('admin_save_message')}</Btn>
    </div>
  );
}

// ─── 5. Tasks ──────────────────────────────────────────────────────────────
function TasksSection() {
  const { t: tr } = useLanguage();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [form, setForm] = useState({ title: '', description: '', reward: '', isDaily: false, channelUsername: '' });
  const [status, setStatus] = useState('');

  const load = useCallback(() => { api<Task[]>('GET', '/admin/tasks').then(setTasks).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!form.title.trim()) return;
    try {
      await api('POST', '/admin/tasks', {
        title: form.title,
        description: form.description,
        reward: Number(form.reward) || 0,
        isDaily: form.isDaily,
        channelUsername: form.channelUsername.replace(/^@/, '') || null,
      });
      setForm({ title: '', description: '', reward: '', isDaily: false, channelUsername: '' });
      load(); setStatus(tr('admin_added_f'));
    } catch { setStatus(tr('admin_failed')); }
    setTimeout(() => setStatus(''), 2000);
  };
  const del = async (id: number) => { await api('DELETE', `/admin/tasks?id=${id}`); load(); };
  const toggle = async (t: Task) => { await api('PATCH', `/admin/tasks?id=${t.id}`, { isHidden: !t.isHidden }); load(); };

  return (
    <div className="space-y-3">
      <div className="bg-black/40 rounded-xl p-3 space-y-2 border border-white/5">
        <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder={tr('admin_task_title_ph')} />
        <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder={tr('admin_desc_optional')} />
        <Input value={form.reward} onChange={e => setForm(f => ({ ...f, reward: e.target.value }))} type="number" placeholder={tr('admin_reward_gram')} />
        <Input value={form.channelUsername} onChange={e => setForm(f => ({ ...f, channelUsername: e.target.value }))} placeholder={tr('admin_channel_user_ph')} dir="ltr" />
        <label className="flex items-center gap-2 cursor-pointer text-sm text-white">
          <input type="checkbox" checked={form.isDaily} onChange={e => setForm(f => ({ ...f, isDaily: e.target.checked }))} className="w-4 h-4 accent-primary" />
          {tr('admin_daily_task')}
        </label>
        <StatusMsg msg={status} isError={status.startsWith('❌')} />
        <Btn onClick={add} className="w-full"><Plus className="w-3.5 h-3.5" />{tr('admin_add_task')}</Btn>
      </div>
      <div className="space-y-2">
        {tasks.map(t => (
          <div key={t.id} className={`bg-black/40 rounded-xl p-3 border border-white/5 flex items-start justify-between gap-2 ${t.isHidden ? 'opacity-50' : ''}`}>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-white text-sm truncate">{t.title}</div>
              <div className="text-xs text-muted-foreground">{t.reward} gram{t.isDaily ? ` · ${tr('admin_daily_word')}` : ''}{t.channelUsername ? ` · 📢 @${t.channelUsername}` : ''}</div>
              {t.description && <div className="text-xs text-muted-foreground/70 mt-0.5 truncate">{t.description}</div>}
            </div>
            <div className="flex gap-1 flex-shrink-0">
              <button onClick={() => toggle(t)} className="p-1.5 rounded-lg text-muted-foreground bg-white/5 hover:text-white">
                {t.isHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              </button>
              <button onClick={() => del(t.id)} className="p-1.5 rounded-lg text-destructive bg-destructive/10 hover:bg-destructive/20">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
        {tasks.length === 0 && <div className="text-center text-muted-foreground text-sm py-4">{tr('admin_no_tasks')}</div>}
      </div>
    </div>
  );
}

// ─── 6. Referral Settings ──────────────────────────────────────────────────
function ReferralSection() {
  const { t } = useLanguage();
  const [price, setPrice] = useState('0.01');
  const [desc, setDesc]   = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Record<string, string>>('GET', '/admin/general?type=settings').then(s => {
      setPrice(s['referral_price'] || '1');
      setDesc(s['referral_description'] || t('admin_referral_desc_default'));
    }).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    try {
      await Promise.all([
        api('POST', '/admin/general?type=settings', { key: 'referral_price', value: price }),
        api('POST', '/admin/general?type=settings', { key: 'referral_description', value: desc }),
      ]);
      setStatus(t('admin_saved'));
    } catch { setStatus(t('admin_failed')); }
    setTimeout(() => setStatus(''), 2000);
  };

  if (loading) return <div className="text-muted-foreground text-sm">{t('admin_loading')}</div>;
  return (
    <div className="space-y-2">
      <label className="text-xs text-muted-foreground">{t('admin_referral_price_label')}</label>
      <Input value={price} onChange={e => setPrice(e.target.value)} type="number" step="0.001" min="0" className="text-center text-xl font-black" />
      <label className="text-xs text-muted-foreground">{t('admin_referral_desc_label')}</label>
      <textarea
        value={desc}
        onChange={e => setDesc(e.target.value)}
        rows={3}
        className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white text-sm resize-none focus:outline-none focus:border-primary/50"
      />
      <StatusMsg msg={status} isError={status.startsWith('❌')} />
      <Btn onClick={save} className="w-full"><DollarSign className="w-3.5 h-3.5" />{t('admin_save')}</Btn>
    </div>
  );
}

// ─── 6b. Referral Milestones ───────────────────────────────────────────────
interface Milestone {
  id: number;
  inviteCount: number;
  rewardCoins: number;
  isEnabled: boolean;
}

function MilestonesSection() {
  const { t } = useLanguage();
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading]       = useState(true);
  const [status, setStatus]         = useState('');

  // Add form
  const [newCount,  setNewCount]  = useState('');
  const [newReward, setNewReward] = useState('');

  // Inline-edit state: id → draft values
  const [editing, setEditing] = useState<Record<number, { inviteCount: string; rewardCoins: string }>>({});

  const load = useCallback(async () => {
    try {
      const data = await api<Milestone[]>('GET', '/admin/referral-milestones');
      setMilestones(data);
    } catch (e: any) { setStatus(`❌ ${e.message}`); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const flash = (msg: string) => { setStatus(msg); setTimeout(() => setStatus(''), 2500); };

  // ── Add ──────────────────────────────────────────────────────────────────
  const add = async () => {
    const ic = parseInt(newCount, 10);
    const rc = parseInt(newReward, 10);
    if (!ic || ic <= 0 || isNaN(rc) || rc < 0) {
      flash(t('admin_milestone_invalid_input')); return;
    }
    try {
      await api('POST', '/admin/referral-milestones', { inviteCount: ic, rewardCoins: rc });
      setNewCount(''); setNewReward('');
      await load(); flash(t('admin_added_done'));
    } catch (e: any) { flash(`❌ ${e.message}`); }
  };

  // ── Toggle enabled ────────────────────────────────────────────────────────
  const toggleEnabled = async (m: Milestone) => {
    try {
      await api('PATCH', `/admin/referral-milestones/${m.id}`, { isEnabled: !m.isEnabled });
      await load();
    } catch (e: any) { flash(`❌ ${e.message}`); }
  };

  // ── Save inline edit ──────────────────────────────────────────────────────
  const saveEdit = async (id: number) => {
    const draft = editing[id];
    if (!draft) return;
    const ic = parseInt(draft.inviteCount, 10);
    const rc = parseInt(draft.rewardCoins, 10);
    if (!ic || ic <= 0 || isNaN(rc) || rc < 0) { flash(t('admin_invalid_values')); return; }
    try {
      await api('PATCH', `/admin/referral-milestones/${id}`, { inviteCount: ic, rewardCoins: rc });
      setEditing(prev => { const n = { ...prev }; delete n[id]; return n; });
      await load(); flash(t('admin_saved'));
    } catch (e: any) { flash(`❌ ${e.message}`); }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const del = async (id: number) => {
    if (!window.confirm(t('admin_milestone_delete_confirm'))) return;
    try {
      await api('DELETE', `/admin/referral-milestones/${id}`);
      await load(); flash(t('admin_deleted'));
    } catch (e: any) { flash(`❌ ${e.message}`); }
  };

  const startEdit = (m: Milestone) =>
    setEditing(prev => ({ ...prev, [m.id]: { inviteCount: String(m.inviteCount), rewardCoins: String(m.rewardCoins) } }));

  const cancelEdit = (id: number) =>
    setEditing(prev => { const n = { ...prev }; delete n[id]; return n; });

  if (loading) return <div className="text-muted-foreground text-sm">{t('admin_loading')}</div>;

  return (
    <div className="space-y-3">

      {/* ── Add form ── */}
      <div className="bg-black/40 rounded-xl p-3 border border-primary/20 space-y-2">
        <p className="text-xs text-primary font-black uppercase tracking-widest">{t('admin_milestone_new')}</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">{t('admin_invite_count')}</label>
            <Input
              value={newCount}
              onChange={e => setNewCount(e.target.value)}
              type="number" min="1" placeholder={t('admin_eg_50')}
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">{t('admin_reward_coin')}</label>
            <Input
              value={newReward}
              onChange={e => setNewReward(e.target.value)}
              type="number" min="0" placeholder={t('admin_eg_250')}
            />
          </div>
        </div>
        <Btn onClick={add} className="w-full" disabled={!newCount || !newReward}>
          <Plus className="w-3.5 h-3.5" />{t('admin_add_milestone')}
        </Btn>
      </div>

      <StatusMsg msg={status} isError={status.startsWith('❌')} />

      {/* ── Milestone list ── */}
      {milestones.length === 0 && (
        <div className="text-center text-muted-foreground text-sm py-4">{t('admin_no_milestones')}</div>
      )}

      {milestones.map(m => {
        const isEdit = Boolean(editing[m.id]);
        const draft  = editing[m.id];

        return (
          <div
            key={m.id}
            className={`bg-black/40 rounded-xl p-3 border transition-colors ${
              m.isEnabled ? 'border-white/5' : 'border-white/5 opacity-50'
            }`}
          >
            {isEdit ? (
              /* ── Edit mode ── */
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground mb-1 block">{t('admin_invites_word')}</label>
                    <Input
                      value={draft.inviteCount}
                      onChange={e => setEditing(p => ({ ...p, [m.id]: { ...p[m.id], inviteCount: e.target.value } }))}
                      type="number" min="1"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground mb-1 block">{t('admin_reward_word')}</label>
                    <Input
                      value={draft.rewardCoins}
                      onChange={e => setEditing(p => ({ ...p, [m.id]: { ...p[m.id], rewardCoins: e.target.value } }))}
                      type="number" min="0"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Btn size="sm" variant="success" className="flex-1" onClick={() => saveEdit(m.id)}>
                    <Check className="w-3 h-3" />{t('admin_save')}
                  </Btn>
                  <Btn size="sm" variant="ghost" className="flex-1" onClick={() => cancelEdit(m.id)}>
                    <X className="w-3 h-3" />{t('admin_cancel')}
                  </Btn>
                </div>
              </div>
            ) : (
              /* ── View mode ── */
              <div className="flex items-center justify-between gap-3">
                {/* Badge */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <Users className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <div className="text-white font-black text-sm">{m.inviteCount.toLocaleString()} {t('admin_invite_word')}</div>
                    <div className="text-primary text-xs font-bold">+{m.rewardCoins.toLocaleString()} coin</div>
                  </div>
                  {!m.isEnabled && (
                    <span className="text-[10px] bg-white/10 text-white/40 px-2 py-0.5 rounded-full font-bold">{t('admin_hidden')}</span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {/* Toggle visibility */}
                  <button
                    onClick={() => toggleEnabled(m)}
                    title={m.isEnabled ? t('admin_hide') : t('admin_enable')}
                    className="p-1.5 rounded-lg text-muted-foreground bg-white/5 hover:text-white transition-colors"
                  >
                    {m.isEnabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>

                  {/* Edit */}
                  <button
                    onClick={() => startEdit(m)}
                    className="p-1.5 rounded-lg text-muted-foreground bg-white/5 hover:text-primary transition-colors"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => del(m.id)}
                    className="p-1.5 rounded-lg text-destructive bg-destructive/10 hover:bg-destructive/20 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── 7. User Search & Management ──────────────────────────────────────────
function UsersSection() {
  const { t } = useLanguage();
  const [query, setQuery]   = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<User|null>(null);
  const [amount, setAmount] = useState('');
  const [warnMsg, setWarnMsg] = useState('');
  const [status, setStatus] = useState('');

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true); setStatus(''); setSelected(null);
    try {
      const users = await api<User[]>('GET', `/admin/users?action=search&q=${encodeURIComponent(query)}`);
      setResults(users);
      if (!users.length) setStatus(t('admin_no_results'));
    } catch (e: any) { setStatus(`❌ ${e.message}`); }
    finally { setLoading(false); }
  };

  const act = async (path: string, body: unknown, successMsg: string) => {
    try {
      await api('POST', path, body);
      setStatus(`✅ ${successMsg}`);
      // Refresh
      const users = await api<User[]>('GET', `/admin/users?action=search&q=${encodeURIComponent(query)}`);
      setResults(users);
      const updated = users.find(u => u.telegramId === selected?.telegramId);
      if (updated) setSelected(updated);
    } catch (e: any) { setStatus(`❌ ${e.message}`); }
    setTimeout(() => setStatus(''), 3000);
  };

  const u = selected;
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input value={query} onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
          placeholder={t('admin_user_search_ph')} dir="ltr" />
        <button onClick={search} disabled={loading} className="flex-shrink-0 px-4 py-2 rounded-xl bg-primary text-black font-black text-sm flex items-center gap-1 disabled:opacity-60">
          <Search className="w-4 h-4" />
        </button>
      </div>
      <StatusMsg msg={status} isError={status.startsWith('❌')} />

      {/* Results list */}
      {!u && results.map(r => (
        <button key={r.id} onClick={() => setSelected(r)}
          className="w-full text-left bg-black/40 rounded-xl p-3 border border-white/5 hover:border-primary/30 transition-colors">
          <div className="font-bold text-white text-sm">{r.firstName ?? r.username ?? t('admin_unknown')}</div>
          <div className="text-xs text-muted-foreground font-mono">ID: {r.telegramId} {r.username && `· @${r.username}`}</div>
          <div className="text-xs text-primary font-bold mt-0.5">{Number(r.balance).toFixed(4)} gram</div>
        </button>
      ))}

      {/* Selected user panel */}
      {u && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg bg-white/5 text-muted-foreground hover:text-white">
              <ChevronDown className="w-4 h-4 rotate-90" />
            </button>
            <div>
              <div className="font-bold text-white">{u.firstName ?? u.username ?? t('admin_unknown')}</div>
              <div className="text-xs text-muted-foreground font-mono">ID: {u.telegramId}</div>
            </div>
            <div className="ml-auto flex gap-1.5">
              {u.isBanned && <span className="text-[10px] bg-destructive/20 text-destructive px-2 py-0.5 rounded-full font-bold">{t('admin_banned')}</span>}
              {u.restrictWithdrawal && <span className="text-[10px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-bold">{t('admin_withdraw_restricted')}</span>}
            </div>
          </div>

          <div className="bg-black/40 rounded-xl p-3 text-center">
            <div className="text-2xl font-black text-primary">{Number(u.balance).toFixed(4)} gram</div>
          </div>

          {/* Balance adjustment */}
          <div className="bg-black/40 rounded-xl p-3 space-y-2">
            <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">{t('admin_adjust_balance')}</p>
            <Input value={amount} onChange={e => setAmount(e.target.value)} type="number" placeholder={t('admin_amount')} />
            <div className="flex gap-2">
              <Btn variant="success" size="sm" className="flex-1"
                onClick={() => act(`/admin/users?action=balance&id=${u.telegramId}`, { amount: Number(amount) }, t('admin_balance_added'))}>
                <Coins className="w-3 h-3" />{t('admin_add')}
              </Btn>
              <Btn variant="danger" size="sm" className="flex-1"
                onClick={() => act(`/admin/users?action=balance&id=${u.telegramId}`, { amount: -Number(amount) }, t('admin_balance_deducted'))}>
                <Coins className="w-3 h-3" />{t('admin_deduct')}
              </Btn>
            </div>
            {/* Direct balance correction — overwrites the stored value entirely */}
            <div className="pt-1 border-t border-white/10">
              <p className="text-[10px] text-amber-400 font-bold mb-1.5">{t('admin_balance_correct')}</p>
              <div className="flex gap-2">
                <Input value={amount} onChange={e => setAmount(e.target.value)} type="number"
                  placeholder={t('admin_correct_value')} className="flex-1" />
                <Btn variant="ghost" size="sm"
                  onClick={() => {
                    if (!window.confirm(t('admin_balance_set_confirm', { name: String(u.firstName ?? u.telegramId), amount: String(amount) }))) return;
                    act(`/admin/users?action=balance_set&id=${u.telegramId}`, { value: Number(amount) }, t('admin_balance_set_done', { amount: String(amount) }));
                  }}>
                  <Check className="w-3 h-3" />{t('admin_set')}
                </Btn>
              </div>
            </div>
          </div>

          {/* Warning message */}
          <div className="bg-black/40 rounded-xl p-3 space-y-2">
            <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">{t('admin_send_warning')}</p>
            <textarea
              value={warnMsg}
              onChange={e => setWarnMsg(e.target.value)}
              rows={2}
              placeholder={t('admin_warning_text')}
              className="w-full bg-white/5 border border-white/10 rounded-xl p-2 text-white text-sm resize-none focus:outline-none"
            />
            <Btn variant="ghost" size="sm" className="w-full"
              onClick={() => act(`/admin/users?action=warn&id=${u.telegramId}`, { message: warnMsg }, t('admin_sent'))}>
              <AlertTriangle className="w-3 h-3 text-amber-400" />{t('admin_send_warning_only')}
            </Btn>
          </div>

          {/* Quick actions */}
          <div className="flex flex-wrap gap-2">
            <Btn variant={u.isBanned ? 'success' : 'danger'} size="sm"
              onClick={() => act(`/admin/users?action=ban&id=${u.telegramId}`, { ban: !u.isBanned }, u.isBanned ? t('admin_unbanned') : t('admin_banned_done'))}>
              <Ban className="w-3 h-3" />{u.isBanned ? t('admin_unban_user') : t('admin_ban_user')}
            </Btn>
            <Btn variant={u.restrictWithdrawal ? 'success' : 'ghost'} size="sm"
              onClick={() => act(`/admin/users?action=restrict&id=${u.telegramId}`, { restrict: !u.restrictWithdrawal }, u.restrictWithdrawal ? t('admin_restrict_lifted') : t('admin_restrict_done'))}>
              <ArrowDownUp className="w-3 h-3" />{u.restrictWithdrawal ? t('admin_lift_restrict') : t('admin_restrict_withdraw')}
            </Btn>
            <Btn variant="danger" size="sm"
              onClick={async () => {
                if (!window.confirm(t('admin_delete_account_confirm', { name: String(u.firstName ?? u.telegramId) }))) return;
                try {
                  await api('DELETE', `/admin/users?id=${u.telegramId}`, undefined);
                  setStatus(t('admin_account_deleted'));
                  setSelected(null);
                  setResults(prev => prev.filter(r => r.telegramId !== u.telegramId));
                } catch (e: any) { setStatus(`❌ ${e.message}`); }
                setTimeout(() => setStatus(''), 3000);
              }}>
              <Trash2 className="w-3 h-3" />{t('admin_delete_account')}
            </Btn>
          </div>
          <StatusMsg msg={status} isError={status.startsWith('❌')} />
        </div>
      )}
    </div>
  );
}

// ─── 8. Miners Management ──────────────────────────────────────────────────
function MinersSection() {
  const { t } = useLanguage();
  const [miners, setMiners] = useState<Miner[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [newMiner, setNewMiner] = useState({ name: '', baseCost: '', dailyPct: '', description: '' });

  useEffect(() => {
    api<Miner[]>('GET', '/admin/general?type=miners').then(setMiners).finally(() => setLoading(false));
  }, []);

  const save = async (updated: Miner[]) => {
    try {
      await api('POST', '/admin/general?type=miners', { miners: updated });
      setMiners(updated);
      setStatus(t('admin_saved'));
    } catch { setStatus(t('admin_failed')); }
    setTimeout(() => setStatus(''), 2000);
  };

  const update = (id: number, field: keyof Miner, val: string | number) => {
    setMiners(prev => prev.map(m => m.id === id ? { ...m, [field]: field === 'name' || field === 'description' ? val : Number(val) } as Miner : m));
  };

  const addMiner = async () => {
    if (!newMiner.name.trim()) return;
    const next = { id: Math.max(0, ...miners.map(m => m.id)) + 1, name: newMiner.name, baseCost: Number(newMiner.baseCost) || 0, dailyPct: Number(newMiner.dailyPct) || 0.05, description: newMiner.description };
    await save([...miners, next]);
    setNewMiner({ name: '', baseCost: '', dailyPct: '', description: '' });
  };

  const removeMiner = async (id: number) => { await save(miners.filter(m => m.id !== id)); };

  if (loading) return <div className="text-muted-foreground text-sm">{t('admin_loading')}</div>;

  return (
    <div className="space-y-3">
      {miners.map(m => (
        <div key={m.id} className="bg-black/40 rounded-xl p-3 border border-white/5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-primary font-bold text-xs">{t('admin_miner_hash')} #{m.id}</span>
            <button onClick={() => removeMiner(m.id)} className="p-1 rounded-lg text-destructive bg-destructive/10 hover:bg-destructive/20">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
          <Input value={m.name} onChange={e => update(m.id, 'name', e.target.value)} placeholder={t('admin_name')} />
          <div className="grid grid-cols-2 gap-2">
            <Input value={m.baseCost} onChange={e => update(m.id, 'baseCost', e.target.value)} type="number" placeholder={t('admin_cost')} />
            <Input value={m.dailyPct} onChange={e => update(m.id, 'dailyPct', e.target.value)} type="number" step="0.01" placeholder={t('admin_daily_pct')} />
          </div>
          <Input value={m.description} onChange={e => update(m.id, 'description', e.target.value)} placeholder={t('admin_desc_optional')} />
        </div>
      ))}

      {/* Add new */}
      <div className="bg-black/40 rounded-xl p-3 border border-primary/20 space-y-2">
        <p className="text-xs text-primary font-bold uppercase tracking-widest">{t('admin_add_miner')}</p>
        <Input value={newMiner.name} onChange={e => setNewMiner(n => ({ ...n, name: e.target.value }))} placeholder={t('admin_name_required')} />
        <div className="grid grid-cols-2 gap-2">
          <Input value={newMiner.baseCost} onChange={e => setNewMiner(n => ({ ...n, baseCost: e.target.value }))} type="number" placeholder={t('admin_cost')} />
          <Input value={newMiner.dailyPct} onChange={e => setNewMiner(n => ({ ...n, dailyPct: e.target.value }))} type="number" step="0.01" placeholder={t('admin_pct_005')} />
        </div>
        <Input value={newMiner.description} onChange={e => setNewMiner(n => ({ ...n, description: e.target.value }))} placeholder={t('admin_description')} />
        <Btn onClick={addMiner} size="sm" className="w-full"><Plus className="w-3.5 h-3.5" />{t('admin_add')}</Btn>
      </div>

      <StatusMsg msg={status} isError={status.startsWith('❌')} />
      <Btn onClick={() => save(miners)} className="w-full"><Check className="w-3.5 h-3.5" />{t('admin_save_all')}</Btn>
    </div>
  );
}

// ─── Withdrawals ────────────────────────────────────────────────────────────
function WithdrawalsSection() {
  const { t, lang } = useLanguage();
  const [items, setItems] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api<Withdrawal[]>('GET', '/admin/general?type=withdrawals').then(setItems).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const approve = async (id: number) => {
    setStatus(t('admin_sending_progress'));
    try {
      await api('POST', `/admin/general?type=withdrawals&action=approve&id=${id}`, {});
      setStatus(t('admin_withdraw_approved'));
      load();
    } catch (e: any) { setStatus(`❌ ${e.message}`); }
    setTimeout(() => setStatus(''), 4000);
  };

  const reject = async (id: number) => {
    try {
      await api('POST', `/admin/general?type=withdrawals&action=reject&id=${id}`, { reason: rejectReason || t('admin_rejected_by_admin') });
      setStatus(t('admin_withdraw_rejected'));
      setRejectId(null); setRejectReason('');
      load();
    } catch (e: any) { setStatus(`❌ ${e.message}`); }
    setTimeout(() => setStatus(''), 3000);
  };

  const statusColor = (s: string) =>
    s === 'approved' ? 'text-green-400' : s === 'rejected' ? 'text-red-400' : 'text-yellow-400';
  const statusLabel = (s: string) =>
    s === 'approved' ? t('admin_status_approved') : s === 'rejected' ? t('admin_status_rejected') : t('admin_status_pending');

  if (loading) return <div className="text-muted-foreground text-sm">{t('admin_loading')}</div>;

  return (
    <div className="space-y-3">
      <StatusMsg msg={status} isError={status.startsWith('❌')} />
      <Btn onClick={load} variant="ghost" size="sm" className="w-full">{t('admin_refresh')}</Btn>
      {items.length === 0 && <div className="text-center text-muted-foreground text-sm py-4">{t('admin_no_requests')}</div>}
      {items.map(w => (
        <div key={w.id} className="bg-black/40 rounded-xl p-3 border border-white/5 space-y-2">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-bold text-white text-sm">{w.first_name ?? w.username ?? w.telegram_id}</div>
              <div className="text-xs text-muted-foreground font-mono">ID: {w.telegram_id}</div>
              <div className="text-primary font-black text-sm mt-0.5">{Number(w.amount).toFixed(4)} gram</div>
              <div className="text-[10px] font-mono text-white/50 break-all mt-0.5">{w.wallet_address}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{new Date(w.created_at).toLocaleString(lang)}</div>
            </div>
            <span className={`text-xs font-bold ${statusColor(w.status)}`}>{statusLabel(w.status)}</span>
          </div>
          {w.status === 'pending' && (
            <div className="flex gap-2">
              <Btn size="sm" variant="success" onClick={() => approve(w.id)} className="flex-1">
                <Check className="w-3 h-3" />{t('admin_approve_send')}
              </Btn>
              <Btn size="sm" variant="danger" onClick={() => setRejectId(w.id)} className="flex-1">
                <X className="w-3 h-3" />{t('admin_reject')}
              </Btn>
            </div>
          )}
          {rejectId === w.id && (
            <div className="space-y-2">
              <Input value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder={t('admin_reject_reason_ph')} />
              <div className="flex gap-2">
                <Btn size="sm" variant="danger" onClick={() => reject(w.id)} className="flex-1">{t('admin_confirm_reject')}</Btn>
                <Btn size="sm" variant="ghost" onClick={() => { setRejectId(null); setRejectReason(''); }} className="flex-1">{t('admin_cancel')}</Btn>
              </div>
            </div>
          )}
          {w.tx_hash && <div className="text-[10px] font-mono text-green-400 break-all">TX: {w.tx_hash}</div>}
          {w.rejection_reason && <div className="text-xs text-red-400">{t('admin_reason_label')}: {w.rejection_reason}</div>}
        </div>
      ))}
    </div>
  );
}

// ─── 9 & 10. Withdrawal & Deposit Limits ──────────────────────────────────
function LimitsSection() {
  const { t } = useLanguage();
  const [vals, setVals] = useState({ minWithdraw: '', maxWithdraw: '', minDeposit: '', maxDeposit: '' });
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Record<string, string>>('GET', '/admin/general?type=settings').then(s => {
      setVals({ minWithdraw: s['min_withdrawal'] || '0.1', maxWithdraw: s['max_withdrawal'] || '1000', minDeposit: s['min_deposit'] || '0.1', maxDeposit: s['max_deposit'] || '10000' });
    }).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    try {
      await Promise.all([
        api('POST', '/admin/general?type=settings', { key: 'min_withdrawal', value: vals.minWithdraw }),
        api('POST', '/admin/general?type=settings', { key: 'max_withdrawal', value: vals.maxWithdraw }),
        api('POST', '/admin/general?type=settings', { key: 'min_deposit',    value: vals.minDeposit }),
        api('POST', '/admin/general?type=settings', { key: 'max_deposit',    value: vals.maxDeposit }),
      ]);
      setStatus(t('admin_saved'));
    } catch { setStatus(t('admin_failed')); }
    setTimeout(() => setStatus(''), 2000);
  };

  if (loading) return <div className="text-muted-foreground text-sm">{t('admin_loading')}</div>;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{t('admin_withdraw_limits')}</p>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="text-xs text-muted-foreground">{t('admin_min')}</label><Input value={vals.minWithdraw} onChange={e => setVals(v => ({ ...v, minWithdraw: e.target.value }))} type="number" step="0.1" /></div>
          <div><label className="text-xs text-muted-foreground">{t('admin_max')}</label><Input value={vals.maxWithdraw} onChange={e => setVals(v => ({ ...v, maxWithdraw: e.target.value }))} type="number" /></div>
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{t('admin_deposit_limits')}</p>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="text-xs text-muted-foreground">{t('admin_min')}</label><Input value={vals.minDeposit} onChange={e => setVals(v => ({ ...v, minDeposit: e.target.value }))} type="number" step="0.1" /></div>
          <div><label className="text-xs text-muted-foreground">{t('admin_max')}</label><Input value={vals.maxDeposit} onChange={e => setVals(v => ({ ...v, maxDeposit: e.target.value }))} type="number" /></div>
        </div>
      </div>
      <StatusMsg msg={status} isError={status.startsWith('❌')} />
      <Btn onClick={save} className="w-full"><ArrowDownUp className="w-3.5 h-3.5" />{t('admin_save_limits')}</Btn>
    </div>
  );
}

// ─── Channels (mandatory subscription) ────────────────────────────────────
function ChannelsSection() {
  const { t } = useLanguage();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [username, setUsername] = useState('');
  const [name, setName]         = useState('');
  const [status, setStatus]     = useState('');

  const load = useCallback(() => { api<Channel[]>('GET', '/admin/channels').then(setChannels).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!username.trim()) return;
    try {
      await api('POST', '/admin/channels', { channelUsername: username.replace(/^@/, ''), channelName: name || username });
      setUsername(''); setName(''); load(); setStatus(t('admin_added_f'));
    } catch { setStatus(t('admin_failed')); }
    setTimeout(() => setStatus(''), 2000);
  };
  const del = async (id: number) => { await api('DELETE', `/admin/channels?id=${id}`); load(); };

  return (
    <div className="space-y-3">
      <div className="bg-black/40 rounded-xl p-3 space-y-2 border border-white/5">
        <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="@channelUsername *" dir="ltr" />
        <Input value={name} onChange={e => setName(e.target.value)} placeholder={t('admin_display_name')} />
        <StatusMsg msg={status} isError={status.startsWith('❌')} />
        <Btn onClick={add} className="w-full"><Plus className="w-3.5 h-3.5" />{t('admin_add_channel')}</Btn>
      </div>
      {channels.map(c => (
        <div key={c.id} className="bg-black/40 rounded-xl p-3 border border-white/5 flex items-center justify-between">
          <div>
            <div className="font-bold text-white text-sm">{c.channelName || c.channelUsername}</div>
            <div className="text-xs text-muted-foreground font-mono">@{c.channelUsername}</div>
          </div>
          <button onClick={() => del(c.id)} className="p-1.5 rounded-lg text-destructive bg-destructive/10 hover:bg-destructive/20"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      ))}
      {channels.length === 0 && <div className="text-center text-muted-foreground text-sm py-2">{t('admin_no_channels')}</div>}
    </div>
  );
}

// ─── Sub-Admin Management ──────────────────────────────────────────────────
function AdminsSection() {
  const { t } = useLanguage();
  const [admins, setAdmins]     = useState<SubAdmin[]>([]);
  const [tid, setTid]           = useState('');
  const [uname, setUname]       = useState('');
  const [perms, setPerms]       = useState<string[]>([]);
  const [status, setStatus]     = useState('');
  const [loading, setLoading]   = useState(true);

  const load = useCallback(() => { api<SubAdmin[]>('GET', '/admin/admins').then(setAdmins).finally(() => setLoading(false)); }, []);
  useEffect(() => { load(); }, [load]);

  const togglePerm = (key: string) => setPerms(p => p.includes(key) ? p.filter(x => x !== key) : [...p, key]);
  const allSelected = perms.length === ALL_PERMISSIONS.length;
  const toggleAll = () => setPerms(allSelected ? [] : ALL_PERMISSIONS.map(p => p.key));

  const add = async () => {
    if (!tid.trim()) return;
    try {
      await api('POST', '/admin/admins', { telegramId: Number(tid), username: uname, permissions: perms });
      setTid(''); setUname(''); setPerms([]);
      load(); setStatus(t('admin_added_m'));
    } catch { setStatus(t('admin_failed')); }
    setTimeout(() => setStatus(''), 2000);
  };

  const remove = async (telegramId: number) => {
    await api('DELETE', `/admin/admins?id=${telegramId}`, undefined);
    load();
  };

  if (loading) return <div className="text-muted-foreground text-sm">{t('admin_loading')}</div>;

  return (
    <div className="space-y-3">
      <div className="bg-black/40 rounded-xl p-3 space-y-2 border border-white/5">
        <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">{t('admin_add_new_admin')}</p>
        <Input value={tid} onChange={e => setTid(e.target.value)} placeholder="Telegram ID *" type="number" dir="ltr" />
        <Input value={uname} onChange={e => setUname(e.target.value)} placeholder={t('admin_username_optional')} dir="ltr" />

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{t('admin_permissions')}</span>
            <button onClick={toggleAll} className="text-xs text-primary font-bold">{allSelected ? t('admin_deselect_all') : t('admin_select_all')}</button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {ALL_PERMISSIONS.map(p => (
              <label key={p.key} className="flex items-center gap-1.5 cursor-pointer text-xs text-white bg-white/5 rounded-lg px-2 py-1.5">
                <input type="checkbox" checked={perms.includes(p.key)} onChange={() => togglePerm(p.key)} className="w-3.5 h-3.5 accent-primary" />
                {t(p.labelKey)}
              </label>
            ))}
          </div>
        </div>

        <StatusMsg msg={status} isError={status.startsWith('❌')} />
        <Btn onClick={add} className="w-full"><UserPlus className="w-3.5 h-3.5" />{t('admin_add_admin')}</Btn>
      </div>

      {admins.map(a => (
        <div key={a.telegramId} className="bg-black/40 rounded-xl p-3 border border-white/5">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="font-bold text-white text-sm">{a.username ? `@${a.username}` : `ID: ${a.telegramId}`}</div>
              <div className="text-xs text-muted-foreground font-mono">{a.telegramId}</div>
            </div>
            <button onClick={() => remove(a.telegramId)} className="p-1.5 rounded-lg text-destructive bg-destructive/10 hover:bg-destructive/20"><X className="w-3.5 h-3.5" /></button>
          </div>
          <div className="flex flex-wrap gap-1">
            {a.permissions.length === ALL_PERMISSIONS.length
              ? <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full">{t('admin_all_permissions')}</span>
              : a.permissions.map(p => {
                const found = ALL_PERMISSIONS.find(x => x.key === p);
                return <span key={p} className="text-[10px] bg-white/10 text-muted-foreground px-2 py-0.5 rounded-full">{found ? t(found.labelKey) : p}</span>;
              })
            }
          </div>
        </div>
      ))}
      {admins.length === 0 && <div className="text-center text-muted-foreground text-sm py-2">{t('admin_no_subadmins')}</div>}
    </div>
  );
}

// ─── Daily Combo (read-only view) ─────────────────────────────────────────
const COMBO_ITEM_NAMES: Record<number, string> = {
  1: 'Crystal Core', 2: 'Mining Pickaxe', 3: 'Mining Rig',
  4: 'Server Node',  5: 'Treasure Vault',
};
const COMBO_EMOJIS: Record<number, string> = {
  1: '💎', 2: '⛏️', 3: '🖥️', 4: '🗄️', 5: '🪙',
};

function ComboDailySection() {
  const { t } = useLanguage();
  const [combo, setCombo] = useState<{ date: string|null; correctIds: number[]; correctNames: string[] } | null>(null);
  const [err, setErr]     = useState('');

  useEffect(() => {
    api<{ date: string|null; correctIds: number[]; correctNames: string[] }>(
      'GET', '/admin/general?type=combo'
    ).then(setCombo).catch(e => setErr(e.message));
  }, []);

  if (err)   return <div className="text-destructive text-sm">{err}</div>;
  if (!combo) return <div className="text-muted-foreground text-sm">{t('admin_loading')}</div>;
  if (!combo.date) return <div className="text-muted-foreground text-sm">{t('admin_combo_none')}</div>;

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">{t('admin_combo_today_date')} <span className="text-white font-bold">{combo.date}</span></div>
      <div className="text-xs text-muted-foreground mb-1">{t('admin_combo_correct')}</div>
      <div className="flex gap-2 flex-wrap">
        {combo.correctIds.map(id => (
          <div key={id} className="flex items-center gap-2 bg-primary/10 border border-primary/30 rounded-xl px-3 py-2">
            <span className="text-lg">{COMBO_EMOJIS[id]}</span>
            <span className="text-white font-bold text-xs">{COMBO_ITEM_NAMES[id]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Shared tournament helpers ─────────────────────────────────────────────
interface Tournament {
  id: number;
  title: string;
  topN: number;
  prizes: { rank: number; gram: number; coins?: number }[];
  startsAt: string;
  endsAt: string;
  status: string;
  settledAt?: string;
  tournamentType?: string;
}

function TournamentSection() {
  const { t: tr, lang } = useLanguage();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading]         = useState(true);
  const [status, setStatus]           = useState('');
  const [settling, setSettling]       = useState<number | null>(null);

  // Create form state
  const [title, setTitle]         = useState('');
  const [topN, setTopN]           = useState(10);
  const [durationH, setDurationH] = useState(24);
  // prizes: rank 1..topN each with a gram value
  const [prizeValues, setPrizeValues] = useState<Record<number, string>>({
    1: '1000', 2: '500', 3: '250', 4: '100', 5: '50',
  });

  const load = useCallback(async () => {
    try {
      const data = await api<Tournament[]>('GET', '/admin/general?type=tournament');
      setTournaments(data);
    } catch (e: any) { setStatus(`❌ ${e.message}`); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const rankLabel = (r: number) => r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : `#${r}`;

  const create = async () => {
    if (!title.trim()) { setStatus(tr('admin_trn_enter_name')); return; }
    const prizes = Array.from({ length: topN }, (_, i) => ({
      rank: i + 1,
      gram: Number(prizeValues[i + 1] ?? 0),
    })).filter(p => p.gram > 0);
    try {
      setStatus('');
      await api('POST', '/admin/general?type=tournament', { title, topN, durationHours: durationH, prizes });
      setStatus(tr('admin_trn_created'));
      setTitle('');
      await load();
    } catch (e: any) { setStatus(`❌ ${e.message}`); }
    setTimeout(() => setStatus(''), 3000);
  };

  const cancel = async (id: number) => {
    if (!confirm(tr('admin_trn_cancel_confirm'))) return;
    try {
      await api('DELETE', `/admin/general?type=tournament&id=${id}`);
      setStatus(tr('admin_trn_cancelled'));
      await load();
    } catch (e: any) { setStatus(`❌ ${e.message}`); }
    setTimeout(() => setStatus(''), 2000);
  };

  const settle = async (id: number) => {
    if (!confirm(tr('admin_trn_settle_confirm'))) return;
    setSettling(id);
    try {
      await api('POST', `/admin/general?type=tournament&action=settle&id=${id}`);
      setStatus(tr('admin_trn_settled'));
      await load();
    } catch (e: any) { setStatus(`❌ ${e.message}`); }
    finally { setSettling(null); }
    setTimeout(() => setStatus(''), 3000);
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short' });

  const timeLeft = (endsAt: string) => {
    const diff = new Date(endsAt).getTime() - Date.now();
    if (diff <= 0) return tr('admin_trn_ended');
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return tr('admin_trn_hm', { h: String(h), m: String(m) });
  };

  const active = tournaments.filter(t => t.status === 'active');
  const past   = tournaments.filter(t => t.status !== 'active');

  const DURATION_OPTIONS = [
    { v: 1, l: tr('admin_dur_1h') }, { v: 6, l: tr('admin_dur_6h') }, { v: 12, l: tr('admin_dur_12h') },
    { v: 24, l: tr('admin_dur_24h') }, { v: 48, l: tr('admin_dur_48h') }, { v: 72, l: tr('admin_dur_72h') },
    { v: 168, l: tr('admin_dur_week') },
  ];

  return (
    <div className="space-y-4">
      {/* ── Create form ── */}
      <div className="bg-black/30 rounded-xl p-3 space-y-3 border border-white/10">
        <p className="text-xs font-black text-white/70 flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5 text-primary" /> {tr('admin_trn_create_new')}
        </p>

        <Input
          placeholder={tr('admin_trn_name_ph')}
          value={title}
          onChange={e => setTitle(e.target.value)}
        />

        <div className="flex gap-2">
          <div className="flex-1">
            <p className="text-[10px] text-white/50 mb-1">{tr('admin_trn_ranks_count')}</p>
            <select
              value={topN}
              onChange={e => setTopN(Number(e.target.value))}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none"
            >
              {[3,5,10,20,30,50].map(n => <option key={n} value={n}>{tr('admin_trn_ranks_n', { n: String(n) })}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <p className="text-[10px] text-white/50 mb-1">{tr('admin_trn_duration')}</p>
            <select
              value={durationH}
              onChange={e => setDurationH(Number(e.target.value))}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none"
            >
              {DURATION_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          </div>
        </div>

        {/* Prize inputs — show up to first 10 or topN */}
        <div className="space-y-1.5">
          <p className="text-[10px] text-white/50">{tr('admin_trn_prizes_gram')}</p>
          <div className="grid grid-cols-2 gap-1.5">
            {Array.from({ length: Math.min(topN, 10) }, (_, i) => (
              <div key={i + 1} className="flex items-center gap-2 bg-black/20 rounded-xl px-2 py-1.5">
                <span className="text-xs font-bold text-white/70 w-7 flex-shrink-0">{rankLabel(i + 1)}</span>
                <input
                  type="number"
                  min={0}
                  placeholder="0"
                  value={prizeValues[i + 1] ?? ''}
                  onChange={e => setPrizeValues(p => ({ ...p, [i + 1]: e.target.value }))}
                  className="w-full bg-transparent text-white text-sm focus:outline-none"
                />
                <span className="text-[10px] text-white/30 flex-shrink-0">gram</span>
              </div>
            ))}
          </div>
          {topN > 10 && (
            <p className="text-[10px] text-white/40">
              {tr('admin_trn_ranks_noprize', { topN: String(topN) })}
            </p>
          )}
        </div>

        <StatusMsg msg={status} isError={status.startsWith('❌')} />
        <Btn onClick={create} disabled={!title.trim()} className="w-full">
          <Trophy className="w-3.5 h-3.5" /> {tr('admin_trn_create_btn')}
        </Btn>
      </div>

      {/* ── Active tournaments ── */}
      {loading ? (
        <div className="text-muted-foreground text-sm">{tr('admin_loading')}</div>
      ) : active.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-black text-success flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5" /> {tr('admin_trn_active_count', { n: String(active.length) })}
          </p>
          {active.map(t => (
            <div key={t.id} className="bg-success/10 border border-success/30 rounded-xl p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-white font-black text-sm">{t.title}</p>
                  <p className="text-[11px] text-white/50 flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" /> {tr('admin_trn_ends')}: {formatDate(t.endsAt)} · {tr('admin_trn_remaining')}: {timeLeft(t.endsAt)}
                  </p>
                  <p className="text-[11px] text-white/40 mt-0.5">
                    {tr('admin_trn_top_users', { n: String(t.topN) })} · {tr('admin_trn_prizes_count', { n: String(t.prizes.filter(p => p.gram > 0).length) })}
                  </p>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => settle(t.id)}
                    disabled={settling === t.id}
                    className="bg-primary/20 text-primary text-[10px] font-bold rounded-lg px-2 py-1 border border-primary/30"
                  >
                    {settling === t.id ? '...' : tr('admin_trn_settle_now')}
                  </button>
                  <button
                    onClick={() => cancel(t.id)}
                    className="bg-destructive/20 text-destructive text-[10px] font-bold rounded-lg px-2 py-1 border border-destructive/30"
                  >
                    {tr('admin_cancel')}
                  </button>
                </div>
              </div>
              {/* Prize summary */}
              <div className="flex flex-wrap gap-1.5">
                {t.prizes.filter(p => p.gram > 0).slice(0, 5).map(p => (
                  <span key={p.rank} className="text-[10px] bg-black/30 rounded-lg px-2 py-0.5 text-white/70">
                    {rankLabel(p.rank)} {p.gram}g
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-white/40 text-center py-2">{tr('admin_trn_no_active')}</p>
      )}

      {/* ── Past tournaments ── */}
      {past.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-black text-white/50">{tr('admin_trn_past', { n: String(past.length) })}</p>
          {past.slice(0, 5).map(t => (
            <div key={t.id} className="bg-white/5 border border-white/10 rounded-xl p-3">
              <div className="flex items-center justify-between">
                <p className="text-white/80 font-bold text-sm">{t.title}</p>
                <span className={`text-[10px] rounded-full px-2 py-0.5 font-bold ${
                  t.status === 'settled' ? 'bg-success/20 text-success' : 'bg-white/10 text-white/40'
                }`}>
                  {t.status === 'settled' ? tr('admin_trn_finished') : tr('admin_trn_cancelled_status')}
                </span>
              </div>
              <p className="text-[10px] text-white/40 mt-0.5">{formatDate(t.endsAt)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Coin Tournament Section ───────────────────────────────────────────────
// Default prize structure (editable in UI)
const COIN_TRN_DEFAULT_TITLE = 'GramMiner Coin Tournament';

const DEFAULT_COIN_PRIZES: Record<number, string> = {
  1: '3500', 2: '2500', 3: '2000',
  4: '1000', 5: '1000', 6: '1000',
  7: '500', 8: '500', 9: '500', 10: '500',
  11: '500', 12: '500', 13: '500', 14: '500', 15: '500',
  16: '300', 17: '300', 18: '300', 19: '300', 20: '300',
};

function CoinTournamentSection() {
  const { t: tr, lang } = useLanguage();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading]         = useState(true);
  const [status, setStatus]           = useState('');
  const [settling, setSettling]       = useState<number | null>(null);
  const [title, setTitle]             = useState(COIN_TRN_DEFAULT_TITLE);
  const [durationH, setDurationH]     = useState(15 * 24); // 15 days
  const [prizeValues, setPrizeValues] = useState<Record<number, string>>({ ...DEFAULT_COIN_PRIZES });

  const topN = 20; // fixed for coin tournament

  const load = useCallback(async () => {
    try {
      const data = await api<Tournament[]>('GET', '/admin/general?type=tournament&tournamentType=coin');
      setTournaments(data.filter(t => t.tournamentType === 'coin'));
    } catch (e: any) { setStatus(`❌ ${e.message}`); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const rankLabel = (r: number) => r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : `#${r}`;

  const flash = (msg: string) => { setStatus(msg); setTimeout(() => setStatus(''), 3000); };

  const create = async () => {
    if (!title.trim()) { flash(tr('admin_trn_enter_name')); return; }
    const prizes = Array.from({ length: topN }, (_, i) => ({
      rank: i + 1,
      gram: 0,
      coins: Number(prizeValues[i + 1] ?? 0),
    })).filter(p => p.coins > 0);
    try {
      setStatus('');
      await api('POST', '/admin/general?type=tournament', {
        title: title.trim(),
        topN,
        durationHours: durationH,
        prizes,
        tournamentType: 'coin',
      });
      flash(tr('admin_trn_created'));
      await load();
    } catch (e: any) { flash(`❌ ${e.message}`); }
  };

  const cancel = async (id: number) => {
    if (!confirm(tr('admin_trn_cancel_forever'))) return;
    try {
      await api('DELETE', `/admin/general?type=tournament&id=${id}`);
      flash(tr('admin_trn_cancelled'));
      await load();
    } catch (e: any) { flash(`❌ ${e.message}`); }
  };

  const settle = async (id: number) => {
    if (!confirm(tr('admin_trn_settle_now_confirm'))) return;
    setSettling(id);
    try {
      await api('POST', `/admin/general?type=tournament&action=settle&id=${id}`);
      flash(tr('admin_trn_distributed'));
      await load();
    } catch (e: any) { flash(`❌ ${e.message}`); }
    finally { setSettling(null); }
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short' });

  const timeLeft = (endsAt: string) => {
    const diff = new Date(endsAt).getTime() - Date.now();
    if (diff <= 0) return tr('admin_trn_ended');
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    return d > 0 ? tr('admin_trn_dh', { d: String(d), h: String(h) }) : tr('admin_trn_hm', { h: String(h), m: String(Math.floor((diff % 3600000) / 60000)) });
  };

  const DURATION_OPTIONS = [
    { v: 24,      l: tr('admin_dur_1day') },
    { v: 3 * 24,  l: tr('admin_dur_3days') },
    { v: 7 * 24,  l: tr('admin_dur_week') },
    { v: 15 * 24, l: tr('admin_dur_15days') },
    { v: 30 * 24, l: tr('admin_dur_30days') },
  ];

  const active = tournaments.filter(t => t.status === 'active');
  const past   = tournaments.filter(t => t.status !== 'active');
  const hasActive = active.length > 0;

  return (
    <div className="space-y-4">
      {/* ── Active tournament card ── */}
      {loading ? (
        <div className="text-muted-foreground text-sm">{tr('admin_loading')}</div>
      ) : hasActive ? (
        <div className="space-y-2">
          {active.map(t => (
            <div key={t.id} className="bg-primary/10 border border-primary/30 rounded-xl p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-white font-black text-sm">{t.title}</p>
                  <p className="text-[11px] text-white/50 flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" /> {tr('admin_trn_ends')}: {formatDate(t.endsAt)} · {tr('admin_trn_remaining')}: {timeLeft(t.endsAt)}
                  </p>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => settle(t.id)}
                    disabled={settling === t.id}
                    className="bg-primary/20 text-primary text-[10px] font-bold rounded-lg px-2 py-1 border border-primary/30"
                  >
                    {settling === t.id ? '...' : tr('admin_trn_distribute_now')}
                  </button>
                  <button
                    onClick={() => cancel(t.id)}
                    className="bg-destructive/20 text-destructive text-[10px] font-bold rounded-lg px-2 py-1 border border-destructive/30"
                  >
                    {tr('admin_cancel')}
                  </button>
                </div>
              </div>
              {/* Prize preview */}
              <div className="flex flex-wrap gap-1">
                {t.prizes.filter(p => (p.coins ?? p.gram) > 0).slice(0, 6).map(p => (
                  <span key={p.rank} className="text-[10px] bg-black/30 rounded-lg px-2 py-0.5 text-primary font-bold">
                    {rankLabel(p.rank)} {(p.coins ?? p.gram).toLocaleString()} coin
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* ── Create / Restart form ── */}
      <div className="bg-black/30 rounded-xl p-3 space-y-3 border border-white/10">
        <p className="text-xs font-black text-white/70 flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5 text-primary" />
          {hasActive ? tr('admin_coin_new_cycle') : tr('admin_coin_create_new')}
        </p>

        <Input
          placeholder={tr('admin_trn_name_simple')}
          value={title}
          onChange={e => setTitle(e.target.value)}
        />

        <div>
          <p className="text-[10px] text-white/50 mb-1">{tr('admin_trn_duration_full')}</p>
          <select
            value={durationH}
            onChange={e => setDurationH(Number(e.target.value))}
            className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none"
          >
            {DURATION_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
        </div>

        {/* Prize editor */}
        <div className="space-y-1.5">
          <p className="text-[10px] text-white/50">{tr('admin_trn_prizes_coin')}</p>
          <div className="grid grid-cols-2 gap-1.5">
            {Array.from({ length: topN }, (_, i) => (
              <div key={i + 1} className="flex items-center gap-2 bg-black/20 rounded-xl px-2 py-1.5">
                <span className="text-xs font-bold text-white/70 w-7 flex-shrink-0">{rankLabel(i + 1)}</span>
                <input
                  type="number"
                  min={0}
                  placeholder="0"
                  value={prizeValues[i + 1] ?? ''}
                  onChange={e => setPrizeValues(p => ({ ...p, [i + 1]: e.target.value }))}
                  className="w-full bg-transparent text-white text-sm focus:outline-none"
                />
                <span className="text-[10px] text-primary/60 flex-shrink-0">coin</span>
              </div>
            ))}
          </div>
        </div>

        <button
          className="text-[10px] text-primary underline"
          onClick={() => setPrizeValues({ ...DEFAULT_COIN_PRIZES })}
        >
          {tr('admin_reset_defaults')}
        </button>

        <StatusMsg msg={status} isError={status.startsWith('❌')} />
        <Btn onClick={create} disabled={!title.trim()} className="w-full">
          <Trophy className="w-3.5 h-3.5" />
          {hasActive ? tr('admin_coin_new_cycle_btn') : tr('admin_coin_launch')}
        </Btn>
      </div>

      {/* ── Past coin tournaments ── */}
      {past.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-black text-white/50">{tr('admin_trn_past', { n: String(past.length) })}</p>
          {past.slice(0, 5).map(t => (
            <div key={t.id} className="bg-white/5 border border-white/10 rounded-xl p-3">
              <div className="flex items-center justify-between">
                <p className="text-white/80 font-bold text-sm">{t.title}</p>
                <span className={`text-[10px] rounded-full px-2 py-0.5 font-bold ${
                  t.status === 'settled' ? 'bg-success/20 text-success' : 'bg-white/10 text-white/40'
                }`}>
                  {t.status === 'settled' ? tr('admin_trn_finished') : tr('admin_trn_cancelled_status')}
                </span>
              </div>
              <p className="text-[10px] text-white/40 mt-0.5">{formatDate(t.endsAt)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Admin Page ───────────────────────────────────────────────────────
export default function Admin() {
  const { t } = useLanguage();
  return (
    <div className="min-h-full flex flex-col relative w-full">
      <div className="absolute inset-0 z-0" style={{ backgroundColor: 'rgba(0,0,0,0.75)' }} />

      {/* Header */}
      <div className="relative z-10 flex items-center gap-3 px-4 py-4 border-b border-white/10">
        <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center">
          <Shield className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-black text-white">{t('admin_dashboard')}</h1>
          <p className="text-[10px] text-muted-foreground">GramMiner Admin Panel</p>
        </div>
      </div>

      {/* Stacked sections */}
      <div className="relative z-10 flex-1 overflow-y-auto p-3">
        <Section title={t('admin_sec_stats')} icon={BarChart3} defaultOpen>
          <StatsSection />
        </Section>
        <Section title={t('admin_sec_broadcast')} icon={Send}>
          <BroadcastSection />
        </Section>
        <Section title={t('admin_sec_maintenance')} icon={Wrench}>
          <MaintenanceSection />
        </Section>
        <Section title={t('admin_sec_welcome')} icon={MessageSquare}>
          <WelcomeSection />
        </Section>
        <Section title={t('admin_sec_tasks')} icon={ClipboardList}>
          <TasksSection />
        </Section>
        <Section title={t('admin_sec_referral')} icon={DollarSign}>
          <ReferralSection />
        </Section>
        <Section title={t('admin_sec_milestones')} icon={UserPlus}>
          <MilestonesSection />
        </Section>
        <Section title={t('admin_sec_users')} icon={Users}>
          <UsersSection />
        </Section>
        <Section title={t('admin_sec_miners')} icon={Pickaxe}>
          <MinersSection />
        </Section>
        <Section title={t('admin_sec_limits')} icon={ArrowDownUp}>
          <LimitsSection />
        </Section>
        <Section title={t('admin_sec_channels')} icon={Radio}>
          <ChannelsSection />
        </Section>
        <Section title={t('admin_sec_withdrawals')} icon={ArrowUp}>
          <WithdrawalsSection />
        </Section>
        <Section title={t('admin_sec_subadmins')} icon={UserPlus}>
          <AdminsSection />
        </Section>
        <Section title={t('admin_sec_combo')} icon={Sparkles}>
          <ComboDailySection />
        </Section>
        <Section title={t('admin_sec_coin_tournament')} icon={Coins}>
          <CoinTournamentSection />
        </Section>
        <Section title={t('admin_sec_gram_tournament')} icon={Trophy}>
          <TournamentSection />
        </Section>
        <Section title={t('admin_sec_store')} icon={ShoppingBag}>
          <StoreSettingsSection />
        </Section>
      </div>
    </div>
  );
}

// ─── Store Settings Section ────────────────────────────────────────────────
function StoreSettingsSection() {
  const { t } = useLanguage();
  const [coinsPerGram, setCoinsPerGram]   = useState('700');
  const [dailyGram,    setDailyGram]      = useState('0.05');
  const [monthlyGram,  setMonthlyGram]    = useState('1.50');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Record<string, string>>('GET', '/admin/general?type=settings').then(s => {
      if (s['store_coins_per_gram'])  setCoinsPerGram(s['store_coins_per_gram']);
      if (s['store_daily_gram'])      setDailyGram(s['store_daily_gram']);
      if (s['store_monthly_gram'])    setMonthlyGram(s['store_monthly_gram']);
    }).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    const cpg = Number(coinsPerGram);
    const dg  = Number(dailyGram);
    const mg  = Number(monthlyGram);
    if (!cpg || cpg <= 0) { setStatus(t('admin_store_rate_positive')); setTimeout(() => setStatus(''), 2500); return; }
    if (!dg  || dg  <= 0) { setStatus(t('admin_store_daily_positive'));   setTimeout(() => setStatus(''), 2500); return; }
    if (!mg  || mg  <= 0) { setStatus(t('admin_store_monthly_positive'));   setTimeout(() => setStatus(''), 2500); return; }
    try {
      await Promise.all([
        api('POST', '/admin/general?type=settings', { key: 'store_coins_per_gram', value: String(cpg) }),
        api('POST', '/admin/general?type=settings', { key: 'store_daily_gram',     value: String(dg)  }),
        api('POST', '/admin/general?type=settings', { key: 'store_monthly_gram',   value: String(mg)  }),
      ]);
      setStatus(t('admin_store_saved'));
    } catch { setStatus(t('admin_save_failed')); }
    setTimeout(() => setStatus(''), 2500);
  };

  if (loading) return <div className="text-muted-foreground text-sm">{t('admin_loading')}</div>;

  const dailyCoins   = Math.round(Number(dailyGram)   * Number(coinsPerGram));
  const monthlyCoins = Math.round(Number(monthlyGram) * Number(coinsPerGram));

  return (
    <div className="space-y-4">
      {/* Exchange rate */}
      <div className="bg-black/40 rounded-xl p-3 space-y-2">
        <p className="text-xs text-white/50 font-bold uppercase tracking-wider">{t('admin_exchange_rate')}</p>
        <div className="flex items-center gap-2">
          <input
            type="number" min="1" step="1" value={coinsPerGram}
            onChange={e => setCoinsPerGram(e.target.value)}
            className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-primary/50"
          />
          <span className="text-white/60 text-sm font-bold whitespace-nowrap">coin = 1 gram</span>
        </div>
      </div>

      {/* Daily plan */}
      <div className="bg-black/40 rounded-xl p-3 space-y-2">
        <p className="text-xs text-white/50 font-bold uppercase tracking-wider">{t('admin_daily_plan')}</p>
        <div className="flex items-center gap-2">
          <input
            type="number" min="0.001" step="0.001" value={dailyGram}
            onChange={e => setDailyGram(e.target.value)}
            className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-primary/50"
          />
          <span className="text-white/60 text-sm font-bold whitespace-nowrap">gram</span>
        </div>
        <p className="text-xs text-primary/70">= {dailyCoins} coin {t('admin_base_plan_700')}</p>
      </div>

      {/* Monthly plan */}
      <div className="bg-black/40 rounded-xl p-3 space-y-2">
        <p className="text-xs text-white/50 font-bold uppercase tracking-wider">{t('admin_monthly_plan')}</p>
        <div className="flex items-center gap-2">
          <input
            type="number" min="0.001" step="0.001" value={monthlyGram}
            onChange={e => setMonthlyGram(e.target.value)}
            className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-primary/50"
          />
          <span className="text-white/60 text-sm font-bold whitespace-nowrap">gram</span>
        </div>
        <p className="text-xs text-primary/70">= {monthlyCoins} coin {t('admin_base_plan_700')}</p>
      </div>

      <StatusMsg msg={status} isError={status.startsWith('❌')} />
      <Btn onClick={save} className="w-full"><ShoppingBag className="w-3.5 h-3.5" />{t('admin_save_store')}</Btn>
    </div>
  );
}
