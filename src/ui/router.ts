import { useEffect, useState } from 'preact/hooks';
import { BASE } from './api';

/** Path inside the dashboard, without the base: `/requests/123`. */
const currentPath = () => {
    const p = window.location.pathname;
    const inner = p.startsWith(BASE) ? p.slice(BASE.length) : p;
    return inner.replace(/\/+$/, '') || '/';
};

const listeners = new Set<() => void>();
const notify = () => listeners.forEach(l => l());
window.addEventListener('popstate', notify);

export const href = (path: string) => `${BASE}${path === '/' ? '' : path}`;

export const navigate = (path: string, { replace = false } = {}) => {
    const url = href(path);
    if (url === window.location.pathname + window.location.search) return;
    if (replace) history.replaceState(null, '', url);
    else history.pushState(null, '', url);
    window.scrollTo(0, 0);
    notify();
};

/** Re-render on navigation; returns the inner path and query. */
export const useLocation = () => {
    const [, setTick] = useState(0);
    useEffect(() => {
        const l = () => setTick(t => t + 1);
        listeners.add(l);
        return () => {
            listeners.delete(l);
        };
    }, []);
    return { path: currentPath(), query: new URLSearchParams(window.location.search) };
};

/** Match `/requests/:id` style patterns. */
export const match = (pattern: string, path: string): Record<string, string> | null => {
    const a = pattern.split('/').filter(Boolean);
    const b = path.split('/').filter(Boolean);
    if (a.length !== b.length) return null;
    const params: Record<string, string> = {};
    for (let i = 0; i < a.length; i++) {
        if (a[i].startsWith(':')) params[a[i].slice(1)] = decodeURIComponent(b[i]);
        else if (a[i] !== b[i]) return null;
    }
    return params;
};

/** Intercept plain left-clicks on internal links. */
export const onLinkClick = (e: MouseEvent, path: string) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(path);
};
