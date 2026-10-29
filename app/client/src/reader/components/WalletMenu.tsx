import { useEffect, useRef, useState } from 'react'

export function WalletMenu({
  identity,
  version,
  busy,
  connect,
  disconnect,
}: {
  identity: string | null
  version: string | null
  busy: boolean
  connect: () => void
  disconnect: () => void
}) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const container = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function outside(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        container.current?.querySelector('button')?.focus()
      }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [])
  if (!identity)
    return (
      <button className="wallet-trigger" disabled={busy} onClick={connect}>
        Connect wallet
      </button>
    )
  return (
    <div className="wallet-menu" ref={container}>
      <button
        className="wallet-trigger connected"
        disabled={busy}
        aria-expanded={open}
        aria-controls="wallet-details"
        onClick={() => setOpen(!open)}
      >
        <span aria-hidden="true">●</span>{' '}
        <span>
          {identity.slice(0, 6)}…{identity.slice(-4)}
        </span>
        <span aria-hidden="true">⌄</span>
        <span className="sr-only">Wallet connected</span>
      </button>
      {open && (
        <section
          id="wallet-details"
          className="wallet-details"
          aria-label="Wallet details"
        >
          <strong>Wallet connected</strong>
          <p className="eyebrow">Public identity key</p>
          <code>{identity}</code>
          <button
            onClick={() => {
              if (!navigator.clipboard) {
                setMessage('Copy unavailable. Select the key above to copy it.')
                return
              }
              void navigator.clipboard.writeText(identity).then(
                () => setMessage('Copied identity key.'),
                () =>
                  setMessage(
                    'Copy unavailable. Select the key above to copy it.',
                  ),
              )
            }}
          >
            Copy identity key
          </button>
          {version && <p className="subtle">Wallet version: {version}</p>}
          <p role="status">{message}</p>
          <hr />
          <button
            disabled={busy}
            onClick={() => {
              disconnect()
              setOpen(false)
              setMessage('')
            }}
          >
            Log out
          </button>
          <p className="subtle">
            Purchases and payment recovery are kept. Logging out does not revoke
            permissions saved in your wallet.
          </p>
        </section>
      )}
    </div>
  )
}
