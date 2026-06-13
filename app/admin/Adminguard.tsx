'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

export default function AdminGuard({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function checkSession() {
      const { data } = await supabase.auth.getSession()

      if (!data.session) {
        router.push('/admin/login')
        return
      }

      setLoading(false)
    }

    checkSession()
  }, [router])

  if (loading) {
    return <div>Checking admin access...</div>
  }

  return <>{children}</>
}