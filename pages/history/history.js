const { todayKey } = require("../../utils/daily-plan")
const { loadCloudCatalog } = require("../../utils/cloud-catalog")

function pad(value) { return String(value).padStart(2, "0") }

function prepareLogImage(log) {
  const dishes = wx.getStorageSync("cloudCatalog:dish") || []
  const foods = wx.getStorageSync("cloudCatalog:food") || []
  const catalogItem = log.source === "vision" ? null : [...dishes, ...foods].find((item) => item && item.title === log.title)
  const catalogImageUrl = (catalogItem && (catalogItem.imageUrl || catalogItem.cloudImageUrl)) || log.catalogImageUrl || ""
  const displayImageUrl = log.imagePath || catalogImageUrl
  const sourceLabels = { vision: "拍照识别", "dish-catalog": "菜品库", plan: "今日计划", manual: "手工录入" }
  return { ...log, isVision: log.source === "vision", sourceLabel: sourceLabels[log.source] || "餐食记录", catalogImageUrl, displayImageUrl, imageSourceLabel: log.imagePath ? "用户拍摄" : catalogImageUrl ? "菜品库图片" : "" }
}

function prepareDetailLog(rawLog) {
  const log = prepareLogImage(rawLog)
  const isLegacyNutrition = !log.nutritionDataVersion
  const nutritionDetails = (log.nutritionDetails || []).map((item) => {
    const numericValue = item.value === null || item.value === undefined || item.value === "" ? null : Number(item.value)
    const unavailable = numericValue === null || !Number.isFinite(numericValue) || (isLegacyNutrition && numericValue === 0)
    return { ...item, displayText: unavailable ? "--" : (item.displayText || `${numericValue}${item.unit || ""}`), unavailable }
  })
  const confidenceLabels = { high: "高", medium: "中", low: "低", 高: "高", 中: "中", 低: "低" }
  const gramsMatches = String(log.unit || "").match(/\d+(?:\.\d+)?\s*g/gi) || []
  const inferredGrams = gramsMatches.length ? Number(gramsMatches[gramsMatches.length - 1].replace(/\s*g/i, "")) : 0
  const measureUnit = log.measureUnit === "ml" ? "ml" : "g"
  const actualAmountText = Number(log.amount) > 0 ? `${Number(log.amount)}${measureUnit}` : ""
  const ingredients = (Array.isArray(log.ingredients) ? log.ingredients : []).filter((item) => item && item.name).map((item) => ({ ...item, gramsText: Number(item.grams) > 0 ? `${item.grams}g` : "份量未识别", kcalText: Number(item.kcal) > 0 ? `${Math.round(item.kcal)} 千卡` : "" }))
  return { ...log, confidenceLabel: confidenceLabels[String(log.confidence || "").toLowerCase()] || log.confidence || "", actualGramsText: Number(log.actualGrams || inferredGrams) > 0 ? `${Number(log.actualGrams || inferredGrams)}g` : "", actualAmountText, ingredients, nutritionDetails, hasUnavailableNutrition: nutritionDetails.some((item) => item.unavailable) }
}

Page({
  data: { headerInset: 0, year: 0, month: 0, monthText: "", calendar: [], selectedDate: "", selectedLabel: "", selectedLogs: [], selectedTotals: {}, monthTotals: {}, detailLog: null, showLogDetail: false, showLogEdit: false, editLogForm: { id: "", title: "", unit: "", kcal: "", protein: "", carbs: "", fat: "", fiber: "" }, weekdays: ["一", "二", "三", "四", "五", "六", "日"] },
  onLoad(options = {}) {
    const now = new Date()
    const menu = wx.getMenuButtonBoundingClientRect()
    const sharedDate = /^\d{4}-\d{2}-\d{2}$/.test(options.date || "") ? options.date : todayKey(now)
    const selected = new Date(`${sharedDate}T00:00:00`)
    this.setData({ headerInset: menu.bottom + 8, year: selected.getFullYear(), month: selected.getMonth() + 1, selectedDate: sharedDate }, () => {
      this.buildCalendar(() => {
        if (options.edit) this.openLogEdit({ currentTarget: { dataset: { id: options.edit } } })
      })
    })
  },
  onShow() {
    const tabBar = typeof this.getTabBar === "function" ? this.getTabBar() : null
    if (tabBar) (this.data.showLogDetail || this.data.showLogEdit) ? tabBar.hideForOverlay() : tabBar.showForPage(1)
    this.buildCalendar()
    Promise.all([loadCloudCatalog("dish"), loadCloudCatalog("food")]).then(() => this.buildCalendar())
    const app = getApp()
    const pending = app.globalData.pendingHistoryEdit
    if (pending && pending.id) {
      app.globalData.pendingHistoryEdit = null
      const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(pending.date || "") ? pending.date : todayKey()
      const selected = new Date(`${selectedDate}T00:00:00`)
      this.setData({ year: selected.getFullYear(), month: selected.getMonth() + 1, selectedDate }, () => {
        this.buildCalendar(() => this.openLogEdit({ currentTarget: { dataset: { id: pending.id } } }))
      })
    }
  },
  onShareAppMessage() {
    const date = this.data.selectedDate || todayKey()
    const label = this.data.selectedLabel || "今日"
    return {
      title: `吃对饭 · ${label}饮食记录`,
      path: `/pages/history/history?date=${date}`
    }
  },
  buildCalendar(done) {
    const { year, month } = this.data
    const logs = wx.getStorageSync("dietLogs") || []
    const monthPrefix = `${year}-${pad(month)}`
    const monthLogs = logs.filter((item) => item.date && item.date.startsWith(monthPrefix))
    const grouped = monthLogs.reduce((map, item) => {
      map[item.date] = map[item.date] || []
      map[item.date].push(item)
      return map
    }, {})
    const firstDay = new Date(year, month - 1, 1).getDay()
    const leading = (firstDay + 6) % 7
    const daysInMonth = new Date(year, month, 0).getDate()
    const calendar = Array.from({ length: leading }, (_, index) => ({ empty: true, key: `empty-${index}` }))
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = `${monthPrefix}-${pad(day)}`
      const dayLogs = grouped[date] || []
      const kcal = Math.round(dayLogs.reduce((sum, item) => sum + (Number(item.kcal) || 0), 0))
      calendar.push({ key: date, date, day, kcal, count: dayLogs.length, isToday: date === todayKey(), selected: date === this.data.selectedDate })
    }
    const monthTotals = monthLogs.reduce((sum, item) => ({ kcal: sum.kcal + (Number(item.kcal) || 0), count: sum.count + 1 }), { kcal: 0, count: 0 })
    this.setData({ calendar, monthText: `${year}年${month}月`, monthTotals: { kcal: Math.round(monthTotals.kcal), count: monthTotals.count } }, () => {
      this.selectDateValue(this.data.selectedDate, done)
    })
  },
  selectDay(e) {
    const date = e.currentTarget.dataset.date
    if (!date) return
    this.setData({ selectedDate: date }, () => this.buildCalendar())
  },
  selectDateValue(date, done) {
    const logs = (wx.getStorageSync("dietLogs") || []).filter((item) => item.date === date).map(prepareLogImage)
    const selectedTotals = logs.reduce((sum, item) => {
      ;["kcal", "protein", "carbs", "fat", "fiber"].forEach((key) => { sum[key] += Number(item[key]) || 0 })
      return sum
    }, { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 })
    const parts = date.split("-")
    this.setData({ selectedLogs: logs, selectedTotals: { kcal: Math.round(selectedTotals.kcal), protein: Math.round(selectedTotals.protein * 10) / 10, carbs: Math.round(selectedTotals.carbs * 10) / 10, fat: Math.round(selectedTotals.fat * 10) / 10 }, selectedLabel: `${Number(parts[1])}月${Number(parts[2])}日` }, () => {
      if (typeof done === "function") done()
    })
  },
  changeMonth(e) {
    const delta = Number(e.currentTarget.dataset.delta)
    const next = new Date(this.data.year, this.data.month - 1 + delta, 1)
    const selectedDate = `${next.getFullYear()}-${pad(next.getMonth() + 1)}-01`
    this.setData({ year: next.getFullYear(), month: next.getMonth() + 1, selectedDate }, () => this.buildCalendar())
  },
  openLogDetail(e) {
    const id = String(e.currentTarget.dataset.id)
    const log = this.data.selectedLogs.find((item) => String(item.id) === id)
    if (!log) return
    const tabBar = typeof this.getTabBar === "function" ? this.getTabBar() : null
    if (tabBar) tabBar.hideForOverlay()
    this.setData({ detailLog: prepareDetailLog(log), showLogDetail: true })
  },
  closeLogDetail() {
    this.setData({ showLogDetail: false, detailLog: null })
    const tabBar = typeof this.getTabBar === "function" ? this.getTabBar() : null
    if (tabBar) tabBar.showForPage(1)
  },
  openLogEdit(e) {
    const id = String(e.currentTarget.dataset.id)
    const log = this.data.selectedLogs.find((item) => String(item.id) === id)
    if (!log) return
    const tabBar = typeof this.getTabBar === "function" ? this.getTabBar() : null
    if (tabBar) tabBar.hideForOverlay()
    this.setData({ showLogDetail: false, showLogEdit: true, editLogForm: { id: String(log.id), title: log.title || "", unit: log.unit || "", kcal: String(log.kcal || 0), protein: String(log.protein || 0), carbs: String(log.carbs || 0), fat: String(log.fat || 0), fiber: String(log.fiber || 0) } })
  },
  closeLogEdit() {
    this.setData({ showLogEdit: false })
    const tabBar = typeof this.getTabBar === "function" ? this.getTabBar() : null
    if (tabBar) tabBar.showForPage(1)
  },
  updateLogField(e) { this.setData({ [`editLogForm.${e.currentTarget.dataset.field}`]: e.detail.value }) },
  saveLogEdit() {
    const form = this.data.editLogForm
    const title = String(form.title || "").trim()
    const unit = String(form.unit || "").trim()
    const nutrition = { kcal: Number(form.kcal), protein: Number(form.protein), carbs: Number(form.carbs), fat: Number(form.fat), fiber: Number(form.fiber) || 0 }
    if (!title || !unit || String(form.kcal == null ? "" : form.kcal).trim() === "" || !Number.isFinite(nutrition.kcal) || nutrition.kcal < 0 || [nutrition.protein, nutrition.carbs, nutrition.fat, nutrition.fiber].some((value) => !Number.isFinite(value) || value < 0)) return wx.showToast({ title: "请完整填写菜品和营养值", icon: "none" })
    const logs = wx.getStorageSync("dietLogs") || []
    const index = logs.findIndex((item) => String(item.id) === String(form.id))
    if (index < 0) return wx.showToast({ title: "没有找到这条记录", icon: "none" })
    const amountTokens = unit.match(/\d+(?:\.\d+)?\s*(?:ml|g)\b/gi) || []
    const amountMatch = String(amountTokens[amountTokens.length - 1] || "").match(/(\d+(?:\.\d+)?)\s*(ml|g)/i)
    const amountFields = logs[index].source !== "vision" && (Number(logs[index].amount) > 0 || logs[index].source === "manual") && amountMatch
      ? { amount: Number(amountMatch[1]), measureUnit: amountMatch[2].toLowerCase() }
      : {}
    logs[index] = { ...logs[index], title, unit, ...amountFields, ...nutrition }
    wx.setStorageSync("dietLogs", logs)
    this.closeLogEdit()
    this.buildCalendar()
    wx.showToast({ title: "修改已保存", icon: "success" })
  },
  noop() {},
  deleteLog(e) {
    const id = String(e.currentTarget.dataset.id)
    wx.showModal({
      title: "删除这条记录？",
      content: "删除后当天营养汇总也会同步更新。",
      confirmText: "删除",
      confirmColor: "#B95F50",
      success: (res) => {
        if (!res.confirm) return
        const logs = wx.getStorageSync("dietLogs") || []
        const removed = logs.find((item) => String(item.id) === id)
        wx.setStorageSync("dietLogs", logs.filter((item) => String(item.id) !== id))
        if (removed && removed.imagePath && wx.removeSavedFile) wx.removeSavedFile({ filePath: removed.imagePath, fail: () => {} })
        if (this.data.detailLog && String(this.data.detailLog.id) === id) this.closeLogDetail()
        this.buildCalendar()
        wx.showToast({ title: "已删除", icon: "success" })
      }
    })
  },
  addRecord(e) {
    const date = e && e.currentTarget && e.currentTarget.dataset.date
    wx.navigateTo({ url: `/pages/record/record${date ? `?date=${date}` : ""}` })
  }
})
