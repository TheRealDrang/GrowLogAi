import { createSupabaseServerClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'

export default async function RootPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  redirect(user ? '/dashboard' : '/login')
}
