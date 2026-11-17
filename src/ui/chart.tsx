import { useEffect, useRef } from 'preact/hooks';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

export interface Series {
    label: string;
    values: number[];
    /** CSS variable holding the colour, e.g. --ok */
    colorVar: string;
}

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/**
 * Stacked bars over time (requests by outcome). Colours come from the theme's
 * CSS variables, so the chart follows light/dark mode.
 */
export const StackedBars = ({ labels, series, height = 220, hourly }: { labels: string[]; series: Series[]; height?: number; hourly: boolean }) => {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const xs = labels.map(l => Date.parse(hourly ? `${l}:00Z` : `${l}T00:00:00Z`) / 1000);
        // Stack by summing: the drawn value of each series includes the ones below it.
        const stacked: number[][] = [];
        series.forEach((s, i) => stacked.push(s.values.map((v, j) => v + (i ? stacked[i - 1][j] : 0))));
        const grid = cssVar('--border');
        const text = cssVar('--muted');
        const bars = uPlot.paths.bars!({ size: [0.7, 48] });

        let plot: uPlot | null = null;
        const build = () => {
            plot?.destroy();
            plot = new uPlot(
                {
                    width: el.clientWidth,
                    height,
                    legend: { show: true },
                    cursor: { drag: { x: false, y: false }, points: { show: false } },
                    scales: { x: { time: true }, y: { range: (_u, _min, max) => [0, Math.max(1, max * 1.1)] } },
                    axes: [
                        { stroke: text, grid: { show: false }, ticks: { stroke: grid } },
                        { stroke: text, grid: { stroke: grid, width: 1 }, ticks: { show: false }, size: 48 },
                    ],
                    // Drawn top layer first so lower layers paint over the stacked totals.
                    series: [
                        { label: hourly ? 'Hour' : 'Day', value: (_u, v) => (v == null ? '' : new Date(v * 1000).toLocaleString(undefined, hourly ? { month: 'short', day: 'numeric', hour: '2-digit' } : { month: 'short', day: 'numeric' })) },
                        ...series
                            .map(s => ({
                                label: s.label,
                                fill: cssVar(s.colorVar),
                                stroke: cssVar(s.colorVar),
                                width: 0,
                                paths: bars,
                                points: { show: false },
                                value: (_u: uPlot, _v: number | null, _si: number, idx: number | null) => (idx == null ? '' : String(s.values[idx] ?? 0)),
                            }))
                            .reverse(),
                    ],
                },
                [xs, ...stacked.slice().reverse()],
                el
            );
        };
        build();
        const ro = new ResizeObserver(() => plot?.setSize({ width: el.clientWidth, height }));
        ro.observe(el);
        const scheme = window.matchMedia('(prefers-color-scheme: dark)');
        const rebuild = () => build();
        scheme.addEventListener('change', rebuild);
        window.addEventListener('apilogs-theme', rebuild);
        return () => {
            ro.disconnect();
            scheme.removeEventListener('change', rebuild);
            window.removeEventListener('apilogs-theme', rebuild);
            plot?.destroy();
        };
    }, [labels, series, height, hourly]);
    return <div class="chart" ref={ref} />;
};
