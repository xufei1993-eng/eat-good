function monthKey(now = Date.now()) {
  return new Date(now + 8 * 60 * 60 * 1000).toISOString().slice(0, 7)
}

function quotaError(code, message) {
  return Object.assign(new Error(message), { code })
}

module.exports = function createQuotaStore(db, getOpenid) {
  async function access(consume) {
    const openid = getOpenid()
    if (!openid) throw quotaError("NO_OPENID", "请先登录后再使用拍照识别")
    const found = await db.collection("users").where({ openid }).limit(1).get()
    const user = found.data && found.data[0]
    if (!user) throw quotaError("USER_NOT_FOUND", "请先完成登录后再使用拍照识别")
    const quota = await db.runTransaction(async (transaction) => {
      const settings = await transaction.collection("app_settings").doc("general").get()
      const limit = settings.data && settings.data.monthlyPhotoLimit
      if (!Number.isInteger(limit) || limit < 0 || limit > 999) {
        throw quotaError("INVALID_SETTINGS", "拍照次数设置不可用，请联系管理员")
      }
      const ref = transaction.collection("users").doc(user._id)
      const current = (await ref.get()).data
      if (!current || current.openid !== openid || (current.status && current.status !== "active")) {
        throw quotaError("USER_UNAVAILABLE", "当前用户无法使用拍照识别")
      }
      const month = monthKey()
      const sameMonth = current.photoUsageMonth === month
      const stored = current.photoUsedCount
      if (sameMonth && stored !== undefined && (!Number.isInteger(stored) || stored < 0)) {
        throw quotaError("INVALID_USAGE", "用户拍照用量异常，请联系管理员")
      }
      const used = sameMonth ? (stored || 0) : 0
      if (consume && used >= limit) throw quotaError("QUOTA_EXCEEDED", "本月拍照次数已用完，请下月再试或者充值")
      const next = used + (consume ? 1 : 0)
      if (consume || !sameMonth || stored === undefined) {
        await ref.update({ data: { photoUsageMonth: month, photoUsedCount: next, photoUsageUpdatedAt: db.serverDate() } })
      }
      return { userId: user._id, month, used: next, limit, remaining: Math.max(0, limit - next) }
    })
    console.log("[photo-quota]", { action: consume ? "reserve" : "read", ...quota })
    return quota
  }

  async function refund(reservation) {
    const refunded = await db.runTransaction(async (transaction) => {
      const ref = transaction.collection("users").doc(reservation.userId)
      const current = (await ref.get()).data
      // An old month's failed request must never refund a new month's usage.
      if (current && current.photoUsageMonth === reservation.month && current.photoUsedCount > 0) {
        await ref.update({ data: { photoUsedCount: current.photoUsedCount - 1, photoUsageUpdatedAt: db.serverDate() } })
        return { userId: reservation.userId, month: current.photoUsageMonth, used: current.photoUsedCount - 1 }
      }
      return null
    })
    console.log("[photo-quota]", { action: refunded ? "refund" : "refund-skipped", ...(refunded || { userId: reservation.userId, month: reservation.month }) })
  }
  return { read: () => access(false), reserve: () => access(true), refund }
}
