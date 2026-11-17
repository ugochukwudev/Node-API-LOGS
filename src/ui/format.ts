const nf = new Intl.NumberFormat();

export const num = (n: number | null | undefined) => (n === null || n === undefined ? '–' : nf.format(Math.round(n)));

export const ms = (n: number | null | undefined) => {
    if (n === null || n === undefined) return '–';
    if (n >= 10000) return `${(n / 1000).toFixed(1)} s`;
    if (n >= 1000) return `${(n / 1000).toFixed(2)} s`;
    return `${Math.round(n)} ms`;
};

export const pct = (n: number) => `${n >= 10 || n === 0 ? n.toFixed(0) : n.toFixed(1)}%`;

export const bytes = (n: number) => {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (n >= 1024 && i < units.length - 1) {
        n /= 1024;
        i++;
    }
    return `${n.toFixed(i ? 1 : 0)} ${units[i]}`;
};

export const duration = (seconds: number) => {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
};

export const dateTime = (d: string | Date | null | undefined) => {
    if (!d) return '–';
    return new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

export const relative = (d: string | Date | null | undefined) => {
    if (!d) return '–';
    const diff = (Date.now() - new Date(d).getTime()) / 1000;
    if (diff < 5) return 'just now';
    if (diff < 60) return `${Math.floor(diff)}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return dateTime(d);
};

/** `2026-11-17T09:30` for <input type=datetime-local>, in local time. */
export const toLocalInput = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const statusClass = (status: number) =>
    status >= 500 ? 'err' : status >= 400 ? 'warn' : status >= 300 ? 'info' : 'ok';

/** Time only for today, date + time otherwise: keeps table columns narrow. */
export const shortDateTime = (d: string | Date | null | undefined) => {
    if (!d) return '–';
    const date = new Date(d);
    const today = new Date().toDateString() === date.toDateString();
    return date.toLocaleString(undefined, today
        ? { hour: '2-digit', minute: '2-digit', second: '2-digit' }
        : { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};
