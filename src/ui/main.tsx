import { render, ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { api, Me, post, setUnauthorizedHandler } from './api';
import { match, navigate, useLocation } from './router';
import { Link, Spinner, Toasts } from './components';
import { LoginPage, InvitePage } from './pages/Login';
import { OverviewPage } from './pages/Overview';
import { RequestsPage } from './pages/Requests';
import { RequestDetailPage } from './pages/RequestDetail';
import { JobsPage, JobDetailPage } from './pages/Jobs';
import { AlertsPage } from './pages/Alerts';
import { SettingsPage } from './pages/Settings';
import './styles.css';

type Theme = 'system' | 'light' | 'dark';
const THEME_KEY = 'apilogs-theme';

const readTheme = (): Theme => {
    try {
        return (localStorage.getItem(THEME_KEY) as Theme) || 'system';
    } catch {
        return 'system';
    }
};

const applyTheme = (theme: Theme) => {
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    try {
        localStorage.setItem(THEME_KEY, theme);
    } catch {
        /* private mode */
    }
    window.dispatchEvent(new Event('apilogs-theme'));
};
applyTheme(readTheme());

const NAV = [
    { to: '/', label: 'Overview', icon: 'M3 12h4l3-8 4 16 3-8h4' },
    { to: '/requests', label: 'Requests', icon: 'M4 6h16M4 12h16M4 18h10' },
    { to: '/jobs', label: 'Jobs', icon: 'M4 7h16v12H4zM9 7V4h6v3' },
    { to: '/alerts', label: 'Alerts', icon: 'M6 16V11a6 6 0 1112 0v5l2 2H4zM10 20h4' },
    { to: '/settings', label: 'Settings', icon: 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4' },
];

const Icon = ({ d }: { d: string }) => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d={d} />
    </svg>
);

const Shell = ({ me, path, children }: { me: Me; path: string; children: ComponentChildren }) => {
    const [theme, setTheme] = useState<Theme>(readTheme());
    const [menuOpen, setMenuOpen] = useState(false);
    const active = (to: string) => (to === '/' ? path === '/' : path === to || path.startsWith(`${to}/`));
    const nextTheme: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };

    useEffect(() => setMenuOpen(false), [path]);

    return (
        <div class="shell">
            <aside class={`sidebar ${menuOpen ? 'open' : ''}`}>
                <div class="brand">
                    <span class="brand-mark" aria-hidden="true">
                        <svg viewBox="0 0 32 32" width="22" height="22"><path d="M7 20h4l3-9 3 12 3-7h5" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
                    </span>
                    <span>API Logs</span>
                </div>
                <nav class="nav" aria-label="Main">
                    {NAV.map(n => (
                        <Link key={n.to} to={n.to} class={`nav-link ${active(n.to) ? 'active' : ''}`}>
                            <Icon d={n.icon} />
                            <span>{n.label}</span>
                        </Link>
                    ))}
                </nav>
                <div class="sidebar-foot">
                    <div class="who" title={me.email}>
                        <span class="avatar" aria-hidden="true">{me.email[0].toUpperCase()}</span>
                        <span class="who-text">
                            <span class="who-email">{me.email}</span>
                            <span class="muted">{me.role === 'admin' ? 'Admin' : 'Developer'}</span>
                        </span>
                    </div>
                    <div class="sidebar-actions">
                        <button
                            type="button"
                            class="btn btn-ghost btn-sm"
                            title="Switch theme"
                            onClick={() => {
                                const t = nextTheme[theme];
                                setTheme(t);
                                applyTheme(t);
                            }}
                        >
                            Theme: {theme}
                        </button>
                        <button
                            type="button"
                            class="btn btn-ghost btn-sm"
                            onClick={async () => {
                                await post('/auth/logout').catch(() => {});
                                window.location.href = `${document.documentElement.dataset.base}/login`;
                            }}
                        >
                            Sign out
                        </button>
                    </div>
                </div>
            </aside>
            <div class="main-col">
                <header class="topbar">
                    <button type="button" class="icon-btn" aria-label="Menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(o => !o)}>
                        <Icon d="M4 7h16M4 12h16M4 17h16" />
                    </button>
                    <span class="topbar-title">API Logs</span>
                </header>
                <main class="content">{children}</main>
            </div>
            {menuOpen && <div class="scrim" onClick={() => setMenuOpen(false)} />}
        </div>
    );
};

const OBJECT_ID = /^[a-f0-9]{24}$/;

const App = () => {
    const { path, query } = useLocation();
    const [me, setMe] = useState<Me | null | undefined>(undefined);
    const isPublic = path === '/login' || path.startsWith('/invite/');

    useEffect(() => {
        setUnauthorizedHandler(() => {
            setMe(null);
            navigate('/login', { replace: true });
        });
    }, []);

    useEffect(() => {
        if (isPublic) return;
        api<Me>('/auth/me').then(setMe, () => {
            setMe(null);
            navigate('/login', { replace: true });
        });
    }, [isPublic]);

    if (path === '/login') return <LoginPage onSignedIn={() => { setMe(undefined); navigate('/', { replace: true }); }} />;
    const invite = match('/invite/:token', path);
    if (invite) return <InvitePage token={invite.token} />;
    if (!me) return <div class="center-screen"><Spinner /></div>;

    let page: ComponentChildren;
    let params: Record<string, string> | null;
    if (path === '/') page = <OverviewPage />;
    else if (path === '/requests') page = <RequestsPage me={me} query={query} />;
    else if ((params = match('/requests/:id', path))) page = <RequestDetailPage id={params.id} />;
    else if (path === '/jobs') page = <JobsPage query={query} />;
    else if ((params = match('/jobs/:id', path))) page = <JobDetailPage id={params.id} />;
    else if (path === '/alerts') page = <AlertsPage me={me} />;
    else if (path === '/settings') page = <SettingsPage me={me} onMeChange={setMe} />;
    else if (path === '/home') {
        // v2 link
        navigate('/', { replace: true });
        return null;
    } else if (OBJECT_ID.test(path.slice(1))) {
        // v2 log links: /logs/<id>
        navigate(`/requests${path}`, { replace: true });
        return null;
    } else page = <div class="page"><h1>Page not found</h1><p><Link to="/">Back to overview</Link></p></div>;

    return <Shell me={me} path={path}>{page}</Shell>;
};

render(
    <>
        <App />
        <Toasts />
    </>,
    document.getElementById('app')!
);
