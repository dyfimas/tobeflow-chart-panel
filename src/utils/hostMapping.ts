// ─────────────────────────────────────────────────────────────
// hostMapping.ts – Normalización de hostnames y mapeos
// Replica normalizarHost() y buscarMapeoHost() de producción
// ─────────────────────────────────────────────────────────────
import { HostMapping, MAPEO_HOSTS_DEFAULT } from '../types';

// ── normHost cache (B3 optimisation) ────────────────────────
const NORM_CACHE_MAX = 4096;
const _normCache = new Map<string, string>();

/**
 * Normaliza un hostname siguiendo las reglas del script de producción:
 * - Elimina sufijo -PING
 * - Elimina dominios (.local, .lan, .internal, etc.)
 * - Elimina puertos (:9200, etc.)
 * - Elimina caracteres especiales
 * - Convierte a minúsculas
 *
 * Results are cached (up to NORM_CACHE_MAX entries) so repeated
 * calls for the same raw string are O(1).
 */
export function normHost(raw: string): string {
  if (!raw) return '';
  const cached = _normCache.get(raw);
  if (cached !== undefined) return cached;

  let s = raw.trim();
  // Strip URL protocol (http://, https://)
  s = s.replace(/^https?:\/\//i, '');
  // Strip URL path (everything after first /)
  s = s.replace(/\/.*$/, '');
  const result = s
    .replace(/-PING$/i, '')
    .replace(/\.(local|lan|home|localdomain|internal)$/i, '')
    // Dominios personalizados se eliminan con regex genérico (2+ niveles)
    .replace(/\.[a-z0-9-]+\.[a-z]{2,}$/i, '')
    .replace(/:\d+$/, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();

  if (_normCache.size >= NORM_CACHE_MAX) _normCache.clear();
  _normCache.set(raw, result);
  return result;
}

/** Exposed for tests only — clears the normHost internal cache. */
export function _clearNormHostCache(): void {
  _normCache.clear();
}

/**
 * Búsqueda de mapeo: dado un cellId del SVG, intenta encontrar
 * el hostname correspondiente.
 * 
 * Sigue la lógica de buscarMapeoHost() del script de producción:
 * 1. Búsqueda exacta (case-insensitive)
 * 2. Búsqueda con wildcard (LIDO* → w12desa)
 * 3. Búsqueda con regex (/pattern/ → hostname)
 * 4. Normalización directa del cellId
 */
export function buscarMapeoHost(
  cellId: string,
  hostMapping: Record<string, string>,
): string | null {
  if (!cellId) return null;
  const cellIdUpper = cellId.toUpperCase();

  // 1. Búsqueda exacta
  for (const [key, value] of Object.entries(hostMapping)) {
    if (key.toUpperCase() === cellIdUpper) return value;
  }

  // 2. Búsqueda con wildcard
  for (const [key, value] of Object.entries(hostMapping)) {
    if (key.endsWith('*') && !key.startsWith('/')) {
      const prefix = key.slice(0, -1).toUpperCase();
      if (cellIdUpper.startsWith(prefix)) return value;
    }
  }

  // 3. Búsqueda con regex (keys like /pattern/)
  for (const [key, value] of Object.entries(hostMapping)) {
    if (key.startsWith('/') && key.endsWith('/') && key.length > 2) {
      try {
        const re = new RegExp(key.slice(1, -1), 'i');
        if (re.test(cellId)) return value;
      } catch { /* invalid regex, skip */ }
    }
  }

  return null;
}

/**
 * Resuelve un cellId a un hostname normalizado.
 * Busca en el mapeo de hosts y en los hosts disponibles.
 */
export function resolverHost(
  cellId: string,
  mapping: HostMapping,
  hostMapping: Record<string, string>,
  hostsDisponibles: Set<string>
): string | null {
  // 1. Multi-host mapping
  const multi = mapping.multiHost[cellId];
  if (multi && multi.length > 0) {
    const resolved = multi.map(normHost).filter((h) => hostsDisponibles.has(h));
    return resolved.length > 0 ? resolved[0] : null;
  }

  // 2. Alias directo
  const alias = mapping.hostAliases[cellId];
  if (alias) {
    const norm = normHost(alias);
    if (hostsDisponibles.has(norm)) return norm;
  }

  // 3. Mapeo de hosts (CONFIG.MAPEO_HOSTS)
  const mapped = buscarMapeoHost(cellId, hostMapping);
  if (mapped) {
    const norm = normHost(mapped);
    if (hostsDisponibles.has(norm)) return norm;
  }

  // 4. Normalización directa del cellId
  const normCellId = normHost(cellId);
  if (hostsDisponibles.has(normCellId)) return normCellId;

  // 5. Búsqueda parcial — P5: require minimum 4 char match and prefer exact over substring
  if (normCellId.length >= 4) {
    let bestMatch: string | null = null;
    let bestLen = Infinity;
    for (const h of hostsDisponibles) {
      if (h === normCellId) return h;
      // Only allow substring match if the normCellId is a significant portion
      // of the host key (or vice versa) to avoid false positives
      if (normCellId.includes(h) && h.length >= 4) {
        // h is contained in cellId — prefer shortest (most specific)
        if (h.length < bestLen) { bestMatch = h; bestLen = h.length; }
      } else if (h.includes(normCellId)) {
        // cellId is contained in h — accept if cellId is at least 60% of h length
        if (normCellId.length >= h.length * 0.6 && h.length < bestLen) {
          bestMatch = h;
          bestLen = h.length;
        }
      }
    }
    if (bestMatch) return bestMatch;
  }

  return null;
}

/** Mapping por defecto */
export function defaultMapping(): HostMapping {
  return {
    hostAliases: {},
    multiHost: {},
  };
}

/** Mapeo de hosts por defecto */
export function defaultHostMapping(): Record<string, string> {
  return { ...MAPEO_HOSTS_DEFAULT };
}
