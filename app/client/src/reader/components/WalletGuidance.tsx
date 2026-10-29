export function WalletGuidance() {
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  const desktop = (
    <a href="https://desktop.bsvb.tech/" target="_blank" rel="noreferrer">
      Download BSV Desktop for your computer
    </a>
  )
  const browser = (
    <a href="https://mobile.bsvb.tech/" target="_blank" rel="noreferrer">
      Download BSV Browser for your phone
    </a>
  )
  return (
    <section className="wallet-guidance" aria-label="Wallet setup">
      <h3>Need a wallet?</h3>
      <ul>
        <li>{mobile ? browser : desktop}</li>
        <li>{mobile ? desktop : browser}</li>
      </ul>
      <p>
        Already installed? Open BSV Desktop, or open this reader inside BSV
        Browser, then try again.
      </p>
      <p className="subtle">The first two pages stay free without a wallet.</p>
    </section>
  )
}
