/**
 * Base-aware public asset path — VECTO deploys under /<repo>/ on GitHub Pages,
 * so root-absolute '/x.png' 404s. Always reference public assets via asset().
 */
export const asset = (p: string): string => `${import.meta.env.BASE_URL}${p}`
