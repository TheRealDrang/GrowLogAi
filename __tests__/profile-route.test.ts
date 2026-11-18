import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ createSupabaseServerClient: mocks.createClient }))
import { GET, POST } from '@/app/api/me/profile/route'

describe('profile route', () => {
  let query: { select: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; eq: ReturnType<typeof vi.fn>; single: ReturnType<typeof vi.fn> }
  let auth: ReturnType<typeof vi.fn>
  const request = (body: unknown) => new NextRequest('https://example.test/api/me/profile', {
    method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
  })

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    query = { select: vi.fn(), update: vi.fn(), eq: vi.fn(), single: vi.fn() }
    query.select.mockReturnValue(query)
    query.update.mockReturnValue(query)
    query.eq.mockReturnValue(query)
    query.single.mockResolvedValue({ data: { display_name: 'John Dering', avatar_url: null }, error: null })
    auth = vi.fn().mockResolvedValue({ data: { user: { id: 'current-user' } } })
    mocks.createClient.mockResolvedValue({ auth: { getUser: auth }, from: vi.fn().mockReturnValue(query) })
  })

  it('loads the authenticated profile', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ display_name: 'John Dering', avatar_url: null })
    expect(query.eq).toHaveBeenCalledWith('id', 'current-user')
  })

  it.each([
    { data: null, error: { message: 'permission denied', code: '42501' } },
    { data: null, error: { message: 'no rows', code: 'PGRST116' } },
    { data: null, error: null },
  ])('reports a failed load instead of pretending the saved name is blank', async (result) => {
    query.single.mockResolvedValue(result)
    const res = await GET()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: "Couldn't load your display name. Please try again." })
    expect(console.error).toHaveBeenCalled()
  })

  it('updates only the authenticated profile, ignoring a supplied account ID', async () => {
    const res = await POST(request({ id: 'someone-else', display_name: '  John Dering  ' }))
    expect(res.status).toBe(200)
    expect(query.update).toHaveBeenCalledWith({ display_name: 'John Dering' })
    expect(query.eq).toHaveBeenCalledWith('id', 'current-user')
    expect(await res.json()).toEqual({ display_name: 'John Dering', avatar_url: null })
  })

  it.each([
    { data: null, error: { message: 'RLS violation', code: '42501' } },
    { data: null, error: null },
  ])('does not report success if the update fails or updates no profile', async (result) => {
    query.single.mockResolvedValue(result)
    const res = await POST(request({ display_name: 'John' }))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: "Couldn't save your display name. Please try again." })
  })

  it.each([null, {}, { display_name: '' }, { display_name: '  ' }, { display_name: 1 }])('rejects invalid names', async (body) => {
    const res = await POST(request(body))
    expect(res.status).toBe(400)
    expect(query.update).not.toHaveBeenCalled()
  })

  it('rejects malformed JSON', async () => {
    const res = await POST(new NextRequest('https://example.test/api/me/profile', { method: 'POST', body: '{' }))
    expect(res.status).toBe(400)
    expect(query.update).not.toHaveBeenCalled()
  })

  it('requires authentication to read or save a name', async () => {
    auth.mockResolvedValue({ data: { user: null } })
    expect((await GET()).status).toBe(401)
    expect((await POST(request({ display_name: 'John' }))).status).toBe(401)
    expect(query.select).not.toHaveBeenCalled()
    expect(query.update).not.toHaveBeenCalled()
  })
})
