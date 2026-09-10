const cloud = require("wx-server-sdk")

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const users = db.collection("users")

// Keep cloud-function dependencies self-contained; the function is deployed
// from this directory and cannot require files outside its upload package.
const FORBIDDEN_NICKNAME_WORDS = ["微信用户", "微信用户昵称", "WeChat User", "管理员", "客服", "官方"]
function validateNickname(value) {
  const nickname = String(value || "").trim()
  if (!nickname) return { ok: false, message: "请先填写昵称" }
  if (Array.from(nickname).length < 2) return { ok: false, message: "昵称至少需要 2 个字符" }
  if (Array.from(nickname).length > 24) return { ok: false, message: "昵称不能超过 24 个字符" }
  if (/^[\s\p{P}]+$/u.test(nickname)) return { ok: false, message: "昵称不能只使用符号" }
  if (FORBIDDEN_NICKNAME_WORDS.some((word) => nickname.toLowerCase().includes(word.toLowerCase()))) return { ok: false, message: "昵称包含不合规内容，请换一个" }
  return { ok: true, value: nickname }
}

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
  console.log("[吃对饭][auth] 请求开始", { action: event.action || "login", hasEventProfile: Boolean(event.profile), env: context.ENV || "" })
  if (!openid) return { ok: false, code: "NO_OPENID", message: "无法获取微信身份" }
  if (event.action && event.action !== "login") return { ok: false, code: "UNSUPPORTED_ACTION", message: "不支持的操作" }

  const now = db.serverDate()
  let existing = null
  try {
    const result = await users.where({ openid }).limit(1).get()
    existing = result.data && result.data[0]
  } catch (error) {
    const detail = { message: error && error.message || "", errCode: error && error.errCode || "", errMsg: error && error.errMsg || "", requestId: error && error.requestId || "" }
    console.log("[吃对饭][auth] 用户信息读取失败", detail)
    return { ok: false, code: "DB_READ_FAILED", message: "用户信息读取失败", debug: detail }
  }

  const profile = event.profile && typeof event.profile === "object" ? event.profile : {}
  console.log("[吃对饭][auth] 云函数输入:", { action: event.action || "login", profile })
  const profileData = profile.profile && typeof profile.profile === "object" ? profile.profile : {}
  const nickname = clean(profile.nickname)
  const nicknameCheck = nickname ? validateNickname(nickname) : { ok: true }
  if (!nicknameCheck.ok) return { ok: false, code: "NICKNAME_INVALID", message: nicknameCheck.message }
  const avatarUrl = clean(profile.avatarUrl)
  let dbStage = "nickname_lookup"
  try {
    if (nickname) {
      const duplicate = await users.where({ nickname }).limit(1).get()
      if (duplicate.data && duplicate.data.some((item) => !existing || item._id !== existing._id)) return { ok: false, code: "NICKNAME_TAKEN", message: "昵称已被使用，请换一个" }
    }
    if (existing) {
      dbStage = "update_existing_user"
      const update = { lastLoginAt: now, updatedAt: now }
      if (typeof profile.profileCompleted === "boolean") update.profileCompleted = profile.profileCompleted
      if (profile.profileCompleted) {
        // Explicitly replace legacy `profile: null` documents instead of
        // letting the database interpret nested fields as profile.activityLevel.
        update.profile = db.command.set({ ...profileData, nickname: nickname || existing.nickname || "" })
        console.log("[吃对饭][auth] 使用完整 profile 替换写入", { hadLegacyNullProfile: existing.profile === null })
      }
      if (nickname) update.nickname = nickname
      if (avatarUrl) update.avatarUrl = avatarUrl
      await users.doc(existing._id).update({ data: update })
      return { ok: true, isNew: false, user: publicUser({ ...existing, ...update }) }
    }
    dbStage = "create_user"
    const data = { openid, nickname, avatarUrl, profileCompleted: Boolean(profile.profileCompleted), profile: profile.profileCompleted ? { ...profileData, nickname } : null, status: "active", createdAt: now, updatedAt: now, lastLoginAt: now }
    const created = await users.add({ data })
    return { ok: true, isNew: true, user: publicUser({ ...data, _id: created._id }) }
  } catch (error) {
      const detail = { message: error && error.message || "", errCode: error && error.errCode || "", errMsg: error && error.errMsg || "", requestId: error && error.requestId || "", stage: dbStage, openidPresent: Boolean(openid), hasExistingUser: Boolean(existing), profileCompleted: Boolean(profile.profileCompleted) }
      console.log("[吃对饭][auth] 云函数写入失败", detail)
      return { ok: false, code: "DB_WRITE_FAILED", message: "用户信息保存失败", debug: detail }
  }
}
