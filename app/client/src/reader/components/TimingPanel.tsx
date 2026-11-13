import { useState } from 'react'
import { Panel } from './Panel'
import type { ReadingTimings, TimingRun } from '../timings'

export function TimingPanel({ timings, start, close, unavailable, changed }: {
  timings: ReadingTimings; start(name: TimingRun['walletName'], version: string): void; close(): void; unavailable: string; changed(): void
}) {
  const [name, setName] = useState<TimingRun['walletName']>('BSV Browser')
  const [version, setVersion] = useState('')
  const [message, setMessage] = useState('')
  const [exported, setExported] = useState('')
  const [, refresh] = useState(0)
  return <Panel title="Reading timings" close={close}>
    <p>Capture page turns you choose. Starting or exporting cannot buy a page. Open an owned page before starting.</p>
    <p className="subtle">The export includes public identity, transaction IDs and timings, never keys or payment proofs. Closing or reloading stops capture; incomplete turns are retained.</p>
    {unavailable && <p role="status">{unavailable}</p>}
    <p role="status">{message}</p>
    <label>Installed wallet app <select value={name} disabled={timings.run?.recording} onChange={e => setName(e.target.value as TimingRun['walletName'])}>
      <option>BSV Browser</option><option>BSV Desktop</option>
    </select></label>
    <label>Installed app version <input value={version} maxLength={40} disabled={timings.run?.recording} onChange={e => setVersion(e.target.value)} /></label>
    <p>{timings.run ? `${timings.run.recording ? 'Recording' : 'Stopped'}: ${timings.paidCount()} paid page turns captured.` : 'No capture yet.'}</p>
    {timings.run?.samples.filter(sample => sample.purchased && sample.visible).slice(-5).map((sample, index) => <p key={`${sample.txid}-${index}`}>
      Page {sample.page}: Next to visible {sample.totalMs?.toFixed(0)} ms{sample.payment === 'session'
        ? sample.sessionPayment?.acceptedMs !== undefined ? `; Next to payment accepted ${sample.sessionPayment.acceptedMs.toFixed(0)} ms` : '; payment still confirming'
        : ''}.
    </p>)}
    <button disabled={timings.run?.recording || Boolean(unavailable) || !version.trim()} onClick={() => {
      try { start(name, version); setMessage('Capture started. Close this panel and turn pages normally.'); setExported(''); changed() }
      catch (e) { setMessage(e instanceof Error ? e.message : 'Capture could not start.') }
      refresh(n => n + 1)
    }}>Start capture</button>{' '}
    <button disabled={!timings.run?.recording} onClick={() => { timings.stop(); changed(); refresh(n => n + 1) }}>Stop capture</button>
    <p><button disabled={!timings.run || timings.run.recording} onClick={() => {
      setExported(timings.export()); setMessage('Export ready below. Download it or copy the text.')
    }}>Prepare export</button></p>
    {exported && <>
      <button onClick={() => {
        const url = URL.createObjectURL(new Blob([exported], { type: 'application/json' }))
        const a = document.createElement('a'); a.href = url; a.download = `pagestream-timings-${timings.run!.runId}.json`
        a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
      }}>Download JSON</button>{' '}
      <button onClick={() => {
        void navigator.clipboard?.writeText(exported).then(() => setMessage('Copied export.'), () => setMessage('Select and copy the export below.'))
      }}>Copy JSON</button>
      <label>Capture JSON <textarea readOnly rows={8} value={exported} style={{ width: '100%' }} /></label>
    </>}
    {timings.storageError && <p role="alert">Capture could not be saved locally. Export it before leaving.</p>}
  </Panel>
}
