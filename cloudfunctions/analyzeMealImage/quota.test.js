const { test } = require("node:test")
const assert = require("node:assert/strict")
const createQuotaStore = require("./quota")

function fixture(limit = 1, fields = {}) {
  const user = { _id: "user-1", openid: "owner", status: "active", ...fields }
  const settings = { monthlyPhotoLimit: limit }
  let queue = Promise.resolve()
  const db = {
    serverDate: () => new Date(),
    collection(name) {
      return {
        where: () => ({ limit: () => ({ get: async () => ({ data: [user] }) }) }),
        doc: () => ({
          get: async () => ({ data: { ...(name === "users" ? user : settings) } }),
          update: async ({ data }) => Object.assign(user, data)
        })
      }
    },
    runTransaction(fn) {
      const next = queue.then(() => fn(db))
      queue = next.catch(() => {})
      return next
    }
  }
  return { store: createQuotaStore(db, () => "owner"), user, settings }
}

test("old users initialize; both entry points share the last available use", async () => {
  const { store, user } = fixture()
  assert.equal((await store.read()).remaining, 1)
  assert.equal(user.photoUsedCount, 0)
  const results = await Promise.allSettled([store.reserve(), store.reserve()])
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1)
  assert.equal(results.find((result) => result.status === "rejected").reason.code, "QUOTA_EXCEEDED")
  assert.equal(user.photoUsedCount, 1)
})

test("zero limit blocks; changed settings take effect immediately", async () => {
  const { store, settings } = fixture(0)
  await assert.rejects(store.reserve(), { code: "QUOTA_EXCEEDED" })
  settings.monthlyPhotoLimit = 2
  assert.equal((await store.reserve()).remaining, 1)
})

test("Beijing month boundary resets and late refunds do not affect new usage", async () => {
  const original = Date.now
  try {
    Date.now = () => Date.parse("2026-09-30T15:59:59Z")
    const { store, user } = fixture()
    const previous = await store.reserve()
    assert.equal(previous.month, "2026-09")
    Date.now = () => Date.parse("2026-09-30T16:00:00Z")
    const next = await store.reserve()
    assert.equal(next.month, "2026-10")
    await store.refund(previous)
    assert.equal(user.photoUsedCount, 1)
    await store.refund(next)
    assert.equal((await store.read()).remaining, 1)
  } finally { Date.now = original }
})

test("inactive users and invalid settings fail closed", async () => {
  await assert.rejects(fixture(1, { status: "disabled" }).store.reserve(), { code: "USER_UNAVAILABLE" })
  await assert.rejects(fixture("1").store.reserve(), { code: "INVALID_SETTINGS" })
})
