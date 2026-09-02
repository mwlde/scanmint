'use client'

import { useEffect, useState } from 'react'

export function useDogeMode(): boolean {
  const [doge, setDoge] = useState(false)
  useEffect(() => {
    setDoge(localStorage.getItem('ss_doge_mode') === 'true')
    function onStorage(e: StorageEvent) {
      if (e.key === 'ss_doge_mode') setDoge(e.newValue === 'true')
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  return doge
}
