import { useEffect, useRef, useState } from 'react'

interface Props {
  target: number
  duration?: number
}

/**
 * Counts up from 0 to `target` using cubic ease-out.
 * Re-animates whenever `target` changes (e.g. when live data arrives).
 */
export default function AnimatedNumber({ target, duration = 900 }: Props) {
  const [value, setValue]  = useState(0)
  const rafRef  = useRef<number>()
  const startTs = useRef<number>()
  const fromRef = useRef(0)

  useEffect(() => {
    if (target === 0) { setValue(0); return }

    // JS-driven motion isn't covered by the CSS reduced-motion guard.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target)
      return
    }

    fromRef.current  = value
    startTs.current  = undefined

    const tick = (ts: number) => {
      if (!startTs.current) startTs.current = ts
      const progress = Math.min((ts - startTs.current) / duration, 1)
      const eased    = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(fromRef.current + eased * (target - fromRef.current)))
      if (progress < 1) rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [target]) // eslint-disable-line react-hooks/exhaustive-deps

  return <>{value}</>
}
