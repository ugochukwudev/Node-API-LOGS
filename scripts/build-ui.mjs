// Bundles the dashboard (src/ui) into dist/ui/app.js + app.css.
import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const options = {
    entryPoints: { app: 'src/ui/main.tsx' },
    outdir: 'dist/ui',
    bundle: true,
    minify: !watch,
    sourcemap: watch ? 'inline' : false,
    target: 'es2020',
    jsx: 'automatic',
    jsxImportSource: 'preact',
    legalComments: 'none',
    logLevel: 'info',
};

if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
} else {
    await esbuild.build(options);
}
