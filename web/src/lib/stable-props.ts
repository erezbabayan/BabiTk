import { useRef } from "react";

/**
 * Item cards get new inline callbacks on every parent render, which defeated
 * React.memo: every card re-rendered on every tap. A thin outer component swaps
 * each callback for a stable wrapper that calls the *latest* prop at event time
 * (never a stale closure), so the memoized inner card re-renders only when data
 * props actually change.
 */
type AnyProps = Record<string, unknown>;
type Handler = (...args: unknown[]) => unknown;

export function wrapHandlers<P extends AnyProps>(
  props: P,
  getLatest: () => P,
  cache: Map<string, Handler>,
  nestedKeys: readonly string[] = [],
): P {
  const out: AnyProps = { ...props };
  for (const [key, value] of Object.entries(props)) {
    if (typeof value === "function") {
      let wrapper = cache.get(key);
      if (!wrapper) {
        wrapper = (...args: unknown[]) => {
          const latest = getLatest()[key];
          return typeof latest === "function" ? (latest as Handler)(...args) : undefined;
        };
        cache.set(key, wrapper);
      }
      out[key] = wrapper;
    } else if (nestedKeys.includes(key) && value && typeof value === "object") {
      const nested: AnyProps = { ...(value as AnyProps) };
      for (const [innerKey, innerValue] of Object.entries(value as AnyProps)) {
        if (typeof innerValue !== "function") continue;
        const cacheKey = `${key}.${innerKey}`;
        let wrapper = cache.get(cacheKey);
        if (!wrapper) {
          wrapper = (...args: unknown[]) => {
            const parent = getLatest()[key] as AnyProps | undefined;
            const latest = parent?.[innerKey];
            return typeof latest === "function" ? (latest as Handler)(...args) : undefined;
          };
          cache.set(cacheKey, wrapper);
        }
        nested[innerKey] = wrapper;
      }
      out[key] = nested;
    }
  }
  return out as P;
}

/** Shallow equality; `nestedKeys` objects compare their non-function fields shallowly. */
export function stablePropsEqual(nestedKeys: readonly string[] = []) {
  return (prev: AnyProps, next: AnyProps): boolean => {
    const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
    for (const key of keys) {
      const a = prev[key];
      const b = next[key];
      if (Object.is(a, b)) continue;
      if (nestedKeys.includes(key) && a && b && typeof a === "object" && typeof b === "object") {
        const inner = new Set([...Object.keys(a as AnyProps), ...Object.keys(b as AnyProps)]);
        for (const k of inner) {
          const x = (a as AnyProps)[k];
          const y = (b as AnyProps)[k];
          if (typeof x === "function" && typeof y === "function") continue;
          if (!Object.is(x, y)) return false;
        }
        continue;
      }
      return false;
    }
    return true;
  };
}

export function useStableHandlers<P extends AnyProps>(
  props: P,
  nestedKeys: readonly string[] = [],
): P {
  const latest = useRef(props);
  latest.current = props;
  const cache = useRef(new Map<string, Handler>());
  return wrapHandlers(props, () => latest.current, cache.current, nestedKeys);
}
