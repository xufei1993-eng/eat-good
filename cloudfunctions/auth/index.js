const cloud = require("wx-server-sdk")

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const users = db.collection("users")

function clean(value, fallback = "") {
  return String(value == null ? fallback : value).trim().slice(0, 120)
}

function publicUser(user) {
  return {
    _id: user._id,
    openid: user.openid,
    nickname: user.nickname || "",
    avatarUrl: user.avatarUrl || "",
    status: user.status || "active",
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt
    ,profileCompleted: Boolean(user.profileCompleted), profile: user.profile && typeof user.profile === "object" ? user.profile : null
  }
}

exports.main = async (event = {}) => {
  const context = cloud.getWXContext()
  const openid = clean(context.OPENID)
  if (!openid) return { ok: false, code: "NO_OPENID", message: "无法获取微信身份" }
  if (event.action && event.action !== "login") return { ok: false, code: "UNSUPPORTED_ACTION", message: "不支持的操作" }

  const now = db.serverDate()
  let existing = null
  try {
    const result = await users.where({ openid }).limit(1).get()
    existing = result.data && result.data[0]
  } catch (error) {
    return { ok: false, code: "DB_READ_FAILED", message: "用户信息读取失败" }
  }

  const profile = event.profile && typeof event.profile === "object" ? event.profile : {}
  console.log("[吃对饭][auth] 云函数输入:", { action: event.action || "login", profile })
  const profileData = profile.profile && typeof profile.profile === "object" ? profile.profile : {}
  const nickname = clean(profile.nickname)
  const avatarUrl = clean(profile.avatarUrl)
  try {
    if (nickname) {
      const duplicate = await users.where({ nickname }).limit(1).get()
      if (duplicate.data && duplicate.data.some((item) => !existing || item._id !== existing._id)) return { ok: false, code: "NICKNAME_TAKEN", message: "昵称已被使用，请换一个" }
    }
    if (existing) {
      const update = { lastLoginAt: now, updatedAt: now }
      if (typeof profile.profileCompleted === "boolean") update.profileCompleted = profile.profileCompleted
      if (profile.profileCompleted) update.profile = { ...profileData, nickname: nickname || existing.nickname || "" }
      if (nickname) update.nickname = nickname
      if (avatarUrl) update.avatarUrl = avatarUrl
      await users.doc(existing._id).update({ data: update })
      return { ok: true, isNew: false, user: publicUser({ ...existing, ...update }) }
    }
    const data = { openid, nickname, avatarUrl, profileCompleted: Boolean(profile.profileCompleted), profile: profile.profileCompleted ? { ...profileData, nickname } : null, status: "active", createdAt: now, updatedAt: now, lastLoginAt: now }
    const created = await users.add({ data })
    return { ok: true, isNew: true, user: publicUser({ ...data, _id: created._id }) }
  } catch (error) {
      console.error("[吃对饭][auth] 云函数写入失败:", error)
      return { ok: false, code: "DB_WRITE_FAILED", message: "用户信息保存失败" }
  }
}
