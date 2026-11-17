/**
 * A route pattern: an exact path ('/health'), a prefix ending in '*'
 * ('/internal/*'), or a RegExp tested against the path.
 */
export type RoutePattern = string | RegExp;

export interface RouteFilterOptions {
    /** Only log paths starting with one of these prefixes. */
    beginswith?: string[];
    /** Never log paths matching these patterns. */
    specifics?: RoutePattern[];
    /** The logger's own routes, always skipped. */
    internalPrefixes?: string[];
}

const pathOf = (url: string) => {
    const q = url.indexOf('?');
    return q === -1 ? url : url.slice(0, q);
};

const stripTrailingSlash = (path: string) =>
    path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;

const matchesPattern = (path: string, pattern: RoutePattern) => {
    if (pattern instanceof RegExp) return pattern.test(path);
    if (pattern.endsWith('*')) return path.startsWith(pattern.slice(0, -1));
    return stripTrailingSlash(path) === stripTrailingSlash(pattern);
};

// '/logs' covers '/logs' and '/logs/...', but not '/logsomething'.
const underPrefix = (path: string, prefix: string) => {
    const base = stripTrailingSlash(prefix);
    return path === base || path.startsWith(`${base}/`);
};

export const createRouteFilter = ({ beginswith, specifics, internalPrefixes = [] }: RouteFilterOptions) =>
    (url: string): boolean => {
        const path = pathOf(url);
        if (internalPrefixes.some(p => underPrefix(path, p))) return false;
        if (beginswith && beginswith.length && !beginswith.some(p => path.startsWith(p))) return false;
        if (specifics && specifics.some(p => matchesPattern(path, p))) return false;
        return true;
    };
