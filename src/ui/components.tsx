import { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { href, onLinkClick } from './router';
import { statusClass } from './format';

export const Link = ({ to, children, class: cls, title }: { to: string; children: ComponentChildren; class?: string; title?: string }) => (
    <a href={href(to)} class={cls} title={title} onClick={e => onLinkClick(e as unknown as MouseEvent, to)}>
        {children}
    </a>
);

export const StatusBadge = ({ status }: { status: number }) => <span class={`badge badge-${statusClass(status)}`}>{status}</span>;

export const MethodBadge = ({ method }: { method: string }) => (
    <span class={`method method-${String(method).toLowerCase()}`}>{method}</span>
);

const JOB_TONE: Record<string, string> = { completed: 'ok', failed: 'err', active: 'info', waiting: 'muted', delayed: 'muted' };
export const JobStatusBadge = ({ status }: { status: string }) => <span class={`badge badge-${JOB_TONE[status] || 'muted'}`}>{status}</span>;

export const Spinner = () => <span class="spinner" aria-label="Loading" />;

export const Empty = ({ title, children }: { title: string; children?: ComponentChildren }) => (
    <div class="empty">
        <p class="empty-title">{title}</p>
        {children && <p class="muted">{children}</p>}
    </div>
);

export const ErrorNote = ({ error }: { error: string | null }) => (error ? <div class="note note-err" role="alert">{error}</div> : null);

export const Card = ({ title, actions, children, class: cls }: { title?: ComponentChildren; actions?: ComponentChildren; children: ComponentChildren; class?: string }) => (
    <section class={`card ${cls || ''}`}>
        {(title || actions) && (
            <header class="card-head">
                {title && <h2>{title}</h2>}
                {actions && <div class="card-actions">{actions}</div>}
            </header>
        )}
        {children}
    </section>
);

export const CopyButton = ({ text, label = 'Copy' }: { text: string; label?: string }) => {
    const [done, setDone] = useState(false);
    return (
        <button
            type="button"
            class="btn btn-ghost btn-sm"
            onClick={async () => {
                await navigator.clipboard.writeText(text);
                setDone(true);
                setTimeout(() => setDone(false), 1500);
            }}
        >
            {done ? 'Copied' : label}
        </button>
    );
};

/** Pretty JSON with light syntax colouring. Built from text nodes, so values are never parsed as HTML. */
export const JsonView = ({ value }: { value: unknown }) => {
    if (typeof value === 'string') return <pre class="code">{value || <span class="muted">(empty)</span>}</pre>;
    const text = JSON.stringify(value, null, 2) ?? '';
    const parts: JSX.Element[] = [];
    const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
    let last = 0;
    let m: RegExpExecArray | null;
    let i = 0;
    while ((m = re.exec(text))) {
        if (m.index > last) parts.push(<span key={i++}>{text.slice(last, m.index)}</span>);
        if (m[1]) {
            parts.push(<span key={i++} class={m[2] ? 'j-key' : 'j-str'}>{m[1]}</span>);
            if (m[2]) parts.push(<span key={i++}>{m[2]}</span>);
        } else if (m[3]) parts.push(<span key={i++} class="j-lit">{m[3]}</span>);
        else parts.push(<span key={i++} class="j-num">{m[4]}</span>);
        last = re.lastIndex;
    }
    parts.push(<span key={i++}>{text.slice(last)}</span>);
    return <pre class="code">{parts}</pre>;
};

export const Modal = ({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ComponentChildren; footer?: ComponentChildren }) => {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
        document.addEventListener('keydown', onKey);
        ref.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
        return () => document.removeEventListener('keydown', onKey);
    }, []);
    return (
        <div class="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
            <div class="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
                <header class="modal-head">
                    <h2>{title}</h2>
                    <button type="button" class="icon-btn" aria-label="Close" onClick={onClose}>×</button>
                </header>
                <div class="modal-body">{children}</div>
                {footer && <footer class="modal-foot">{footer}</footer>}
            </div>
        </div>
    );
};

type ToastTone = 'ok' | 'err' | 'info';
let pushToast: (text: string, tone?: ToastTone) => void = () => {};
export const toast = (text: string, tone: ToastTone = 'ok') => pushToast(text, tone);

export const Toasts = () => {
    const [items, setItems] = useState<{ id: number; text: string; tone: ToastTone }[]>([]);
    useEffect(() => {
        let n = 0;
        pushToast = (text, tone = 'ok') => {
            const id = ++n;
            setItems(list => [...list, { id, text, tone }]);
            setTimeout(() => setItems(list => list.filter(t => t.id !== id)), 4500);
        };
    }, []);
    return (
        <div class="toasts" aria-live="polite">
            {items.map(t => (
                <div key={t.id} class={`toast toast-${t.tone}`}>{t.text}</div>
            ))}
        </div>
    );
};

export const Field = ({ label, hint, children }: { label: string; hint?: ComponentChildren; children: ComponentChildren }) => (
    <label class="field">
        <span class="field-label">{label}</span>
        {children}
        {hint && <span class="field-hint">{hint}</span>}
    </label>
);

export const Pagination = ({ page, pageSize, total, estimated, count, onPage }: {
    page: number; pageSize: number; total: number; estimated?: boolean; count: number; onPage: (p: number) => void;
}) => {
    const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const end = (page - 1) * pageSize + count;
    const hasNext = estimated ? count === pageSize : end < total;
    return (
        <div class="pagination">
            <span class="muted">
                {count === 0 ? 'No results' : `${start.toLocaleString()}–${end.toLocaleString()} of ${estimated ? 'many' : total.toLocaleString()}`}
            </span>
            <div class="pagination-buttons">
                <button type="button" class="btn btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
                <button type="button" class="btn btn-sm" disabled={!hasNext || page >= 100} onClick={() => onPage(page + 1)}>Next</button>
            </div>
        </div>
    );
};

export const Segmented = <T extends string>({ value, options, onChange, label }: {
    value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string;
}) => (
    <div class="segmented" role="group" aria-label={label}>
        {options.map(o => (
            <button key={o.value} type="button" class={o.value === value ? 'active' : ''} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
                {o.label}
            </button>
        ))}
    </div>
);

/** Load data for a page; reloads when deps change. */
export const useData = <T,>(load: () => Promise<T>, deps: unknown[]) => {
    const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
    const [tick, setTick] = useState(0);
    useEffect(() => {
        let alive = true;
        setState(s => ({ ...s, loading: true, error: null }));
        load().then(
            data => alive && setState({ data, error: null, loading: false }),
            err => alive && setState(s => ({ ...s, error: err.message, loading: false }))
        );
        return () => {
            alive = false;
        };
    }, [...deps, tick]);
    return { ...state, reload: () => setTick(t => t + 1) };
};
