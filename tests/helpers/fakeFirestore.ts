/**
 * A small in-memory stand-in for the Firestore Admin SDK, just rich enough for
 * the booking logic: documents, simple where() queries, and transactions.
 * Transactions are serialised (one at a time), which models Firestore's
 * guarantee that contending transactions cannot both commit on the same data.
 */
type Data = Record<string, any>

class Timestamp {
  constructor(private d: Date) {}
  toDate() { return this.d }
  valueOf() { return this.d.getTime() }
}

const wrap = (data: Data): Data =>
  Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v instanceof Date ? new Timestamp(v) : v]))

const cmp = (a: any, b: any) => {
  const x = a instanceof Timestamp ? a.valueOf() : a instanceof Date ? a.getTime() : a
  const y = b instanceof Timestamp ? b.valueOf() : b instanceof Date ? b.getTime() : b
  return x < y ? -1 : x > y ? 1 : 0
}

export class FakeFirestore {
  store = new Map<string, Map<string, Data>>()
  private queue: Promise<unknown> = Promise.resolve()

  collection(path: string) { return new FakeCollection(this, path) }

  coll(path: string) {
    if (!this.store.has(path)) this.store.set(path, new Map())
    return this.store.get(path)!
  }

  /** Serialised, like Firestore's conflict detection on contended documents. */
  runTransaction<T>(fn: (tx: FakeTx) => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const writes: Array<() => void> = []
      const tx = new FakeTx(writes)
      const result = await fn(tx)
      writes.forEach(w => w()) // commit only if the callback did not throw
      return result
    })
    this.queue = run.catch(() => undefined)
    return run
  }

  batch() {
    const writes: Array<() => void> = []
    return { set: (ref: FakeDoc, d: Data) => writes.push(() => ref.setNow(d)), commit: async () => writes.forEach(w => w()) }
  }
}

class FakeTx {
  constructor(private writes: Array<() => void>) {}
  async get(target: FakeDoc | FakeQuery) { return target.get() }
  set(ref: FakeDoc, d: Data) { this.writes.push(() => ref.setNow(d)) }
  create(ref: FakeDoc, d: Data) { this.writes.push(() => ref.setNow(d)) }
  update(ref: FakeDoc, d: Data) { this.writes.push(() => ref.updateNow(d)) }
  delete(ref: FakeDoc) { this.writes.push(() => ref.deleteNow()) }
}

class FakeDoc {
  constructor(public firestore: FakeFirestore, public path: string, public id: string) {}
  private get map() { return this.firestore.coll(this.path) }
  setNow(d: Data) { this.map.set(this.id, wrap(d)) }
  updateNow(d: Data) { this.map.set(this.id, { ...(this.map.get(this.id) ?? {}), ...wrap(d) }) }
  deleteNow() { this.map.delete(this.id) }
  collection(name: string) { return new FakeCollection(this.firestore, `${this.path}/${this.id}/${name}`) }
  async set(d: Data) { this.setNow(d) }
  async update(d: Data) { this.updateNow(d) }
  async delete() { this.deleteNow() }
  async get() {
    const data = this.map.get(this.id)
    return { exists: !!data, id: this.id, ref: this, data: () => data }
  }
}

class FakeQuery {
  constructor(protected firestore: FakeFirestore, protected path: string, protected filters: Array<[string, string, any]> = [], protected max?: number) {}
  where(field: string, op: string, value: any) { return new FakeQuery(this.firestore, this.path, [...this.filters, [field, op, value]], this.max) }
  orderBy() { return this }
  limit(n: number) { return new FakeQuery(this.firestore, this.path, this.filters, n) }
  async get() {
    let docs = [...this.firestore.coll(this.path).entries()]
      .filter(([, d]) => this.filters.every(([f, op, v]) => {
        const c = cmp(d[f], v)
        return op === '==' ? c === 0 : op === '>=' ? c >= 0 : op === '<=' ? c <= 0 : op === '>' ? c > 0 : op === '<' ? c < 0 : false
      }))
      .map(([id, d]) => ({ id, ref: new FakeDoc(this.firestore, this.path, id), data: () => d }))
    if (this.max) docs = docs.slice(0, this.max)
    return { docs, empty: docs.length === 0, size: docs.length }
  }
}

class FakeCollection extends FakeQuery {
  constructor(firestore: FakeFirestore, path: string) { super(firestore, path) }
  private counter = 0
  doc(id?: string) { return new FakeDoc(this.firestore, this.path, id ?? `auto${++FakeCollection.seq}`) }
  static seq = 0
  async add(d: Data) { const ref = this.doc(); await ref.set(d); return ref }
}

/** A tenantDb()-shaped accessor over a FakeFirestore for one clinic. */
export function fakeTenantDb(fs: FakeFirestore, clinicId = 'c1') {
  const profile = new FakeDoc(fs, 'clinics', clinicId)
  return {
    profile: () => profile,
    col: (name: string) => fs.collection(`clinics/${clinicId}/${name}`),
  }
}
