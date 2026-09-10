const NICKNAME_MAX_LENGTH = 24
const FORBIDDEN_NICKNAME_WORDS = ["微信用户", "微信用户昵称", "WeChat User", "管理员", "客服", "官方"]
function validateNickname(value) {
  const nickname = String(value || "").trim()
  if (!nickname) return { ok: false, message: "请先填写昵称" }
  if (Array.from(nickname).length < 2) return { ok: false, message: "昵称至少需要 2 个字符" }
  if (Array.from(nickname).length > NICKNAME_MAX_LENGTH) return { ok: false, message: `昵称不能超过 ${NICKNAME_MAX_LENGTH} 个字符` }
  if (/^[\s\p{P}]+$/u.test(nickname)) return { ok: false, message: "昵称不能只使用符号" }
  if (FORBIDDEN_NICKNAME_WORDS.some((word) => nickname.toLowerCase().includes(word.toLowerCase()))) return { ok: false, message: "昵称包含不合规内容，请换一个" }
  return { ok: true, value: nickname }
}
module.exports = { NICKNAME_MAX_LENGTH, validateNickname }
