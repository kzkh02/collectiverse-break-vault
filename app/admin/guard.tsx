'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    async function checkSession() {
      const { data } = await supabase.auth.getSession()

      if (!data.session) {
        router.push('/admin/login')
        return
      }

      setChecking(false)
    }

    checkSession()
  }, [router])

  if (checking) {
    return (
      <main style={{ padding: 40, color: 'white' }}>
        Checking admin access...
      </main>
    )
  }

  return <>{children}</>
}