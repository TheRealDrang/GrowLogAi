import { createSupabaseAdminClient } from './supabase'

// Claude chose this approach because: no Redis is available in the stack — DB-based counting
// is simple, accurate enough for abuse prevention, and requires no new infrastructure.
export async function isRateLimited(
  userId: string,
  config: {
    table: string
    userColumn: string
    windowMinutes: number
    maxRequests: number
    extraFilters?: Record<string, string>
  }
): Promise<boolean> {
  const adminClient = createSupabaseAdminClient()
  const since = new Date(Date.now() - config.windowMinutes * 60 * 1000).toISOString()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (adminClient as any)
    .from(config.table)
    .select('id', { count: 'exact', head: true })
    .eq(config.userColumn, userId)
    .gte('created_at', since)

  if (config.extraFilters) {
    for (const [col, val] of Object.entries(config.extraFilters)) {
      query = query.eq(col, val)
    }
  }

  const { count } = await query
  return (count ?? 0) >= config.maxRequests
}
