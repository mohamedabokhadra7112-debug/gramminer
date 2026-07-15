import { useState, useEffect, useCallback } from 'react';
import { Shield, BarChart3, MessageSquare, ClipboardList, Radio, DollarSign, Users, Plus, Trash2, Eye, EyeOff, Ban, Coins, AlertTriangle } from 'lucide-react';

// Admin panel is only mounted when the verified user is admin.
// All API calls include the Telegram initData for server-side verification.

const API = import.meta.env.VITE_API_URL ?? '';

function initData(): string {
  return window.Telegram?.WebApp?.initData ?? '';
}

function adminHeaders(): HeadersInit {
  return { 'Content-Type': 'application/json', 'x-telegram-initdata': initData() };
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}/api${path}`, {
    method,
    headers: adminHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Stats { totalUsers: number; blockedUsers: number; activeUsers: number }
interface Task { id: number; title: string; description: string; reward: number; isDaily: boolean; isHidden: boolean }
interface Channel { id: number; channelUsername: string; channelName: string }
interface User { id: number; telegramId: number; username: string | null; firstName: string | null; balance: number; isBanned: boolean; restrictWithdrawal: boolean }

// ─── Section components ───────────────────────────────────────────────────────

function StatsSection() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api<Stats>('GET', '/admin/stats').then(setStats).catch(e => setErr(e.message));
  }, []);

  if (err) return <div className="text-destructive text-sm p-4">{err}</div>;
  if (!stats) return <div className="text-muted-foreground text-sm p-4">جار التحميل...</div>;

  const cards = [
    { label: 'إجمالي المستخدمين', value: stats.totalUsers, color: 'text-primary' },
    { label: 'حظروا البوت', value: stats.blockedUsers, color: 'text-destructive' },
    { label: 'نشطون الآن (5 دقائق)', value: stats.activeUsers, color: 'text-success' },
  ];
  return (
    <div className="grid grid-cols-1 gap-3">
      {cards.map(c => (
        <div key={c.label} className="bg-secondary/60 rounded-2xl p-4 flex items-center justify-between border border-white/5">
          <span className="text-sm text-muted-foreground">{c.label}</span>
          <span className={`text-2xl font-black ${c.color}`}>{c.value}</span>
        </div>
      ))}
    </div>
  );
}

function WelcomeSection() {
  const [msg, setMsg] = useState('');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Record<string, string>>('GET', '/admin/settings')
      .then(s => setMsg(s['welcome_message'] ?? ''))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    await api('POST', '/admin/settings', { key: 'welcome_message', value: msg });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading) return <div className="text-muted-foreground text-sm">جار التحميل...</div>;
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">استخدم <code className="text-primary">{'{first_name}'}</code> لاسم المستخدم. فارغ = الرسالة الافتراضية.</p>
      <textarea
        value={msg}
        onChange={e => setMsg(e.target.value)}
        rows={6}
        placeholder="اكتب رسالة الترحيب هنا..."
        className="w-full bg-secondary/60 border border-white/10 rounded-xl p-3 text-white text-sm resize-none focus:outline-none focus:border-primary/50"
      />
      <button onClick={save} className="w-full py-3 rounded-xl bg-primary text-black font-black text-sm">
        {saved ? '✅ تم الحفظ' : 'حفظ الرسالة'}
      </button>
    </div>
  );
}

function TasksSection() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [form, setForm] = useState({ title: '', description: '', reward: '', isDaily: false });
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    api<Task[]>('GET', '/admin/tasks').then(setTasks).catch(e => setErr(e.message));
  }, []);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!form.title) return;
    await api('POST', '/admin/tasks', { ...form, reward: Number(form.reward) || 0 });
    setForm({ title: '', description: '', reward: '', isDaily: false });
    load();
  };

  const del = async (id: number) => { await api('DELETE', `/admin/tasks/${id}`); load(); };
  const toggle = async (t: Task) => { await api('PATCH', `/admin/tasks/${t.id}`, { isHidden: !t.isHidden }); load(); };
  const toggleDaily = async (t: Task) => { await api('PATCH', `/admin/tasks/${t.id}`, { isDaily: !t.isDaily }); load(); };

  return (
    <div className="space-y-4">
      {err && <div className="text-destructive text-xs">{err}</div>}
      {/* Add form */}
      <div className="bg-secondary/40 rounded-2xl p-4 space-y-2 border border-white/5">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">إضافة مهمة جديدة</p>
        <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="العنوان *" className="w-full bg-black/40 border border-white/10 rounded-xl p-2 text-white text-sm focus:outline-none focus:border-primary/50" />
        <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="الوصف" className="w-full bg-black/40 border border-white/10 rounded-xl p-2 text-white text-sm focus:outline-none focus:border-primary/50" />
        <input value={form.reward} onChange={e => setForm(f => ({ ...f, reward: e.target.value }))} placeholder="المكافأة (GMR)" type="number" className="w-full bg-black/40 border border-white/10 rounded-xl p-2 text-white text-sm focus:outline-none focus:border-primary/50" />
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.isDaily} onChange={e => setForm(f => ({ ...f, isDaily: e.target.checked }))} className="w-4 h-4 accent-primary" />
          <span className="text-sm text-white">مهمة يومية (Check-in)</span>
        </label>
        <button onClick={add} className="w-full py-2 rounded-xl bg-primary text-black font-black text-sm flex items-center justify-center gap-2"><Plus className="w-4 h-4" />إضافة</button>
      </div>
      {/* List */}
      <div className="space-y-2">
        {tasks.map(t => (
          <div key={t.id} className={`bg-secondary/60 rounded-xl p-3 border border-white/5 flex items-start justify-between gap-2 ${t.isHidden ? 'opacity-50' : ''}`}>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-white text-sm truncate">{t.title}</div>
              <div className="text-xs text-muted-foreground">{t.reward} GMR {t.isDaily && '• يومي'}</div>
            </div>
            <div className="flex gap-1 flex-shrink-0">
              <button onClick={() => toggleDaily(t)} className={`p-1.5 rounded-lg ${t.isDaily ? 'text-primary bg-primary/20' : 'text-muted-foreground bg-white/5'}`} title="تبديل يومي"><ClipboardList className="w-3.5 h-3.5" /></button>
              <button onClick={() => toggle(t)} className="p-1.5 rounded-lg text-muted-foreground hover:text-white bg-white/5">{t.isHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}</button>
              <button onClick={() => del(t.id)} className="p-1.5 rounded-lg text-destructive bg-destructive/10"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        ))}
        {tasks.length === 0 && <div className="text-center text-muted-foreground text-sm py-6">لا توجد مهام</div>}
      </div>
    </div>
  );
}

function ChannelsSection() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');

  const load = useCallback(() => { api<Channel[]>('GET', '/admin/channels').then(setChannels); }, []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!username) return;
    await api('POST', '/admin/channels', { channelUsername: username, channelName: name || username });
    setUsername(''); setName(''); load();
  };
  const del = async (id: number) => { await api('DELETE', `/admin/channels/${id}`); load(); };

  return (
    <div className="space-y-4">
      <div className="bg-secondary/40 rounded-2xl p-4 space-y-2 border border-white/5">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">إضافة قناة</p>
        <input value={username} onChange={e => setUsername(e.target.value)} placeholder="@channelUsername *" className="w-full bg-black/40 border border-white/10 rounded-xl p-2 text-white text-sm focus:outline-none focus:border-primary/50 text-left" dir="ltr" />
        <input value={name} onChange={e => setName(e.target.value)} placeholder="الاسم المعروض" className="w-full bg-black/40 border border-white/10 rounded-xl p-2 text-white text-sm focus:outline-none focus:border-primary/50" />
        <button onClick={add} className="w-full py-2 rounded-xl bg-primary text-black font-black text-sm flex items-center justify-center gap-2"><Plus className="w-4 h-4" />إضافة</button>
      </div>
      <div className="space-y-2">
        {channels.map(c => (
          <div key={c.id} className="bg-secondary/60 rounded-xl p-3 border border-white/5 flex items-center justify-between">
            <div>
              <div className="font-bold text-white text-sm">{c.channelName || c.channelUsername}</div>
              <div className="text-xs text-muted-foreground font-mono">@{c.channelUsername}</div>
            </div>
            <button onClick={() => del(c.id)} className="p-1.5 rounded-lg text-destructive bg-destructive/10"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        ))}
        {channels.length === 0 && <div className="text-center text-muted-foreground text-sm py-6">لا توجد قنوات إجبارية</div>}
      </div>
    </div>
  );
}

function ReferralSection() {
  const [price, setPrice] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api<Record<string, string>>('GET', '/admin/settings').then(s => setPrice(s['referral_price'] ?? '0.01'));
  }, []);

  const save = async () => {
    await api('POST', '/admin/settings', { key: 'referral_price', value: price });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">قيمة المكافأة بالـ GMR لكل صديق محال:</p>
      <input
        value={price}
        onChange={e => setPrice(e.target.value)}
        type="number"
        step="0.001"
        min="0"
        className="w-full bg-secondary/60 border border-white/10 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-primary/50 text-center text-xl font-black"
      />
      <button onClick={save} className="w-full py-3 rounded-xl bg-primary text-black font-black text-sm">
        {saved ? '✅ تم الحفظ' : 'حفظ السعر'}
      </button>
    </div>
  );
}

function UsersSection() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [msg, setMsg] = useState('');
  const [amount, setAmount] = useState('');

  const search = async () => {
    if (!query) return;
    const users = await api<User[]>('GET', `/admin/users/search?q=${encodeURIComponent(query)}`);
    setResults(users);
    setMsg('');
  };

  const action = async (url: string, body: unknown) => {
    await api('POST', url, body);
    setMsg('✅ تم');
    search();
    setTimeout(() => setMsg(''), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="telegram_id أو username"
          className="flex-1 bg-secondary/60 border border-white/10 rounded-xl p-2 text-white text-sm focus:outline-none focus:border-primary/50"
          dir="ltr"
        />
        <button onClick={search} className="px-4 py-2 rounded-xl bg-primary text-black font-black text-sm">بحث</button>
      </div>
      {msg && <div className="text-success text-sm text-center">{msg}</div>}
      {results.map(u => (
        <div key={u.id} className="bg-secondary/60 rounded-2xl p-4 space-y-3 border border-white/5">
          <div>
            <div className="font-bold text-white">{u.firstName ?? u.username ?? 'مجهول'}</div>
            <div className="text-xs text-muted-foreground font-mono">ID: {u.telegramId} {u.username && `• @${u.username}`}</div>
            <div className="text-xs text-primary font-bold mt-1">{u.balance.toFixed(4)} GMR</div>
          </div>
          {/* Balance */}
          <div className="flex gap-2">
            <input value={amount} onChange={e => setAmount(e.target.value)} type="number" placeholder="الكمية" className="flex-1 bg-black/40 border border-white/10 rounded-xl p-2 text-white text-sm focus:outline-none" />
            <button onClick={() => action(`/admin/users/${u.telegramId}/balance`, { amount: Number(amount) })} className="px-3 py-2 rounded-xl bg-success/20 text-success font-bold text-xs flex items-center gap-1"><Coins className="w-3 h-3" />إضافة</button>
            <button onClick={() => action(`/admin/users/${u.telegramId}/balance`, { amount: -Number(amount) })} className="px-3 py-2 rounded-xl bg-destructive/20 text-destructive font-bold text-xs flex items-center gap-1"><Coins className="w-3 h-3" />خصم</button>
          </div>
          {/* Actions */}
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => action(`/admin/users/${u.telegramId}/ban`, { ban: !u.isBanned })} className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold ${u.isBanned ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'}`}>
              <Ban className="w-3 h-3" />{u.isBanned ? 'رفع الحظر' : 'حظر'}
            </button>
            <button onClick={() => action(`/admin/users/${u.telegramId}/restrict`, { restrict: !u.restrictWithdrawal })} className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold ${u.restrictWithdrawal ? 'bg-success/20 text-success' : 'bg-amber-500/20 text-amber-400'}`}>
              <AlertTriangle className="w-3 h-3" />{u.restrictWithdrawal ? 'رفع تحذير السحب' : 'تحذير السحب'}
            </button>
          </div>
        </div>
      ))}
      {results.length === 0 && query && <div className="text-center text-muted-foreground text-sm py-4">لا نتائج</div>}
    </div>
  );
}

// ─── Main Admin page ──────────────────────────────────────────────────────────

const TABS = [
  { id: 'stats', label: 'إحصائيات', icon: BarChart3 },
  { id: 'welcome', label: 'الترحيب', icon: MessageSquare },
  { id: 'tasks', label: 'المهام', icon: ClipboardList },
  { id: 'channels', label: 'القنوات', icon: Radio },
  { id: 'referral', label: 'الإحالة', icon: DollarSign },
  { id: 'users', label: 'المستخدمين', icon: Users },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function Admin() {
  const [activeTab, setActiveTab] = useState<TabId>('stats');

  return (
    <div className="min-h-full flex flex-col relative w-full">
      {/* Dark overlay */}
      <div className="absolute inset-0 z-0" style={{ backgroundColor: 'rgba(0,0,0,0.70)' }} />

      {/* Header */}
      <div className="relative z-10 flex items-center gap-3 px-4 py-4 border-b border-white/10">
        <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center">
          <Shield className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-black text-white leading-tight">Admin Panel</h1>
          <p className="text-[10px] text-muted-foreground">GramMiner Control Center</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="relative z-10 flex gap-1 overflow-x-auto px-3 py-2 border-b border-white/5 no-scrollbar">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-shrink-0 flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-colors ${active ? 'bg-primary/20 text-primary' : 'text-muted-foreground'}`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-[10px] font-bold whitespace-nowrap">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="relative z-10 flex-1 overflow-y-auto p-4">
        {activeTab === 'stats' && <StatsSection />}
        {activeTab === 'welcome' && <WelcomeSection />}
        {activeTab === 'tasks' && <TasksSection />}
        {activeTab === 'channels' && <ChannelsSection />}
        {activeTab === 'referral' && <ReferralSection />}
        {activeTab === 'users' && <UsersSection />}
      </div>
    </div>
  );
}
