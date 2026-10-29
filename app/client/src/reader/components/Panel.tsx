import { useEffect, useRef, type ReactNode } from 'react'

export function Panel({
  title,
  close,
  children,
}: {
  title: string
  close: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current!
    dialog.showModal()
    return () => dialog.close()
  }, [])
  return (
    <dialog ref={ref} onCancel={close} aria-label={title}>
      <div className="panel-heading">
        <h2>{title}</h2>
        <button onClick={close} aria-label={`Close ${title}`}>
          ×
        </button>
      </div>
      {children}
    </dialog>
  )
}
