const AVATARS = {
  pregnancy: "/assets/personal/persona-01-孕期营养-avatar.jpg",
  fatloss: {
    male: "/assets/personal/persona-02-减脂塑形-avatar.jpg",
    female: "/assets/personal/persona-02-减脂塑形-avatar-female.jpg"
  },
  health: {
    male: "/assets/personal/persona-03-日常健康-avatar.jpg",
    female: "/assets/personal/persona-03-日常健康-avatar-female.jpg"
  }
}

function defaultProfileAvatar(profileMode, gender) {
  if (profileMode === "pregnancy") return AVATARS.pregnancy
  const mode = profileMode === "fatloss" ? "fatloss" : "health"
  return AVATARS[mode][gender === "female" ? "female" : "male"]
}

function buildProfileModes(gender) {
  const pregnancyUnavailable = gender === "male"
  return [
    { id: "pregnancy", title: "孕期营养", caption: pregnancyUnavailable ? "仅适用于女性" : "安全与关键营养", symbol: "孕", avatar: AVATARS.pregnancy, disabled: pregnancyUnavailable, genderRestricted: pregnancyUnavailable },
    { id: "fatloss", title: "减脂塑形", caption: "热量与蛋白质", symbol: "减", avatar: defaultProfileAvatar("fatloss", gender) },
    { id: "health", title: "日常健康", caption: "规律吃，少操心", symbol: "衡", avatar: defaultProfileAvatar("health", gender) },
    { id: "unhealth", title: "专项健康", caption: "即将开放", symbol: "康", disabled: true }
  ]
}

module.exports = { AVATARS, defaultProfileAvatar, buildProfileModes }
