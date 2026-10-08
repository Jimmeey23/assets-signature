import { useEffect, useState } from 'react';
import App from '../App';
import AdminCenter from './AdminCenter';
import { Logo } from './Logo';
import type { AdminItem } from '../lib/admin';
import type { FormConfig } from '../lib/doc';
import { fetchFormConfig } from '../lib/formConfig';
function Recipient({ token }: { token: string }) {
  const [item, setItem] = useState<AdminItem | null>(null); const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/invitation?token=${encodeURIComponent(token)}`, { signal: controller.signal }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); setItem(data.item); }).catch(e => { if (e.name !== 'AbortError') setError(e.message); });
    return () => controller.abort();
  }, [token]);
  if (!item) return <div className="flex min-h-screen items-center justify-center p-6"><div className="max-w-md rounded-xl border border-neutral-200 bg-white p-8"><Logo height={55} /><h1 className="mt-6 text-xl font-semibold">{error ? 'Unable to open declaration' : 'Opening your declaration…'}</h1><p className="mt-3 text-sm text-neutral-500">{error || 'Loading your assigned assets and admin signatures.'}</p></div></div>;
  return <App initialDocument={item.document} invitationToken={token} alreadySubmitted={Boolean(item.submittedAt)} />;
}
function EmployeeForm() {
  const [config, setConfig] = useState<FormConfig | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetchFormConfig(controller.signal).then(setConfig).catch(() => {});
    return () => controller.abort();
  }, []);
  if (!config) return <div className="flex min-h-screen items-center justify-center"><p className="text-sm text-neutral-400">Loading declaration…</p></div>;
  return <App formConfig={config} />;
}
export default function AppRouter() {
  const [route, setRoute] = useState(() => window.location.hash);
  useEffect(() => { const update = () => setRoute(window.location.hash); window.addEventListener('hashchange', update); return () => window.removeEventListener('hashchange', update); }, []);
  if (route === '#/admin') return <AdminCenter />;
  if (route.startsWith('#/sign/')) return <Recipient key={route} token={route.slice(7)} />;
  return <EmployeeForm />;
}
