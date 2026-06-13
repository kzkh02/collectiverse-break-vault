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
    async function check() {
      const { data } = await supabase.auth.getSession()

      if (!data.session) {
        router.push('/admin/login')
        return
      }

      setLoading(false)
    }

    check()
  }, [router])

  if (loading) return <div>Loading...</div>

  return <>{children}</>
}
      setChecking(false)
    }

    checkAuth()
  }, [router])

  if (checking) {
    return (
      <main
        style={{
          minHeight: '100vh',
          background: 'radial-gradient(circle at top, #15157a 0%, #06063d 45%, #02021f 100%)',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          fontWeight: 900,
        }}
      >
        Checking admin access...
      </main>
    )
  }

  return <>{children}</>
}
