import { useEffect, useRef } from 'react'

// Three gestures on one control, so a big jump never means 20 taps:
//   tap  ±  → one step (unchanged from before)
//   hold ±  → repeats, ramping 1× → 2× → 5× the step the longer you hold
//   drag the value left/right → scrub continuously
//
// Deliberately no text input: the value is never focusable, so the mobile
// keyboard never covers the logging UI mid-set.

const RAMP = [
  { after: 0,    mult: 1, every: 140 },
  { after: 1500, mult: 2, every: 110 },
  { after: 3000, mult: 5, every: 90  },
]
const HOLD_DELAY = 450   // ms before a press becomes a hold
const PX_PER_STEP = 14   // drag distance for one step

const tier = (elapsed) => RAMP.reduce((best, r) => (elapsed >= r.after ? r : best), RAMP[0])
const buzz = (ms) => { if (navigator.vibrate) navigator.vibrate(ms) }

export default function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 9999,
  valueStyle,
}) {
  // Mirrors `value` so a fast repeat does not stall waiting for React to flush.
  const valueRef = useRef(value)
  valueRef.current = value

  const holdRef = useRef(null)
  const dragRef = useRef(null)

  const clamp = (n) => Math.min(max, Math.max(min, n))

  const applyDelta = (delta) => {
    const next = clamp(valueRef.current + delta)
    if (next === valueRef.current) return
    valueRef.current = next
    onChange(next)
  }

  const stopHold = () => {
    if (holdRef.current) clearTimeout(holdRef.current)
    holdRef.current = null
  }

  const startHold = (dir) => {
    applyDelta(dir * step)
    buzz(8)
    const t0 = Date.now()

    const tick = () => {
      const t = tier(Date.now() - t0)
      applyDelta(dir * step * t.mult)
      buzz(4)
      holdRef.current = setTimeout(tick, t.every)
    }
    holdRef.current = setTimeout(tick, HOLD_DELAY)
  }

  useEffect(() => stopHold, [])

  // ── Drag-to-scrub on the value ────────────────────────────────────────────
  // Arm the drag BEFORE capturing the pointer: capture is an optimisation that
  // keeps the gesture alive if the finger slides off the element, and it can
  // throw. It must never be able to stop the scrub from starting.
  const onDragStart = (e) => {
    dragRef.current = { x: e.clientX, base: valueRef.current, last: valueRef.current }
    try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch { /* non-fatal */ }
  }

  const onDragMove = (e) => {
    const d = dragRef.current
    if (!d) return
    const steps = Math.round((e.clientX - d.x) / PX_PER_STEP)
    const next = clamp(d.base + steps * step)
    if (next !== d.last) {
      d.last = next
      valueRef.current = next
      onChange(next)
      buzz(3)
    }
  }

  const onDragEnd = (e) => {
    dragRef.current = null
    try { e.currentTarget.releasePointerCapture?.(e.pointerId) } catch { /* non-fatal */ }
  }

  const btnHandlers = (dir) => ({
    onPointerDown: (e) => { e.preventDefault(); startHold(dir) },
    onPointerUp: stopHold,
    onPointerLeave: stopHold,
    onPointerCancel: stopHold,
    onContextMenu: (e) => e.preventDefault(),
  })

  return (
    <div className="stepper">
      <button className="stepper-btn" aria-label="decrease" {...btnHandlers(-1)}>−</button>

      <span
        className="stepper-value stepper-scrub"
        style={valueStyle}
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        role="slider"
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
      >
        <span className="scrub-hint" aria-hidden="true">‹</span>
        {value}
        <span className="scrub-hint" aria-hidden="true">›</span>
      </span>

      <button className="stepper-btn" aria-label="increase" {...btnHandlers(+1)}>+</button>
    </div>
  )
}
