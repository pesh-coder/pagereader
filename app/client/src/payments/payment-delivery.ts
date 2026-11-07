export type DeliveryOutcome<T> = { ok: true; value: T } | { ok: false; error: unknown }

async function outcome<T>(operation: () => Promise<T>): Promise<DeliveryOutcome<T>> {
  try { return { ok: true, value: await operation() } }
  catch (error) { return { ok: false, error } }
}

// A single explicit purchase only. Signing, fee checks and durable proof saving
// happen before startBroadcast. Neither a received page nor a queued broadcast
// alone completes delivery: both operations must finish successfully.
export class PaymentDelivery {
  private broadcast?: Promise<DeliveryOutcome<unknown>>
  private started = false
  private finished = false

  startBroadcast(operation: () => Promise<unknown>) {
    if (!this.started || this.finished || this.broadcast)
      throw new Error('Payment delivery cannot start another broadcast')
    // Attach failure handling immediately, even while HTTP is still pending.
    this.broadcast = outcome(operation)
    return this.broadcast
  }

  observeBroadcast(observer: (sent: DeliveryOutcome<unknown>) => void) {
    if (!this.broadcast || this.finished) throw new Error('No active broadcast to observe')
    const pending = this.broadcast
    this.broadcast = outcome(async () => {
      const sent = await pending
      observer(sent)
      if (sent.ok === false) throw sent.error
    })
  }

  async run<T>(submit: () => Promise<T>): Promise<T> {
    if (this.started) throw new Error('Payment delivery cannot be reused')
    this.started = true
    const submitted = await outcome(submit)
    const sent = await this.broadcast
    this.finished = true
    // Preserve the HTTP error if both operations fail. Broadcast diagnostics
    // remain in the original durable journal and wallet timing entries.
    if (submitted.ok === false) throw submitted.error
    if (sent?.ok === false) throw sent.error
    return submitted.value
  }
}
