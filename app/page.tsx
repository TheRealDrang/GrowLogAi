import { createSupabaseServerClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'

export default async function RootPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  redirect(user ? '/dashboard' : '/login')
}
