import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Shield, BarChart3, MessageSquare, ClipboardList, Radio, DollarSign,
  Users, Plus, Trash2, Eye, EyeOff, Ban, Coins, AlertTriangle,
  ChevronDown, ChevronUp, Send, Wrench, Settings, Pickaxe, ArrowDownUp,
  UserPlus, Search, Check, X, ArrowUp,
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL ?? '';

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
  { key: 'stats',       label: 'إحصائيات' },
  { key: 'broadcast',   label: 'إرسال للكل' },
  { key: 'maintenance', label: 'الصيانة' },
  { key: 'welcome',     label: 'رسالة الترحيب' },
  { key: 'tasks',       label: 'المهام' },
  { key: 'referral',    label: 'الإحالات' },
  { key: 'users',       label: 'المستخدمين' },
  { key: 'miners',      label: 'الماينرز' },
  { key: 'limits',      label: 'الحدود' },
  { key: 'channels',    label: 'القنوات' },
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
  const [stats, setStats] = useState<Stats|null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { api<Stats>('GET', '/admin/stats').then(setStats).catch(e => setErr(e.message)); }, []);

  if (err) return <div className="text-destructive text-sm">{err}</div>;
  if (!stats) return <div className="text-muted-foreground text-sm">جار التحميل...</div>;

  return (
    <div className="grid grid-cols-3 gap-2">
      {[
        { label: 'إجمالي', value: stats.totalUsers, color: 'text-primary' },
        { label: 'نشطون', value: stats.activeUsers, color: 'text-success' },
        { label: 'حظروا', value: stats.blockedUsers, color: 'text-destructive' },
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
  const [msg, setMsg] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const send = async () => {
    if (!msg.trim()) return;
    setLoading(true); setStatus('');
    try {
      const { sent, failed, total } = await api<{ sent: number; failed: number; total: number }>(
        'POST', '/admin/broadcast', { message: msg }
      );
      setStatus(`✅ أُرسلت لـ ${sent}/${total} مستخدم (فشل: ${failed})`);
      setMsg('');
    } catch (e: any) { setStatus(`❌ ${e.message}`); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">يدعم HTML: &lt;b&gt;, &lt;i&gt;, &lt;a&gt;, والإيموجي ✅🔥💎</p>
      <textarea
        value={msg}
        onChange={e => setMsg(e.target.value)}
        rows={5}
        placeholder="اكتب الرسالة هنا... 🎉"
        className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white text-sm resize-none focus:outline-none focus:border-primary/50"
      />
      <StatusMsg msg={status} isError={status.startsWith('❌')} />
      <Btn onClick={send} disabled={loading || !msg.trim()} className="w-full">
        <Send className="w-3.5 h-3.5" />{loading ? 'جار الإرسال...' : 'إرسال للجميع'}
      </Btn>
    </div>
  );
}

// ─── 3. Maintenance Mode ───────────────────────────────────────────────────
function MaintenanceSection() {
  const [on, setOn] = useState(false);
  const [msg, setMsg] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Record<string, string>>('GET', '/admin/settings').then(s => {
      setOn(s['maintenance_mode'] === 'true');
      setMsg(s['maintenance_message'] || '🔧 البوت تحت الصيانة، سيعود قريباً!');
    }).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    try {
      await Promise.all([
        api('POST', '/admin/settings', { key: 'maintenance_mode', value: String(on) }),
        api('POST', '/admin/settings', { key: 'maintenance_message', value: msg }),
      ]);
      setStatus('✅ تم الحفظ');
    } catch { setStatus('❌ فشل الحفظ'); }
    setTimeout(() => setStatus(''), 2000);
  };

  if (loading) return <div className="text-muted-foreground text-sm">جار التحميل...</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between bg-black/40 rounded-xl px-4 py-3">
        <span className="text-white font-bold text-sm">وضع الصيانة</span>
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
        placeholder="رسالة الصيانة..."
        className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white text-sm resize-none focus:outline-none focus:border-primary/50"
      />
      <StatusMsg msg={status} isError={status.startsWith('❌')} />
      <Btn onClick={save} className="w-full"><Wrench className="w-3.5 h-3.5" />حفظ الإعدادات</Btn>
    </div>
  );
}

// ─── 4. Welcome Message ────────────────────────────────────────────────────
function WelcomeSection() {
  const [msg, setMsg] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Record<string, string>>('GET', '/admin/settings')
      .then(s => setMsg(s['welcome_message'] || ''))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    try {
      await api('POST', '/admin/settings', { key: 'welcome_message', value: msg });
      setStatus('✅ تم الحفظ');
    } catch { setStatus('❌ فشل'); }
    setTimeout(() => setStatus(''), 2000);
  };

  if (loading) return <div className="text-muted-foreground text-sm">جار التحميل...</div>;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">استخدم <code className="text-primary">{'{first_name}'}</code> لاسم المستخدم.</p>
      <textarea
        value={msg}
        onChange={e => setMsg(e.target.value)}
        rows={6}
        placeholder="اكتب رسالة الترحيب..."
        className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white text-sm resize-none focus:outline-none focus:border-primary/50"
      />
      <StatusMsg msg={status} isError={status.startsWith('❌')} />
      <Btn onClick={save} className="w-full"><MessageSquare className="w-3.5 h-3.5" />حفظ الرسالة</Btn>
    </div>
  );
}

// ─── 5. Tasks ──────────────────────────────────────────────────────────────
function TasksSection() {
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
      load(); setStatus('✅ أُضيفت');
    } catch { setStatus('❌ فشل'); }
    setTimeout(() => setStatus(''), 2000);
  };
  const del = async (id: number) => { await api('DELETE', `/admin/tasks/${id}`); load(); };
  const toggle = async (t: Task) => { await api('PATCH', `/admin/tasks/${t.id}`, { isHidden: !t.isHidden }); load(); };

  return (
    <div className="space-y-3">
      <div className="bg-black/40 rounded-xl p-3 space-y-2 border border-white/5">
        <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="عنوان المهمة *" />
        <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="الوصف (اختياري)" />
        <Input value={form.reward} onChange={e => setForm(f => ({ ...f, reward: e.target.value }))} type="number" placeholder="المكافأة gram" />
        <Input value={form.channelUsername} onChange={e => setForm(f => ({ ...f, channelUsername: e.target.value }))} placeholder="يوزر القناة (اختياري) مثل: @mychannel" dir="ltr" />
        <label className="flex items-center gap-2 cursor-pointer text-sm text-white">
          <input type="checkbox" checked={form.isDaily} onChange={e => setForm(f => ({ ...f, isDaily: e.target.checked }))} className="w-4 h-4 accent-primary" />
          مهمة يومية
        </label>
        <StatusMsg msg={status} isError={status.startsWith('❌')} />
        <Btn onClick={add} className="w-full"><Plus className="w-3.5 h-3.5" />إضافة مهمة</Btn>
      </div>
      <div className="space-y-2">
        {tasks.map(t => (
          <div key={t.id} className={`bg-black/40 rounded-xl p-3 border border-white/5 flex items-start justify-between gap-2 ${t.isHidden ? 'opacity-50' : ''}`}>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-white text-sm truncate">{t.title}</div>
              <div className="text-xs text-muted-foreground">{t.reward} gram{t.isDaily ? ' · يومية' : ''}{t.channelUsername ? ` · 📢 @${t.channelUsername}` : ''}</div>
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
        {tasks.length === 0 && <div className="text-center text-muted-foreground text-sm py-4">لا توجد مهام</div>}
      </div>
    </div>
  );
}

// ─── 6. Referral Settings ──────────────────────────────────────────────────
function ReferralSection() {
  const [price, setPrice] = useState('0.01');
  const [desc, setDesc]   = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Record<string, string>>('GET', '/admin/settings').then(s => {
      setPrice(s['referral_price'] || '1');
      setDesc(s['referral_description'] || 'احصل على مكافأة coin مقابل كل صديق تدعوه!');
    }).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    try {
      await Promise.all([
        api('POST', '/admin/settings', { key: 'referral_price', value: price }),
        api('POST', '/admin/settings', { key: 'referral_description', value: desc }),
      ]);
      setStatus('✅ تم الحفظ');
    } catch { setStatus('❌ فشل'); }
    setTimeout(() => setStatus(''), 2000);
  };

  if (loading) return <div className="text-muted-foreground text-sm">جار التحميل...</div>;
  return (
    <div className="space-y-2">
      <label className="text-xs text-muted-foreground">قيمة المكافأة (coin) لكل صديق:</label>
      <Input value={price} onChange={e => setPrice(e.target.value)} type="number" step="0.001" min="0" className="text-center text-xl font-black" />
      <label className="text-xs text-muted-foreground">وصف الإحالة:</label>
      <textarea
        value={desc}
        onChange={e => setDesc(e.target.value)}
        rows={3}
        className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white text-sm resize-none focus:outline-none focus:border-primary/50"
      />
      <StatusMsg msg={status} isError={status.startsWith('❌')} />
      <Btn onClick={save} className="w-full"><DollarSign className="w-3.5 h-3.5" />حفظ</Btn>
    </div>
  );
}

// ─── 7. User Search & Management ──────────────────────────────────────────
function UsersSection() {
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
      const users = await api<User[]>('GET', `/admin/users/search?q=${encodeURIComponent(query)}`);
      setResults(users);
      if (!users.length) setStatus('لا نتائج');
    } catch (e: any) { setStatus(`❌ ${e.message}`); }
    finally { setLoading(false); }
  };

  const act = async (path: string, body: unknown, successMsg: string) => {
    try {
      await api('POST', path, body);
      setStatus(`✅ ${successMsg}`);
      // Refresh
      const users = await api<User[]>('GET', `/admin/users/search?q=${encodeURIComponent(query)}`);
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
          placeholder="Telegram ID أو @username أو الاسم" dir="ltr" />
        <button onClick={search} disabled={loading} className="flex-shrink-0 px-4 py-2 rounded-xl bg-primary text-black font-black text-sm flex items-center gap-1 disabled:opacity-60">
          <Search className="w-4 h-4" />
        </button>
      </div>
      <StatusMsg msg={status} isError={status.startsWith('❌')} />

      {/* Results list */}
      {!u && results.map(r => (
        <button key={r.id} onClick={() => setSelected(r)}
          className="w-full text-left bg-black/40 rounded-xl p-3 border border-white/5 hover:border-primary/30 transition-colors">
          <div className="font-bold text-white text-sm">{r.firstName ?? r.username ?? 'مجهول'}</div>
          <div className="text-xs text-muted-foreground font-mono">ID: {r.telegramId} {r.username && `· @${r.username}`}</div>
          <div className="text-xs text-primary font-bold mt-0.5">{r.balance.toFixed(4)} gram</div>
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
              <div className="font-bold text-white">{u.firstName ?? u.username ?? 'مجهول'}</div>
              <div className="text-xs text-muted-foreground font-mono">ID: {u.telegramId}</div>
            </div>
            <div className="ml-auto flex gap-1.5">
              {u.isBanned && <span className="text-[10px] bg-destructive/20 text-destructive px-2 py-0.5 rounded-full font-bold">محظور</span>}
              {u.restrictWithdrawal && <span className="text-[10px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-bold">سحب مقيد</span>}
            </div>
          </div>

          <div className="bg-black/40 rounded-xl p-3 text-center">
            <div className="text-2xl font-black text-primary">{u.balance.toFixed(4)} gram</div>
          </div>

          {/* Balance adjustment */}
          <div className="bg-black/40 rounded-xl p-3 space-y-2">
            <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">تعديل الرصيد</p>
            <Input value={amount} onChange={e => setAmount(e.target.value)} type="number" placeholder="الكمية" />
            <div className="flex gap-2">
              <Btn variant="success" size="sm" className="flex-1"
                onClick={() => act(`/admin/users/${u.telegramId}/balance`, { amount: Number(amount) }, 'تم إضافة الرصيد')}>
                <Coins className="w-3 h-3" />إضافة
              </Btn>
              <Btn variant="danger" size="sm" className="flex-1"
                onClick={() => act(`/admin/users/${u.telegramId}/balance`, { amount: -Number(amount) }, 'تم خصم الرصيد')}>
                <Coins className="w-3 h-3" />خصم
              </Btn>
            </div>
            {/* Direct balance correction — overwrites the stored value entirely */}
            <div className="pt-1 border-t border-white/10">
              <p className="text-[10px] text-amber-400 font-bold mb-1.5">⚠️ تصحيح الرصيد (تعيين قيمة مباشرة)</p>
              <div className="flex gap-2">
                <Input value={amount} onChange={e => setAmount(e.target.value)} type="number"
                  placeholder="القيمة الصحيحة" className="flex-1" />
                <Btn variant="ghost" size="sm"
                  onClick={() => {
                    if (!window.confirm(`سيتم تعيين رصيد ${u.firstName ?? u.telegramId} إلى ${amount} gram. هل أنت متأكد؟`)) return;
                    act(`/admin/users/${u.telegramId}/balance/set`, { value: Number(amount) }, `تم تعيين الرصيد إلى ${amount} gram`);
                  }}>
                  <Check className="w-3 h-3" />تعيين
                </Btn>
              </div>
            </div>
          </div>

          {/* Warning message */}
          <div className="bg-black/40 rounded-xl p-3 space-y-2">
            <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">إرسال تحذير</p>
            <textarea
              value={warnMsg}
              onChange={e => setWarnMsg(e.target.value)}
              rows={2}
              placeholder="نص التحذير..."
              className="w-full bg-white/5 border border-white/10 rounded-xl p-2 text-white text-sm resize-none focus:outline-none"
            />
            <Btn variant="ghost" size="sm" className="w-full"
              onClick={() => act(`/admin/users/${u.telegramId}/warn`, { message: warnMsg }, 'تم الإرسال')}>
              <AlertTriangle className="w-3 h-3 text-amber-400" />إرسال التحذير له فقط
            </Btn>
          </div>

          {/* Quick actions */}
          <div className="flex flex-wrap gap-2">
            <Btn variant={u.isBanned ? 'success' : 'danger'} size="sm"
              onClick={() => act(`/admin/users/${u.telegramId}/ban`, { ban: !u.isBanned }, u.isBanned ? 'رُفع الحظر' : 'تم الحظر')}>
              <Ban className="w-3 h-3" />{u.isBanned ? 'رفع الحظر' : 'حظر المستخدم'}
            </Btn>
            <Btn variant={u.restrictWithdrawal ? 'success' : 'ghost'} size="sm"
              onClick={() => act(`/admin/users/${u.telegramId}/restrict`, { restrict: !u.restrictWithdrawal }, u.restrictWithdrawal ? 'رُفع تقييد السحب' : 'تم تقييد السحب')}>
              <ArrowDownUp className="w-3 h-3" />{u.restrictWithdrawal ? 'رفع تقييد السحب' : 'تقييد السحب'}
            </Btn>
            <Btn variant="danger" size="sm"
              onClick={async () => {
                if (!window.confirm(`هل أنت متأكد من مسح حساب ${u.firstName ?? u.telegramId} نهائياً؟`)) return;
                try {
                  await api('DELETE', `/admin/users/${u.telegramId}`, undefined);
                  setStatus('✅ تم مسح الحساب');
                  setSelected(null);
                  setResults(prev => prev.filter(r => r.telegramId !== u.telegramId));
                } catch (e: any) { setStatus(`❌ ${e.message}`); }
                setTimeout(() => setStatus(''), 3000);
              }}>
              <Trash2 className="w-3 h-3" />مسح الحساب
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
  const [miners, setMiners] = useState<Miner[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [newMiner, setNewMiner] = useState({ name: '', baseCost: '', dailyPct: '', description: '' });

  useEffect(() => {
    api<Miner[]>('GET', '/admin/miners').then(setMiners).finally(() => setLoading(false));
  }, []);

  const save = async (updated: Miner[]) => {
    try {
      await api('POST', '/admin/miners', { miners: updated });
      setMiners(updated);
      setStatus('✅ تم الحفظ');
    } catch { setStatus('❌ فشل'); }
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

  if (loading) return <div className="text-muted-foreground text-sm">جار التحميل...</div>;

  return (
    <div className="space-y-3">
      {miners.map(m => (
        <div key={m.id} className="bg-black/40 rounded-xl p-3 border border-white/5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-primary font-bold text-xs">ماينر #{m.id}</span>
            <button onClick={() => removeMiner(m.id)} className="p-1 rounded-lg text-destructive bg-destructive/10 hover:bg-destructive/20">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
          <Input value={m.name} onChange={e => update(m.id, 'name', e.target.value)} placeholder="الاسم" />
          <div className="grid grid-cols-2 gap-2">
            <Input value={m.baseCost} onChange={e => update(m.id, 'baseCost', e.target.value)} type="number" placeholder="التكلفة" />
            <Input value={m.dailyPct} onChange={e => update(m.id, 'dailyPct', e.target.value)} type="number" step="0.01" placeholder="النسبة اليومية" />
          </div>
          <Input value={m.description} onChange={e => update(m.id, 'description', e.target.value)} placeholder="الوصف (اختياري)" />
        </div>
      ))}

      {/* Add new */}
      <div className="bg-black/40 rounded-xl p-3 border border-primary/20 space-y-2">
        <p className="text-xs text-primary font-bold uppercase tracking-widest">إضافة ماينر جديد</p>
        <Input value={newMiner.name} onChange={e => setNewMiner(n => ({ ...n, name: e.target.value }))} placeholder="الاسم *" />
        <div className="grid grid-cols-2 gap-2">
          <Input value={newMiner.baseCost} onChange={e => setNewMiner(n => ({ ...n, baseCost: e.target.value }))} type="number" placeholder="التكلفة" />
          <Input value={newMiner.dailyPct} onChange={e => setNewMiner(n => ({ ...n, dailyPct: e.target.value }))} type="number" step="0.01" placeholder="النسبة 0.05" />
        </div>
        <Input value={newMiner.description} onChange={e => setNewMiner(n => ({ ...n, description: e.target.value }))} placeholder="الوصف" />
        <Btn onClick={addMiner} size="sm" className="w-full"><Plus className="w-3.5 h-3.5" />إضافة</Btn>
      </div>

      <StatusMsg msg={status} isError={status.startsWith('❌')} />
      <Btn onClick={() => save(miners)} className="w-full"><Check className="w-3.5 h-3.5" />حفظ كل التعديلات</Btn>
    </div>
  );
}

// ─── Withdrawals ────────────────────────────────────────────────────────────
function WithdrawalsSection() {
  const [items, setItems] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api<Withdrawal[]>('GET', '/admin/withdrawals').then(setItems).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const approve = async (id: number) => {
    setStatus('⏳ جار الإرسال...');
    try {
      await api('POST', `/admin/withdrawals/${id}/approve`, {});
      setStatus('✅ تمت الموافقة وتم الإرسال');
      load();
    } catch (e: any) { setStatus(`❌ ${e.message}`); }
    setTimeout(() => setStatus(''), 4000);
  };

  const reject = async (id: number) => {
    try {
      await api('POST', `/admin/withdrawals/${id}/reject`, { reason: rejectReason || 'تم الرفض من قبل الإدارة' });
      setStatus('✅ تم الرفض وإعادة الرصيد');
      setRejectId(null); setRejectReason('');
      load();
    } catch (e: any) { setStatus(`❌ ${e.message}`); }
    setTimeout(() => setStatus(''), 3000);
  };

  const statusColor = (s: string) =>
    s === 'approved' ? 'text-green-400' : s === 'rejected' ? 'text-red-400' : 'text-yellow-400';
  const statusLabel = (s: string) =>
    s === 'approved' ? '✅ مقبول' : s === 'rejected' ? '❌ مرفوض' : '⏳ قيد المراجعة';

  if (loading) return <div className="text-muted-foreground text-sm">جار التحميل...</div>;

  return (
    <div className="space-y-3">
      <StatusMsg msg={status} isError={status.startsWith('❌')} />
      <Btn onClick={load} variant="ghost" size="sm" className="w-full">🔄 تحديث</Btn>
      {items.length === 0 && <div className="text-center text-muted-foreground text-sm py-4">لا توجد طلبات</div>}
      {items.map(w => (
        <div key={w.id} className="bg-black/40 rounded-xl p-3 border border-white/5 space-y-2">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-bold text-white text-sm">{w.first_name ?? w.username ?? w.telegram_id}</div>
              <div className="text-xs text-muted-foreground font-mono">ID: {w.telegram_id}</div>
              <div className="text-primary font-black text-sm mt-0.5">{w.amount.toFixed(4)} gram</div>
              <div className="text-[10px] font-mono text-white/50 break-all mt-0.5">{w.wallet_address}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{new Date(w.created_at).toLocaleString('ar')}</div>
            </div>
            <span className={`text-xs font-bold ${statusColor(w.status)}`}>{statusLabel(w.status)}</span>
          </div>
          {w.status === 'pending' && (
            <div className="flex gap-2">
              <Btn size="sm" variant="success" onClick={() => approve(w.id)} className="flex-1">
                <Check className="w-3 h-3" />موافقة + إرسال
              </Btn>
              <Btn size="sm" variant="danger" onClick={() => setRejectId(w.id)} className="flex-1">
                <X className="w-3 h-3" />رفض
              </Btn>
            </div>
          )}
          {rejectId === w.id && (
            <div className="space-y-2">
              <Input value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="سبب الرفض (اختياري)" />
              <div className="flex gap-2">
                <Btn size="sm" variant="danger" onClick={() => reject(w.id)} className="flex-1">تأكيد الرفض</Btn>
                <Btn size="sm" variant="ghost" onClick={() => { setRejectId(null); setRejectReason(''); }} className="flex-1">إلغاء</Btn>
              </div>
            </div>
          )}
          {w.tx_hash && <div className="text-[10px] font-mono text-green-400 break-all">TX: {w.tx_hash}</div>}
          {w.rejection_reason && <div className="text-xs text-red-400">السبب: {w.rejection_reason}</div>}
        </div>
      ))}
    </div>
  );
}

// ─── 9 & 10. Withdrawal & Deposit Limits ──────────────────────────────────
function LimitsSection() {
  const [vals, setVals] = useState({ minWithdraw: '', maxWithdraw: '', minDeposit: '', maxDeposit: '' });
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Record<string, string>>('GET', '/admin/settings').then(s => {
      setVals({ minWithdraw: s['min_withdrawal'] || '0.1', maxWithdraw: s['max_withdrawal'] || '1000', minDeposit: s['min_deposit'] || '0.1', maxDeposit: s['max_deposit'] || '10000' });
    }).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    try {
      await Promise.all([
        api('POST', '/admin/settings', { key: 'min_withdrawal', value: vals.minWithdraw }),
        api('POST', '/admin/settings', { key: 'max_withdrawal', value: vals.maxWithdraw }),
        api('POST', '/admin/settings', { key: 'min_deposit',    value: vals.minDeposit }),
        api('POST', '/admin/settings', { key: 'max_deposit',    value: vals.maxDeposit }),
      ]);
      setStatus('✅ تم الحفظ');
    } catch { setStatus('❌ فشل'); }
    setTimeout(() => setStatus(''), 2000);
  };

  if (loading) return <div className="text-muted-foreground text-sm">جار التحميل...</div>;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">حدود السحب (gram)</p>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="text-xs text-muted-foreground">الحد الأدنى</label><Input value={vals.minWithdraw} onChange={e => setVals(v => ({ ...v, minWithdraw: e.target.value }))} type="number" step="0.1" /></div>
          <div><label className="text-xs text-muted-foreground">الحد الأقصى</label><Input value={vals.maxWithdraw} onChange={e => setVals(v => ({ ...v, maxWithdraw: e.target.value }))} type="number" /></div>
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">حدود الإيداع (gram)</p>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="text-xs text-muted-foreground">الحد الأدنى</label><Input value={vals.minDeposit} onChange={e => setVals(v => ({ ...v, minDeposit: e.target.value }))} type="number" step="0.1" /></div>
          <div><label className="text-xs text-muted-foreground">الحد الأقصى</label><Input value={vals.maxDeposit} onChange={e => setVals(v => ({ ...v, maxDeposit: e.target.value }))} type="number" /></div>
        </div>
      </div>
      <StatusMsg msg={status} isError={status.startsWith('❌')} />
      <Btn onClick={save} className="w-full"><ArrowDownUp className="w-3.5 h-3.5" />حفظ الحدود</Btn>
    </div>
  );
}

// ─── Channels (mandatory subscription) ────────────────────────────────────
function ChannelsSection() {
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
      setUsername(''); setName(''); load(); setStatus('✅ أُضيفت');
    } catch { setStatus('❌ فشل'); }
    setTimeout(() => setStatus(''), 2000);
  };
  const del = async (id: number) => { await api('DELETE', `/admin/channels/${id}`); load(); };

  return (
    <div className="space-y-3">
      <div className="bg-black/40 rounded-xl p-3 space-y-2 border border-white/5">
        <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="@channelUsername *" dir="ltr" />
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="الاسم المعروض" />
        <StatusMsg msg={status} isError={status.startsWith('❌')} />
        <Btn onClick={add} className="w-full"><Plus className="w-3.5 h-3.5" />إضافة قناة</Btn>
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
      {channels.length === 0 && <div className="text-center text-muted-foreground text-sm py-2">لا توجد قنوات</div>}
    </div>
  );
}

// ─── Sub-Admin Management ──────────────────────────────────────────────────
function AdminsSection() {
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
      load(); setStatus('✅ أُضيف');
    } catch { setStatus('❌ فشل'); }
    setTimeout(() => setStatus(''), 2000);
  };

  const remove = async (telegramId: number) => {
    await api('DELETE', `/admin/admins/${telegramId}`, undefined);
    load();
  };

  if (loading) return <div className="text-muted-foreground text-sm">جار التحميل...</div>;

  return (
    <div className="space-y-3">
      <div className="bg-black/40 rounded-xl p-3 space-y-2 border border-white/5">
        <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">إضافة أدمن جديد</p>
        <Input value={tid} onChange={e => setTid(e.target.value)} placeholder="Telegram ID *" type="number" dir="ltr" />
        <Input value={uname} onChange={e => setUname(e.target.value)} placeholder="@username (اختياري)" dir="ltr" />

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">الصلاحيات:</span>
            <button onClick={toggleAll} className="text-xs text-primary font-bold">{allSelected ? 'إلغاء الكل' : 'تحديد الكل'}</button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {ALL_PERMISSIONS.map(p => (
              <label key={p.key} className="flex items-center gap-1.5 cursor-pointer text-xs text-white bg-white/5 rounded-lg px-2 py-1.5">
                <input type="checkbox" checked={perms.includes(p.key)} onChange={() => togglePerm(p.key)} className="w-3.5 h-3.5 accent-primary" />
                {p.label}
              </label>
            ))}
          </div>
        </div>

        <StatusMsg msg={status} isError={status.startsWith('❌')} />
        <Btn onClick={add} className="w-full"><UserPlus className="w-3.5 h-3.5" />إضافة أدمن</Btn>
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
              ? <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full">كل الصلاحيات</span>
              : a.permissions.map(p => {
                const found = ALL_PERMISSIONS.find(x => x.key === p);
                return <span key={p} className="text-[10px] bg-white/10 text-muted-foreground px-2 py-0.5 rounded-full">{found?.label || p}</span>;
              })
            }
          </div>
        </div>
      ))}
      {admins.length === 0 && <div className="text-center text-muted-foreground text-sm py-2">لا يوجد أدمن مساعد</div>}
    </div>
  );
}

// ─── Main Admin Page ───────────────────────────────────────────────────────
export default function Admin() {
  return (
    <div className="min-h-full flex flex-col relative w-full">
      <div className="absolute inset-0 z-0" style={{ backgroundColor: 'rgba(0,0,0,0.75)' }} />

      {/* Header */}
      <div className="relative z-10 flex items-center gap-3 px-4 py-4 border-b border-white/10">
        <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center">
          <Shield className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-black text-white">لوحة التحكم</h1>
          <p className="text-[10px] text-muted-foreground">GramMiner Admin Panel</p>
        </div>
      </div>

      {/* Stacked sections */}
      <div className="relative z-10 flex-1 overflow-y-auto p-3">
        <Section title="الإحصائيات" icon={BarChart3} defaultOpen>
          <StatsSection />
        </Section>
        <Section title="إرسال رسالة للجميع" icon={Send}>
          <BroadcastSection />
        </Section>
        <Section title="وضع الصيانة" icon={Wrench}>
          <MaintenanceSection />
        </Section>
        <Section title="رسالة الترحيب" icon={MessageSquare}>
          <WelcomeSection />
        </Section>
        <Section title="المهام" icon={ClipboardList}>
          <TasksSection />
        </Section>
        <Section title="الإحالات" icon={DollarSign}>
          <ReferralSection />
        </Section>
        <Section title="المستخدمون" icon={Users}>
          <UsersSection />
        </Section>
        <Section title="الماينرز" icon={Pickaxe}>
          <MinersSection />
        </Section>
        <Section title="حدود السحب والإيداع" icon={ArrowDownUp}>
          <LimitsSection />
        </Section>
        <Section title="القنوات الإجبارية" icon={Radio}>
          <ChannelsSection />
        </Section>
        <Section title="طلبات السحب" icon={ArrowUp}>
          <WithdrawalsSection />
        </Section>
        <Section title="الأدمن المساعدون" icon={UserPlus}>
          <AdminsSection />
        </Section>
      </div>
    </div>
  );
}
