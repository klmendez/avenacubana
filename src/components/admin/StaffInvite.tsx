import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';

type StaffAccount = { email: string; role: string; active: boolean; account_exists: boolean };
export default function StaffInvite() {
  const [accounts, setAccounts] = useState<StaffAccount[]>([]);
  const [listError, setListError] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  async function loadAccounts() {
    if (!supabase) return;
    const result = await supabase.rpc('list_staff_accounts');
    if (result.error) setListError(result.error.message);
    else { setAccounts(result.data ?? []); setListError(''); }
  }
  useEffect(() => { void loadAccounts(); }, []);
  async function resetPassword(event: FormEvent) {
    event.preventDefault();
    if (!supabase || resetBusy) return;
    setResetBusy(true); setMessage('');
    const result = await supabase.rpc('reset_staff_password', { p_email: resetEmail, p_password: newPassword });
    if (result.error) setMessage(result.error.message);
    else { setMessage('Contrase?a actualizada para ' + resetEmail); setNewPassword(''); setResetEmail(''); }
    setResetBusy(false);
  }
  const [email,setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [byLink, setByLink] = useState(false);
  const [role,setRole] = useState('caja');
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  async function invite(event: FormEvent) {
    event.preventDefault();
    if (!supabase || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const address = email.trim().toLowerCase();
      if (byLink) {
        const access = await supabase.rpc('authorize_staff_email', { p_email: address, p_role: role });
        if (access.error) throw new Error(access.error.message);
        const link = await supabase.auth.signInWithOtp({ email: address, options: {
          shouldCreateUser: true, emailRedirectTo: window.location.origin + '/admin',
        } });
        if (link.error) throw new Error('Correo autorizado. Falló el envío del enlace: ' + link.error.message);
        setMessage('Enlace de acceso enviado a ' + address);
      } else {
        const result = await supabase.rpc('create_staff_login', { p_email: address, p_password: password, p_role: role });
        if (result.error) throw new Error(result.error.message);
        setPassword('');
        setMessage('Usuario creado. Ya puede entrar al panel con ' + address + ' y la contraseña asignada.');
      }
      setEmail('');
      await loadAccounts();
    } catch (e) { setMessage(e instanceof Error ? e.message : 'No se pudo completar el alta.'); }
    finally { setBusy(false); }
  }
  return <section className="my-4 rounded-lg border border-sky-200 p-4"><h2 className="font-semibold">Crear usuario de personal</h2>
    <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={invite}>
      <label>Tipo de acceso<select value={byLink ? 'link' : 'password'} onChange={event => { setByLink(event.target.value === 'link'); setPassword(''); setMessage(''); }} className="block border p-2"><option value="password">Usuario y contraseña</option><option value="link">Enlace por correo</option></select></label>
      <label>Usuario (correo electrónico)<input required type="email" value={email} onChange={e=>setEmail(e.target.value)} className="block border p-2"/></label>
      {!byLink && <label>Contraseña<input type="password" required minLength={8} autoComplete="new-password" placeholder="Mínimo 8 caracteres" value={password} onChange={event => setPassword(event.target.value)} className="block border p-2" /></label>}
      <label>Turno<select value={role} onChange={e=>setRole(e.target.value)} className="block border p-2"><option value="caja">Caja</option><option value="manana">Mañana</option><option value="tarde">Tarde</option></select></label>
      <button disabled={busy} className="rounded bg-sky-700 px-4 py-2 text-white">{busy?'Guardando…':byLink?'Autorizar y enviar enlace':'Crear usuario'}</button>
    </form><p role="status" className="mt-3 text-sm">{message}</p>
    <div className="mt-8 border-t border-sky-200 pt-5"><h2 className="text-lg font-semibold">Usuarios y accesos</h2>
      <p className="mt-1 text-sm text-slate-600">Puedes asignar una nueva contrase?a a cada usuario.</p>
      {listError && <p role="alert" className="mt-2 text-red-700">{listError}</p>}
      {!listError && accounts.length === 0 && <p className="mt-3 text-sm">No hay usuarios de personal registrados.</p>}
      <div className="mt-4 divide-y divide-sky-100">{accounts.map(account => <div key={account.email} className="flex flex-wrap items-center gap-3 py-3">
        <div className="min-w-0 flex-1"><strong className="block break-all">{account.email}</strong><span className="text-sm text-slate-600">{account.role === 'manana' ? 'Mañana' : account.role === 'tarde' ? 'Tarde' : 'Caja'} · {!account.active ? 'Acceso inactivo' : account.account_exists ? 'Acceso activo' : 'Cuenta pendiente'}</span></div>
        {account.active && account.account_exists && <button type="button" className="rounded border border-sky-500 px-3 py-2 text-sm text-sky-700" onClick={() => { setResetEmail(account.email); setNewPassword(''); setMessage(''); }}>Cambiar contrase?a</button>}
      </div>)}</div>
      {resetEmail && <form onSubmit={resetPassword} className="mt-4 flex flex-wrap items-end gap-3"><label className="text-sm">Nueva contrase?a para {resetEmail}<input type="password" required minLength={8} autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="block border p-2" /></label><button disabled={resetBusy} className="rounded bg-sky-700 px-4 py-2 text-white">{resetBusy ? 'Guardando?' : 'Guardar contrase?a'}</button><button type="button" onClick={() => { setResetEmail(''); setNewPassword(''); }} className="px-3 py-2">Cancelar</button></form>}
    </div></section>;
}
