export interface Branding {
  poolName: string;
  trophyName: string;
}

/** Pure reader so branding is per-deploy (separate-deploy multi-group model). */
export function getBranding(
  env: Partial<Record<string, string | undefined>>,
): Branding {
  return {
    poolName: env.NEXT_PUBLIC_POOL_NAME || "World Cup Pool",
    trophyName: env.NEXT_PUBLIC_TROPHY_NAME || "The Trophy",
  };
}

/** Convenience for components: reads from the real environment. */
export const branding = getBranding(process.env);
