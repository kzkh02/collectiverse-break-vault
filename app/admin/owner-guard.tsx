'use client'

import { ReactNode, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

const OWNER_EMAIL = 'collectiversetcg@gmail.com'

export default function OwnerGuard({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [allowed, setAllowed] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let active = true

    async function checkOwner() {
      const { data: { user } } = await supabase.auth.getUser()
      const email = user?.email?.trim().toLowerCase()

      if (!active) return

      if (!user) {
        router.replace('/admin/login')
        return
      }

      if (email !== OWNER_EMAIL) {
        router.replace('/admin')
        return
      }

      setAllowed(true)
      setChecking(false)
    }

    checkOwner()

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const email = session?.user?.email?.trim().toLowerCase()
      if (email !== OWNER_EMAIL) router.replace(session?.user ? '/admin' : '/admin/login')
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [router])

  if (checking || !allowed) {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#05052f', color: 'white', fontWeight: 900 }}>
        Checking owner access…
      </main>
    )
  }

  return <>{children}</>
}
