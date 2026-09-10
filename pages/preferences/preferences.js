const { mealReminderTemplateId } = require("../../config/index")
const { calculateProfileTargets, isProfileComplete, PROFILE_SCHEMA_VERSION } = require("../../utils/profile-calculator")
const { defaultProfileAvatar, buildProfileModes } = require("../../utils/profile-avatar")
const { validateNickname } = require("../../utils/nickname")

const CUISINES = ["家常菜", "川菜", "粤菜", "江浙菜", "西北菜", "东北菜", "日韩料理", "轻食", "烧烤", "粉面", "海鲜"]
const DEFAULT_CUISINES = ["家常菜"]

function usableWechatNickname(value) {
  const nickname = String(value || "").trim()
  return ["微信用户", "微信用户昵称", "WeChat User"].includes(nickname) ? "" : nickname
}

function buildCuisineOptions(savedTastes = []) {
  const tastes = Array.isArray(savedTastes) ? savedTastes.filter(Boolean) : []
  const savedLabels = tastes.filter((item) => item.checked && CUISINES.indexOf(item.label) >= 0).map((item) => item.label)
  const selected = savedLabels.length ? savedLabels : DEFAULT_CUISINES
  return CUISINES.map((label) => ({ label, checked: selected.indexOf(label) >= 0 }))
}

function dateKey(date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-")
}

function describeCloudError(error) {
  const source = error || {}
  return { name: source.name || "", message: source.message || "", errCode: source.errCode == null ? "" : source.errCode, errMsg: source.errMsg || "", requestId: source.requestId || "" }
}

Page({
  data: {
    headerInset: 0,
    isOnboarding: false,
    isEditing: false,
    profileSummary: null,
    avatarUrl: "",
    historyRange: 7,
    historyChart: { points: [], average: 0, recordedDays: 0, target: 0, canvasWidth: 300 },
    onboardingStep: 1,
    profileMode: "health",
    allergyStatus: "",
    gender: "",
    age: "",
    heightCm: "",
    currentWeightKg: "",
    prePregnancyWeightKg: "",
    profileTargets: null,
    profileModes: buildProfileModes(""),
    calorieMin: 400,
    calorieMax: 500,
    proteinMin: 24,
    trimester: 2,
    activityLevel: "medium",
    gestationalDiabetes: false,
    pregnancyHypertension: false,
    reminders: [
      { id: "breakfast", label: "早餐提醒", time: "08:00", enabled: true },
      { id: "lunch", label: "午餐提醒", time: "12:00", enabled: true },
      { id: "dinner", label: "晚餐提醒", time: "18:30", enabled: true }
    ],
    budget: 30,
    tastes: buildCuisineOptions(),
    selectedCuisineCount: DEFAULT_CUISINES.length,
    allergens: [
      { label: "乳制品", checked: false },
      { label: "鸡蛋", checked: false },
      { label: "小麦/麸质", checked: false },
      { label: "大豆", checked: false },
      { label: "花生", checked: false },
      { label: "坚果", checked: false },
      { label: "鱼类", checked: false },
      { label: "甲壳类", checked: false }
    ],
    avoidRepeat: true,
    noSugar: true
    ,nickname: ""
  },

  onLoad(options = {}) {
    const menuButton = wx.getMenuButtonBoundingClientRect()
    const stored = wx.getStorageSync("preferences")
    const saved = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {}
    const isOnboarding = options.onboarding === "1"
    const authUser = getApp().globalData.user || {}
    const cloudProfile = authUser.profile
    const pendingProfile = wx.getStorageSync("pendingWechatProfile") || {}
    const restored = !isProfileComplete(saved) && cloudProfile && typeof cloudProfile === "object" ? cloudProfile : { ...saved, nickname: saved.nickname || usableWechatNickname(authUser.nickname) || usableWechatNickname(pendingProfile.nickname), avatarUrl: saved.avatarUrl || authUser.avatarUrl || pendingProfile.avatarUrl || "" }
    if (isOnboarding && !isProfileComplete(restored)) restored.nickname = usableWechatNickname(restored.nickname)
    const savedAllergens = Array.isArray(restored.allergens) ? restored.allergens.filter(Boolean) : []
    const hasSelectedAllergen = savedAllergens.some((item) => item.checked)
    const gender = restored.profileMode === "pregnancy" ? "female" : (restored.gender || "")
    this.setData({
      ...restored,
      // Align the page chrome with the lower edge of the floating menu area.
      // Using the menu's top keeps the title from being pushed far below it.
      headerInset: Math.max(0, menuButton.top - 8),
      isOnboarding,
      isEditing: false,
      profileMode: restored.profileMode === "unhealth" ? (isOnboarding ? "" : "health") : (restored.profileMode || (isOnboarding ? "" : "health")),
      gender: restored.gender || gender,
      profileModes: buildProfileModes(gender),
      allergyStatus: restored.allergyStatus || (restored.profileCreated ? (hasSelectedAllergen ? "has" : "none") : ""),
      allergens: savedAllergens.length ? savedAllergens : this.data.allergens,
      avatarUrl: restored.avatarUrl || "",
      tastes: buildCuisineOptions(restored.tastes),
      selectedCuisineCount: buildCuisineOptions(restored.tastes).filter((item) => item.checked).length
      ,authUser: Boolean(getApp().globalData.user)
    }, () => {
      this.refreshProfileTargets()
      this.refreshProfileSummary()
      this.refreshHistoryChart()
    })
  },

  onShow() {
    const tabBar = typeof this.getTabBar === "function" ? this.getTabBar() : null
    if (tabBar) tabBar.showForPage(2)
    if (this.data.isOnboarding || this.data.isEditing) return
    this.loadSavedProfile()
  },

  authorizeFromProfile() {
    const app = getApp()
    console.log("[吃对饭][微信授权] 用户点击授权", { time: new Date().toISOString(), api: "wx.getUserProfile", desc: "用于展示微信昵称和头像" })
    this.setData({ authLoading: true })
    const loginWithProfile = () => new Promise((resolve, reject) => {
      if (typeof wx.getUserProfile !== "function") return resolve({})
      // 必须在用户点击授权按钮的同步事件中调用，不能放到异步隐私回调后。
      wx.getUserProfile({
        // 微信要求 desc 为简短用途说明，控制在 30 个字符以内。
        desc: "用于展示微信昵称和头像",
        success: (result) => {
          console.log("[吃对饭][微信授权] wx.getUserProfile 原始返回:", result)
          const info = result && result.userInfo || {}
          const nickname = usableWechatNickname(info.nickName)
          const profile = { nickname, avatarUrl: nickname ? info.avatarUrl || "" : "" }
          console.log("[吃对饭][微信授权] 清洗后提交 auth:", profile)
          resolve(profile)
        },
        fail: (error) => { console.error("[吃对饭][微信授权] wx.getUserProfile 失败:", error); reject(error) }
      })
    })
    loginWithProfile().then((profile) => app.initAuth(profile)).then((user) => {
      console.log("[吃对饭][微信授权] auth 云函数返回用户:", user)
      if (!user) throw new Error("登录失败，请稍后重试")
      this.setData({ authLoading: false })
      const hasCloudProfile = user.profileCompleted && user.profile && isProfileComplete(user.profile)
      if (hasCloudProfile) wx.setStorageSync("preferences", user.profile)
      if (hasCloudProfile) {
        this.loadSavedProfile()
        wx.showToast({ title: "登录成功", icon: "success" })
      } else {
        const nickname = usableWechatNickname(user.nickname)
        this.setData({ nickname, avatarUrl: user.avatarUrl || "" })
        wx.setStorageSync("pendingWechatProfile", { nickname, avatarUrl: user.avatarUrl || "" })
        wx.reLaunch({ url: "/pages/preferences/preferences?onboarding=1" })
      }
    }).catch((error) => {
      console.error("[吃对饭][微信授权] 完整错误:", error)
      this.setData({ authLoading: false })
      const message = String(error && (error.errMsg || error.message) || "")
      if (/cancel|取消/i.test(message)) return wx.showToast({ title: "你已取消授权", icon: "none" })
      wx.showToast({ title: message || "登录失败，请重试", icon: "none" })
    })
  },

  loadSavedProfile() {
    const stored = wx.getStorageSync("preferences")
    const saved = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {}
    const remote = getApp().globalData.user && getApp().globalData.user.profile
    if (!isProfileComplete(saved) && remote && typeof remote === "object" && isProfileComplete(remote)) {
      wx.setStorageSync("preferences", remote)
      return this.loadSavedProfile()
    }
    if (!isProfileComplete(saved)) return
    if (saved.profileMode === "unhealth") saved.profileMode = "health"
    const tastes = buildCuisineOptions(saved.tastes)
    const allergens = Array.isArray(saved.allergens) ? saved.allergens.filter(Boolean) : this.data.allergens
    const gender = saved.profileMode === "pregnancy" ? "female" : (saved.gender || "")
    this.setData({ ...saved, gender, profileModes: buildProfileModes(gender), tastes, allergens, avatarUrl: saved.avatarUrl || "", selectedCuisineCount: tastes.filter((item) => item.checked).length, authUser: Boolean(getApp().globalData.user) }, () => {
      this.refreshProfileTargets()
      this.refreshProfileSummary()
      this.refreshHistoryChart()
    })
  },

  refreshProfileSummary() {
    const targets = calculateProfileTargets(this.data)
    if (!targets) return
    const modeMap = { pregnancy: "孕期营养", fatloss: "减脂塑形", health: "日常健康" }
    const stageMap = { 1: "孕早期", 2: "孕中期", 3: "孕晚期" }
    const activityMap = { low: "较少运动", medium: "规律运动", high: "高强度运动" }
    const selectedAllergens = (this.data.allergens || []).filter((item) => item.checked).map((item) => item.label)
    const selectedTastes = (this.data.tastes || []).filter((item) => item.checked).map((item) => item.label)
    const enabledReminders = (this.data.reminders || []).filter((item) => item.enabled)
    const today = dateKey(new Date())
    const savedLogs = wx.getStorageSync("dietLogs")
    const todayLogs = (Array.isArray(savedLogs) ? savedLogs : []).filter((item) => item && item.date === today)
    const todayKcal = Math.round(todayLogs.reduce((sum, item) => sum + (Number(item.kcal) || 0), 0))
    const goalProgress = Math.min(100, Math.round(todayKcal / targets.dailyKcal * 100))
    const detail = this.data.profileMode === "pregnancy"
      ? [stageMap[this.data.trimester] || "孕中期", this.data.gestationalDiabetes ? "妊娠糖尿病" : "", this.data.pregnancyHypertension ? "妊娠期高血压" : ""].filter(Boolean).join(" · ")
      : this.data.profileMode === "fatloss" ? activityMap[this.data.activityLevel] : "规律三餐与食物多样"
    this.setData({ profileSummary: {
      nickname: this.data.nickname || (getApp().globalData.user && getApp().globalData.user.nickname) || "未设置昵称",
      modeLabel: modeMap[this.data.profileMode] || modeMap.health,
      defaultAvatar: defaultProfileAvatar(this.data.profileMode, this.data.gender),
      detail,
      avatarMark: this.data.profileMode === "pregnancy" ? "孕" : this.data.gender === "male" ? "男" : "女",
      genderLabel: this.data.profileMode === "pregnancy" || this.data.gender === "female" ? "女性" : "男性",
      bmi: this.data.profileMode === "pregnancy" ? targets.prePregnancyBmi : targets.currentBmi,
      bmiLabel: this.data.profileMode === "pregnancy" ? targets.prePregnancyBmiLabel : "当前 BMI",
      targets,
      allergens: selectedAllergens,
      allergenText: selectedAllergens.length ? `避开 ${selectedAllergens.length} 项` : "无已知过敏原",
      tastes: selectedTastes,
      reminderText: enabledReminders.length ? `已开启 ${enabledReminders.length} 个` : "未开启",
      todayKcal,
      goalProgress,
      goalNearlyDone: goalProgress >= 80,
      goalProgressText: todayKcal ? `${todayKcal} / ${targets.dailyKcal} 千卡` : `今天还没有记录 · 目标 ${targets.dailyKcal} 千卡`,
      recordedMeals: todayLogs.length
    } })
  },

  chooseAvatar() {
    wx.chooseImage({ count: 1, sizeType: ["compressed"], sourceType: ["album", "camera"], success: (result) => {
      const tempFilePath = result.tempFilePaths && result.tempFilePaths[0]
      if (!tempFilePath) return
      wx.showLoading({ title: "正在检测", mask: true })
      const extension = (tempFilePath.match(/\.([a-z0-9]+)$/i) || ["", "jpg"])[1].toLowerCase()
      const cloudPath = `avatar-check/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`
      wx.cloud.uploadFile({ cloudPath, filePath: tempFilePath }).then((upload) => {
        return wx.cloud.callFunction({
          name: "checkAvatarImage",
          data: { fileID: upload.fileID, contentType: `image/${extension === "jpg" ? "jpeg" : extension}` }
        }).then((response) => ({ upload, response }))
      }).then(({ upload, response }) => {
        const check = response && response.result || {}
        if (!check.ok) {
          if (wx.cloud.deleteFile) wx.cloud.deleteFile({ fileList: [upload.fileID] }).catch(() => {})
          wx.hideLoading()
          wx.showModal({ title: check.blocked ? "头像未通过检测" : "头像检测暂时不可用", content: check.blocked ? "你发布的内容含违规信息，请更换后重试。" : "头像检测服务暂时不可用，请稍后重试。", showCancel: false, confirmText: "知道了" })
          return
        }
        const saveAvatar = (avatarUrl) => {
          this.setData({ avatarUrl })
          const saved = wx.getStorageSync("preferences") || {}
          wx.setStorageSync("preferences", { ...saved, avatarUrl })
          wx.hideLoading()
          wx.showToast({ title: "头像已更新", icon: "success" })
        }
        if (wx.saveFile) wx.saveFile({ tempFilePath, success: (saved) => saveAvatar(saved.savedFilePath), fail: () => saveAvatar(tempFilePath) })
        else saveAvatar(tempFilePath)
        if (wx.cloud.deleteFile) wx.cloud.deleteFile({ fileList: [upload.fileID] }).catch(() => {})
      }).catch(() => {
        wx.hideLoading()
        wx.showModal({ title: "头像检测暂时失败", content: "请稍后重试。", showCancel: false, confirmText: "知道了" })
      })
    } })
  },

  handleAvatarError() {
    if (!this.data.avatarUrl) return
    this.setData({ avatarUrl: "" })
    const saved = wx.getStorageSync("preferences") || {}
    wx.setStorageSync("preferences", { ...saved, avatarUrl: "" })
  },
  editProfile() { this.setData({ isEditing: true }) },
  cancelEdit() { this.setData({ isEditing: false }, () => this.loadSavedProfile()) },

  clearAllData() {
    wx.showModal({
      title: "清除所有数据？",
      content: "档案、饮食记录、自定义食材和偏好设置都会被删除，且无法恢复。",
      confirmText: "确认清除",
      confirmColor: "#B94A48",
      success: (result) => {
        if (!result.confirm) return
        const savedAvatar = this.data.avatarUrl
        if (savedAvatar && wx.removeSavedFile && savedAvatar.indexOf("wxfile://") === 0) {
          wx.removeSavedFile({ filePath: savedAvatar })
        }
        try {
          wx.clearStorageSync()
        } catch (error) {
          wx.showToast({ title: "清除失败，请重试", icon: "none" })
          return
        }
        wx.reLaunch({
          url: "/pages/preferences/preferences?onboarding=1",
          fail: () => {
            this.setData({
              isOnboarding: true,
              isEditing: false,
              onboardingStep: 1,
              profileMode: "",
              profileModes: buildProfileModes(""),
              allergyStatus: "",
              gender: "",
              age: "",
              heightCm: "",
              currentWeightKg: "",
              prePregnancyWeightKg: "",
              avatarUrl: "",
              profileSummary: null,
              tastes: buildCuisineOptions(),
              selectedCuisineCount: DEFAULT_CUISINES.length
            })
          }
        })
      }
    })
  },

  changeHistoryRange(e) {
    const historyRange = Number(e.currentTarget.dataset.range) || 7
    this.setData({ historyRange }, () => this.refreshHistoryChart())
  },

  refreshHistoryChart() {
    const range = this.data.historyRange
    const savedLogs = wx.getStorageSync("dietLogs")
    const logs = Array.isArray(savedLogs) ? savedLogs.filter((item) => item && typeof item === "object") : []
    const grouped = logs.reduce((map, item) => {
      if (!item.date) return map
      map[item.date] = (map[item.date] || 0) + (Number(item.kcal) || 0)
      return map
    }, {})
    const now = new Date()
    const points = []
    for (let offset = range - 1; offset >= 0; offset -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset)
      const key = dateKey(date)
      const hasRecord = Object.prototype.hasOwnProperty.call(grouped, key)
      points.push({ key, label: `${date.getMonth() + 1}/${date.getDate()}`, kcal: hasRecord ? Math.round(grouped[key]) : null, hasRecord })
    }
    const recorded = points.filter((point) => point.hasRecord)
    const average = recorded.length ? Math.round(recorded.reduce((sum, point) => sum + point.kcal, 0) / recorded.length) : 0
    const currentTargets = calculateProfileTargets(this.data)
    const target = currentTargets ? currentTargets.dailyKcal : 0
    const system = wx.getSystemInfoSync ? wx.getSystemInfoSync() : { windowWidth: 375 }
    const canvasWidth = Math.max(280, Math.round(system.windowWidth - 58))
    this.setData({ historyChart: { points, average, recordedDays: recorded.length, target, canvasWidth } }, () => {
      if (recorded.length) setTimeout(() => this.drawCalorieChart(), 30)
    })
  },

  drawCalorieChart() {
    const chart = this.data.historyChart
    if (!chart || !chart.recordedDays) return
    const width = chart.canvasWidth
    const height = 180
    const left = 12
    const right = 12
    const top = 20
    const bottom = 30
    const values = chart.points.filter((point) => point.hasRecord).map((point) => point.kcal)
    const maxValue = Math.max(500, chart.target * 1.2, ...values.map((value) => value * 1.12))
    const plotWidth = width - left - right
    const plotHeight = height - top - bottom
    const xAt = (index) => left + (chart.points.length === 1 ? plotWidth / 2 : index * plotWidth / (chart.points.length - 1))
    const yAt = (value) => top + plotHeight - Math.min(value, maxValue) / maxValue * plotHeight
    if (!wx.createCanvasContext) return
    const context = wx.createCanvasContext("calorieHistory", this)
    if (!context) return
    context.clearRect(0, 0, width, height)
    context.setStrokeStyle("#E5E9E5")
    context.setLineWidth(1)
    ;[0, 0.5, 1].forEach((ratio) => {
      const y = top + plotHeight * ratio
      context.beginPath()
      context.moveTo(left, y)
      context.lineTo(width - right, y)
      context.stroke()
    })
    if (chart.target) {
      context.save()
      context.setStrokeStyle("#D8923E")
      context.setLineWidth(1)
      context.setLineDash([5, 4], 0)
      context.beginPath()
      context.moveTo(left, yAt(chart.target))
      context.lineTo(width - right, yAt(chart.target))
      context.stroke()
      context.restore()
    }
    for (let index = 1; index < chart.points.length; index += 1) {
      const previous = chart.points[index - 1]
      const point = chart.points[index]
      if (!previous.hasRecord || !point.hasRecord) continue
      const isOverTarget = chart.target > 0 && point.kcal > chart.target
      context.setStrokeStyle(isOverTarget ? "#D95F49" : "#3F745D")
      context.setLineWidth(3)
      context.beginPath()
      context.moveTo(xAt(index - 1), yAt(previous.kcal))
      context.lineTo(xAt(index), yAt(point.kcal))
      context.stroke()
    }
    chart.points.forEach((point, index) => {
      if (!point.hasRecord) return
      const x = xAt(index)
      const y = yAt(point.kcal)
      const isOverTarget = chart.target > 0 && point.kcal > chart.target
      context.setFillStyle("#FFFFFF")
      context.setStrokeStyle(isOverTarget ? "#D95F49" : "#3F745D")
      context.setLineWidth(2)
      context.beginPath()
      context.arc(x, y, 4, 0, Math.PI * 2)
      context.fill()
      context.stroke()
    })
    context.setFillStyle("#7D8781")
    context.setFontSize(10)
    chart.points.forEach((point, index) => {
      const showLabel = chart.points.length <= 7 || index === 0 || index === chart.points.length - 1 || index % 3 === 0
      if (!showLabel) return
      context.setTextAlign(index === 0 ? "left" : index === chart.points.length - 1 ? "right" : "center")
      context.fillText(point.label, xAt(index), height - 9)
    })
    context.draw()
  },

  chooseProfileMode(e) {
    const profileMode = e.currentTarget.dataset.mode
    const option = this.data.profileModes.find((item) => item.id === profileMode)
    if (!option || option.disabled) return
    const defaults = {
      pregnancy: { calorieMin: 400, calorieMax: 550, proteinMin: 22 },
      fatloss: { calorieMin: 350, calorieMax: 450, proteinMin: 28 },
      health: { calorieMin: 400, calorieMax: 500, proteinMin: 24 }
    }
    const gender = profileMode === "pregnancy" ? "female" : this.data.gender
    this.setData({ profileMode, gender, profileModes: buildProfileModes(gender), ...defaults[profileMode] }, () => {
      this.refreshProfileTargets()
      this.refreshProfileSummary()
    })
  },
  updateCalorieMin(e) {
    const calorieMin = Number(e.detail.value)
    this.setData({ calorieMin, calorieMax: Math.max(calorieMin + 50, this.data.calorieMax) })
  },
  updateCalorieMax(e) {
    const calorieMax = Number(e.detail.value)
    this.setData({ calorieMax, calorieMin: Math.min(calorieMax - 50, this.data.calorieMin) })
  },
  updateProtein(e) { this.setData({ proteinMin: Number(e.detail.value) }) },
  chooseTrimester(e) { this.setData({ trimester: Number(e.currentTarget.dataset.value) }, () => this.refreshProfileTargets()) },
  chooseActivity(e) { this.setData({ activityLevel: e.currentTarget.dataset.value }, () => this.refreshProfileTargets()) },
  chooseGender(e) {
    const gender = e.currentTarget.dataset.gender
    const profileMode = gender === "male" && this.data.profileMode === "pregnancy" ? "" : this.data.profileMode
    this.setData({ gender, profileMode, profileModes: buildProfileModes(gender) }, () => {
      this.refreshProfileTargets()
      this.refreshProfileSummary()
    })
  },
  updateProfileField(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [field]: e.detail.value }, () => this.refreshProfileTargets())
  },
  refreshProfileTargets() {
    this.setData({ profileTargets: calculateProfileTargets(this.data) })
  },
  updateGestationalDiabetes(e) { this.setData({ gestationalDiabetes: e.detail.value }) },
  updatePregnancyHypertension(e) { this.setData({ pregnancyHypertension: e.detail.value }) },
  updateReminder(e) {
    const index = e.currentTarget.dataset.index
    this.setData({ [`reminders[${index}].enabled`]: e.detail.value })
  },
  updateReminderTime(e) {
    const index = e.currentTarget.dataset.index
    this.setData({ [`reminders[${index}].time`]: e.detail.value })
  },
  requestReminderPermission() {
    if (!mealReminderTemplateId) {
      wx.showModal({ title: "还差一个平台配置", content: "请先在微信公众平台申请用餐提醒订阅消息模板，并把模板 ID 填入 config/index.js。提醒时间已经可以保存。", showCancel: false })
      return
    }
    wx.requestSubscribeMessage({ tmplIds: [mealReminderTemplateId], success: () => wx.showToast({ title: "订阅状态已更新", icon: "none" }) })
  },
  updateBudget(e) { this.setData({ budget: e.detail.value }) },
  updateRepeat(e) { this.setData({ avoidRepeat: e.detail.value }) },
  updateSugar(e) { this.setData({ noSugar: e.detail.value }) },
  toggleTaste(e) {
    const index = e.currentTarget.dataset.index
    const current = this.data.tastes[index]
    const selectedCuisineCount = this.data.tastes.filter((item) => item.checked).length
    if (!current.checked && selectedCuisineCount >= 10) {
      wx.showToast({ title: "最多选择 10 种菜系", icon: "none" })
      return
    }
    const key = `tastes[${index}].checked`
    this.setData({ [key]: !current.checked, selectedCuisineCount: selectedCuisineCount + (current.checked ? -1 : 1) })
  },
  toggleAllergen(e) {
    const index = e.currentTarget.dataset.index
    const key = `allergens[${index}].checked`
    this.setData({ [key]: !this.data.allergens[index].checked })
  },
  chooseAllergyStatus(e) {
    const allergyStatus = e.currentTarget.dataset.status
    const next = { allergyStatus }
    if (allergyStatus === "none") next.allergens = this.data.allergens.map((item) => ({ ...item, checked: false }))
    this.setData(next)
  },
  nextOnboarding() {
    const step = this.data.onboardingStep
    if (step === 1) { const check = validateNickname(this.data.nickname); if (!check.ok) { wx.showToast({ title: check.message, icon: "none" }); return } }
    if (step === 1 && !this.data.gender) {
      wx.showToast({ title: "请先选择性别", icon: "none" })
      return
    }
    if (step === 1 && !this.data.profileMode) {
      wx.showToast({ title: "请先选择使用群体", icon: "none" })
      return
    }
    if (step === 2 && !this.validateBodyFields()) return
    this.setData({ onboardingStep: Math.min(3, step + 1) })
  },
  previousOnboarding() {
    this.setData({ onboardingStep: Math.max(1, this.data.onboardingStep - 1) })
  },
  validateBodyFields() {
    const { profileMode, gender, age, heightCm, currentWeightKg, prePregnancyWeightKg } = this.data
    if (!gender || !Number(age) || !Number(heightCm) || !Number(currentWeightKg)) {
      wx.showToast({ title: "请完整填写身体信息", icon: "none" })
      return false
    }
    if (Number(age) < 18 || Number(age) > 100 || Number(heightCm) < 120 || Number(heightCm) > 220 || Number(currentWeightKg) < 30 || Number(currentWeightKg) > 250) {
      wx.showToast({ title: "请检查年龄、身高和体重", icon: "none" })
      return false
    }
    if (profileMode === "pregnancy" && (!Number(prePregnancyWeightKg) || Number(prePregnancyWeightKg) < 30 || Number(prePregnancyWeightKg) > 250)) {
      wx.showToast({ title: "请填写有效的孕前体重", icon: "none" })
      return false
    }
    return true
  },
  save() {
    const { profileMode, allergyStatus, gender, age, heightCm, currentWeightKg, prePregnancyWeightKg, calorieMin, calorieMax, proteinMin, trimester, activityLevel, gestationalDiabetes, pregnancyHypertension, reminders, budget, tastes, allergens, avoidRepeat, noSugar, avatarUrl, nickname } = this.data
    const wasOnboarding = this.data.isOnboarding
    if (!profileMode || profileMode === "unhealth") {
      wx.showToast({ title: "请先选择使用群体", icon: "none" })
      return
    }
    const nicknameCheck = validateNickname(nickname)
    if (!nicknameCheck.ok) return wx.showToast({ title: nicknameCheck.message, icon: "none" })
    if (!this.validateBodyFields()) return
    if (!allergyStatus) {
      wx.showToast({ title: "请确认是否存在过敏原", icon: "none" })
      return
    }
    if (allergyStatus === "has" && !allergens.some((item) => item.checked)) {
      wx.showToast({ title: "请选择需要避开的过敏原", icon: "none" })
      return
    }
    if (tastes.filter((item) => item.checked).length > 10) {
      wx.showToast({ title: "菜系偏好不能超过 10 种", icon: "none" })
      return
    }
    const app = getApp()
    const profileTargets = calculateProfileTargets(this.data)
    wx.setStorageSync("preferences", { profileCreated: true, profileVersion: PROFILE_SCHEMA_VERSION, nickname: String(nickname || "").trim(), profileMode, allergyStatus, gender, age: Number(age), heightCm: Number(heightCm), currentWeightKg: Number(currentWeightKg), prePregnancyWeightKg: profileMode === "pregnancy" ? Number(prePregnancyWeightKg) : 0, profileTargets, calorieMin, calorieMax, proteinMin, trimester, activityLevel, gestationalDiabetes, pregnancyHypertension, reminders, budget, tastes, allergens, avoidRepeat, noSugar, avatarUrl: avatarUrl || "" })
    const finish = () => { this.setData({ isOnboarding: false, isEditing: false }); wx.showToast({ title: wasOnboarding ? "档案创建成功" : "档案已更新", icon: "success" }); setTimeout(() => wx.switchTab({ url: "/pages/today/today" }), 500) }
    if (app.globalData.user && wx.cloud) {
      const authPayload = { action: "login", profile: { nickname: String(nickname || "").trim(), profileCompleted: true, profile: { profileCreated: true, profileVersion: PROFILE_SCHEMA_VERSION, nickname: String(nickname || "").trim(), profileMode, allergyStatus, gender, age: Number(age), heightCm: Number(heightCm), currentWeightKg: Number(currentWeightKg), prePregnancyWeightKg: profileMode === "pregnancy" ? Number(prePregnancyWeightKg) : 0, profileTargets, calorieMin, calorieMax, proteinMin, trimester, activityLevel, gestationalDiabetes, pregnancyHypertension, reminders, budget, tastes, allergens, avoidRepeat, noSugar, avatarUrl: avatarUrl || "" } } }
      console.log("[吃对饭][档案保存] 开始调用 auth 云函数", { profileMode, profileCompleted: true, hasNickname: Boolean(nickname), hasAvatar: Boolean(avatarUrl), age: Number(age), heightCm: Number(heightCm), currentWeightKg: Number(currentWeightKg) })
      wx.cloud.callFunction({ name: "auth", data: authPayload }).then((response) => {
        console.log("[吃对饭][档案保存] auth 云函数原始响应", response)
        const result = response && response.result
        if (!result || !result.ok || !result.user) {
          console.log("[吃对饭][档案保存] auth 返回业务失败", { result, requestId: response && (response.requestId || response.requestID) })
          const error = new Error(result && result.message || "同步用户信息失败")
          error.debug = result && result.debug
          throw error
        }
        app.globalData.user = result.user
        wx.setStorageSync("authUser", result.user)
        console.log("[吃对饭][档案保存] auth 保存成功", { userId: result.user._id || "", profileCompleted: result.user.profileCompleted })
        finish()
      }).catch((error) => {
        const detail = describeCloudError(error)
        console.log("[吃对饭][档案保存] auth 云函数调用失败", { ...detail, serverDebug: error && error.debug || null })
        wx.showToast({ title: error && error.message === "昵称已被使用，请换一个" ? error.message : "云端保存失败，请查看控制台日志", icon: "none", duration: 2600 })
      })
      return
    }
    finish()
  },
  goBack() {
    if (this.data.isOnboarding) return
    if (this.data.isEditing) {
      this.cancelEdit()
      return
    }
    wx.switchTab({ url: "/pages/today/today" })
  }
})
