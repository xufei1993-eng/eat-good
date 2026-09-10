const { buildDailyPlan, todayKey } = require("../../utils/daily-plan")
const { buildDishCatalog, searchDishes, dishServingAmount, dishMeasureUnit, dishNutritionPer100 } = require("../../utils/dish-catalog")
const { loadCloudCatalog, searchCloudCatalog } = require("../../utils/cloud-catalog")
const { compressForUpload } = require("../../utils/image-helper")

const PORTIONS = [
  { value: 0.5, label: "半份" },
  { value: 1, label: "标准份" },
  { value: 1.5, label: "加量" }
]

const NUTRIENT_DEFS = [
  { key: "fiber", label: "膳食纤维", unit: "g" },
  { key: "sugar", label: "糖", unit: "g" },
  { key: "saturatedFat", label: "饱和脂肪", unit: "g" },
  { key: "transFat", label: "反式脂肪", unit: "g" },
  { key: "sodium", label: "钠", unit: "mg" },
  { key: "potassium", label: "钾", unit: "mg" },
  { key: "calcium", label: "钙", unit: "mg" },
  { key: "iron", label: "铁", unit: "mg" },
  { key: "vitaminD", label: "维生素 D", unit: "μg" },
  { key: "vitaminB6", label: "维生素 B6", unit: "mg" },
  { key: "vitaminB12", label: "维生素 B12", unit: "μg" },
  { key: "cholesterol", label: "胆固醇", unit: "mg" }
]

const ROLE_ADVICE_FALLBACKS = {
  fatloss: { title: "减脂塑形建议", advice: "优先保证蛋白质和蔬菜摄入，再根据本餐热量调整后续主食与用油，避免为了控热量跳过下一餐。" },
  pregnancy: { title: "孕期营养建议", advice: "确认肉、蛋和水产完全熟透，并结合全天饮食补足优质蛋白、蔬菜和含铁食物；特殊指标请遵循医生方案。" },
  health: { title: "日常健康建议", advice: "把这餐放进全天结构中看，后续餐次可补足本餐较少的蔬菜、全谷物或优质蛋白，保持食材多样。" }
}

function round1(value) {
  return Math.round(Number(value || 0) * 10) / 10
}
const { canTakePhoto } = require("../../utils/photo-quota")

function profileForVision(preferences = {}) {
  return {
    profileMode: ["fatloss", "pregnancy", "health"].includes(preferences.profileMode) ? preferences.profileMode : "health",
    trimester: Number(preferences.trimester) || 0,
    activityLevel: preferences.activityLevel || "",
    gestationalDiabetes: Boolean(preferences.gestationalDiabetes),
    pregnancyHypertension: Boolean(preferences.pregnancyHypertension),
    noSugar: Boolean(preferences.noSugar),
    allergens: (preferences.allergens || []).filter((item) => item && item.checked).map((item) => item.label).slice(0, 12)
  }
}

function nutrientDetails(analysis = {}) {
  const nutrients = analysis.nutrients || {}
  return NUTRIENT_DEFS.map((definition) => {
    const raw = definition.key === "fiber" && nutrients.fiber == null ? analysis.fiber : nutrients[definition.key]
    const value = raw && typeof raw === "object" ? raw.value : raw
    const numericValue = value === null || value === undefined || value === "" ? null : Number(value)
    const normalizedValue = Number.isFinite(numericValue) && numericValue >= 0 ? round1(numericValue) : null
    return { ...definition, value: normalizedValue, displayText: normalizedValue === null ? "--" : `${normalizedValue}${definition.unit}` }
  })
}

Page({
  data: {
    headerInset: 0,
    slot: "snack",
    recordMode: "photo",
    recordDate: "",
    recordDateLabel: "",
    imagePath: "",
    imageFileID: "",
    analyzing: false,
    analysis: null,
    analysisError: "",
    autoSavedLogId: "",
    autoSaveStatus: "",
    savedImagePath: "",
    showVisionEdit: false,
    visionEditForm: { title: "", foodsText: "", kcal: "", protein: "", carbs: "", fat: "", fiber: "" },
    plannedMeal: null,
    searchQuery: "",
    searchResults: [],
    hasSearched: false,
    selectedDish: null,
    portions: PORTIONS,
    serving: 1,
    customServingGrams: "",
    estimate: null,
    showCustomFood: false,
    selectedMeasureUnit: "g",
    customFoodForm: { title: "", grams: "", measureUnit: "g", matched: false, kcal: "", protein: "", carbs: "", fat: "", fiber: "" }
    ,cuisineFilter: "全部", cuisineFilters: ["全部", "家常菜", "川菜", "粤菜", "江浙菜", "西北菜", "东北菜", "日韩料理", "轻食", "烧烤", "粉面", "海鲜", "自助餐"]
  },
  onLoad(options) {
    const menu = wx.getMenuButtonBoundingClientRect()
    const slot = options.slot || "snack"
    const recordDate = options.date || todayKey()
    const requestedMode = ["photo", "plan", "search", "manual"].includes(options.mode) ? options.mode : "photo"
    const preferences = { profileMode: "health", ...wx.getStorageSync("preferences") }
    const plannedMeal = buildDailyPlan(preferences).meals.find((meal) => meal.slot === slot) || null
    const customFoods = (wx.getStorageSync("customFoods") || []).map((item) => ({
      ...item,
      cuisine: item.cuisine || "自定义",
      slotLabel: item.slotLabel || "自定义",
      foodsText: item.foodsText || `${item.title} ${item.unit || ""}`.trim(),
      searchText: `${item.title || ""}${item.foodsText || ""}自定义`.toLowerCase()
    }))
    this.dishCatalog = [...customFoods, ...buildDishCatalog()]
    this.setData({
      headerInset: menu.bottom + 8,
      slot,
      recordMode: requestedMode,
      recordDate,
      recordDateLabel: this.formatDate(recordDate),
      plannedMeal,
      searchResults: this.initialDishes(preferences, slot)
    })
    this.syncCloudCatalog(customFoods, preferences, slot)
  },
  onShow() {
    if (!this.data || !this.data.slot) return
    const preferences = { profileMode: "health", ...wx.getStorageSync("preferences") }
    const customFoods = (wx.getStorageSync("customFoods") || []).map((item) => ({
      ...item,
      cuisine: item.cuisine || "自定义",
      slotLabel: item.slotLabel || "自定义",
      foodsText: item.foodsText || `${item.title} ${item.unit || ""}`.trim(),
      searchText: `${item.title || ""}${item.foodsText || ""}自定义`.toLowerCase()
    }))
    this.syncCloudCatalog(customFoods, preferences, this.data.slot)
  },
  syncCloudCatalog(customFoods, preferences, slot) {
    // Cloud content is authoritative when available; local JS data remains a
    // migration/offline fallback until the first catalog sync completes.
    Promise.all([loadCloudCatalog("dish"), loadCloudCatalog("food")]).then(([cloudDishes, cloudFoods]) => {
      const cloudCatalog = [...cloudDishes, ...cloudFoods]
      if (!cloudCatalog.length) return
      this.dishCatalog = [...customFoods, ...cloudCatalog]
      if (this.data.hasSearched) return this.searchCloudDishes(this.data.searchQuery, this.data.cuisineFilter)
      this.setData({ searchResults: this.initialDishes(preferences, slot) })
    })
  },
  chooseRecordMode(e) {
    const recordMode = e.currentTarget.dataset.mode
    if (!["photo", "plan", "search", "manual"].includes(recordMode)) return
    this.setData({ recordMode })
  },
  onShareAppMessage() {
    return { title: "吃对饭 · 记录今天这一餐", path: "/pages/record/record" }
  },
  initialDishes(preferences, slot) {
    const preferred = (preferences.tastes || []).filter((item) => item && item.checked).map((item) => item.label)
    const slotMatches = this.dishCatalog.filter((dish) => slot === "snack" || dish.slot === slot)
    const cuisineMatches = preferred.length ? slotMatches.filter((dish) => preferred.includes(dish.cuisine)) : slotMatches
    return (cuisineMatches.length ? cuisineMatches : slotMatches).slice(0, 3)
  },
  formatDate(date) {
    const parts = date.split("-")
    return `${parts[0]}年${Number(parts[1])}月${Number(parts[2])}日`
  },
  changeDate(e) {
    const recordDate = e.detail.value
    this.setData({ recordDate, recordDateLabel: this.formatDate(recordDate) }, () => {
      if (this.data.analysis) this.saveVisionLog({ silent: true })
    })
  },
  async choosePhoto() {
    if (this.data.analyzing || this.checkingPhotoQuota) return
    this.checkingPhotoQuota = true
    const allowed = await canTakePhoto()
    this.checkingPhotoQuota = false
    if (!allowed) return
    try {
      const res = await new Promise((resolve, reject) => {
        wx.chooseMedia({ count: 1, mediaType: ["image"], sourceType: ["camera", "album"], success: resolve, fail: reject })
      })
      const previousFileID = this.data.imageFileID
      const rawPath = res.tempFiles[0].tempFilePath
      const filePath = await compressForUpload(rawPath)
      const visionProfile = profileForVision(wx.getStorageSync("preferences") || {})
      this.setData({ imagePath: filePath, analyzing: true, analysis: null, analysisError: "", selectedDish: null, estimate: null, autoSaveStatus: "", savedImagePath: "" })
      const cloudPath = `meal-images/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
      const upload = await wx.cloud.uploadFile({ cloudPath, filePath })
      this.setData({ imageFileID: upload.fileID })
      if (previousFileID && previousFileID !== upload.fileID) wx.cloud.deleteFile({ fileList: [previousFileID] }).catch(() => {})
      const response = await wx.cloud.callFunction({ name: "analyzeMealImage", data: { fileID: upload.fileID, profile: visionProfile } })
      const result = response.result || {}
      if (!result.ok || !result.analysis) {
        throw new Error(result.message || "暂时无法识别这张图片")
      }
      const analysis = result.analysis
      const ingredients = Array.isArray(analysis.ingredients) ? analysis.ingredients : []
      const adviceFallback = ROLE_ADVICE_FALLBACKS[visionProfile.profileMode] || ROLE_ADVICE_FALLBACKS.health
      const selectedDish = {
        id: `vision-${Date.now()}`,
        title: analysis.dishName || "图片中的餐食",
        cuisine: "图片识别",
        slotLabel: "视觉估算",
        foodsText: ingredients.map((item) => `${item.name} ${item.grams || ""}g`).join(" · ") || "主要食材待确认",
        kcal: Number(analysis.kcal) || ingredients.reduce((sum, item) => sum + (Number(item.kcal) || 0), 0),
        protein: Number(analysis.protein) || 0,
        carbs: Number(analysis.carbs) || 0,
        fat: Number(analysis.fat) || 0,
        fiber: Number(analysis.fiber) || Number(analysis.nutrients && analysis.nutrients.fiber) || 0,
        nutritionDetails: nutrientDetails(analysis),
        adviceTitle: analysis.adviceTitle || adviceFallback.title,
        advice: analysis.advice || adviceFallback.advice
        ,photoScore: Math.max(0, Math.min(100, Number(analysis.score) || 0))
        ,photoScoreTitle: String(analysis.scoreTitle || "营养点评").slice(0, 4)
      }
      this.setData({ analyzing: false, analysis, selectedDish, selectedMeasureUnit: "g", serving: 1, customServingGrams: String(dishServingAmount(selectedDish)), autoSaveStatus: "" }, () => {
        this.calculate(() => this.saveVisionLog())
      })
    } catch (error) {
      this.setData({ analyzing: false, analysisError: (error && error.message) || "识别失败，请直接搜索菜名记录" })
    }
  },
  removePhoto() {
    const imageFileID = this.data.imageFileID
    const isVisionDish = this.data.selectedDish && this.data.selectedDish.cuisine === "图片识别"
    this.setData({
      imagePath: "",
      imageFileID: "",
      analyzing: false,
      analysis: null,
      analysisError: "",
      showVisionEdit: false,
      selectedDish: isVisionDish ? null : this.data.selectedDish,
      estimate: isVisionDish ? null : this.data.estimate,
      serving: isVisionDish ? 1 : this.data.serving
    })
    if (imageFileID) wx.cloud.deleteFile({ fileList: [imageFileID] }).catch(() => {})
    wx.showToast({ title: this.data.autoSavedLogId ? "照片已移除，记录已保留" : "已移除照片", icon: "none" })
  },
  replaceVisionResult(updates, callback) {
    const imageFileID = this.data.imageFileID
    this.setData({
      imagePath: "",
      imageFileID: "",
      analyzing: false,
      analysis: null,
      analysisError: "",
      showVisionEdit: false,
      autoSavedLogId: "",
      autoSaveStatus: "",
      savedImagePath: "",
      ...updates
    }, callback)
    if (imageFileID) wx.cloud.deleteFile({ fileList: [imageFileID] }).catch(() => {})
  },
  updateSearch(e) {
    const searchQuery = e.detail.value
    this.setData({ searchQuery, hasSearched: Boolean(searchQuery.trim()), searchResults: this.filteredSearch(searchQuery, this.data.cuisineFilter) })
    clearTimeout(this.searchTimer)
    this.searchTimer = setTimeout(() => this.searchCloudDishes(searchQuery, this.data.cuisineFilter), 250)
  },
  filteredSearch(query = this.data.searchQuery, cuisine = this.data.cuisineFilter) {
    const source = cuisine && cuisine !== "全部" ? this.dishCatalog.filter((dish) => dish.cuisine === cuisine) : this.dishCatalog
    return searchDishes(source, query, 8)
  },
  chooseCuisineFilter(e) {
    const cuisineFilter = e.currentTarget.dataset.cuisine || "全部"
    const searchQuery = this.data.searchQuery || ""
    this.setData({ cuisineFilter, hasSearched: Boolean(searchQuery.trim()) || cuisineFilter !== "全部", searchResults: this.filteredSearch(searchQuery, cuisineFilter) })
    this.searchCloudDishes(searchQuery, cuisineFilter)
  },
  searchCloudDishes(keyword, cuisine) {
    if (!String(keyword || "").trim() && (!cuisine || cuisine === "全部")) return Promise.resolve()
    const requestId = (this.cloudSearchRequestId || 0) + 1
    this.cloudSearchRequestId = requestId
    return Promise.all([
      searchCloudCatalog("dish", { keyword, cuisine: cuisine === "自助餐" ? "" : cuisine, tag: cuisine === "自助餐" ? "自助餐" : "", pageSize: 30 }),
      cuisine && cuisine !== "全部" ? Promise.resolve({ items: [] }) : searchCloudCatalog("food", { keyword, pageSize: 15 })
    ]).then(([dishes, foods]) => {
      if (requestId !== this.cloudSearchRequestId) return
      const localResults = this.filteredSearch(keyword, cuisine)
      const merged = [...dishes.items, ...foods.items, ...localResults].filter((item, index, list) => {
        const key = item.id || `${item.title}:${item.cuisine || ""}`
        return list.findIndex((candidate) => (candidate.id || `${candidate.title}:${candidate.cuisine || ""}`) === key) === index
      }).slice(0, 30)
      const known = new Set(this.dishCatalog.map((item) => item.id))
      this.dishCatalog.push(...merged.filter((item) => item.id && !known.has(item.id)))
      this.setData({ searchResults: merged })
    })
  },
  clearSearch() {
    const preferences = { profileMode: "health", ...wx.getStorageSync("preferences") }
    this.setData({ searchQuery: "", cuisineFilter: "全部", hasSearched: false, searchResults: this.initialDishes(preferences, this.data.slot) })
  },
  chooseDish(e) {
    const selectedDish = this.data.searchResults.find((dish) => dish.id === e.currentTarget.dataset.id) || this.dishCatalog.find((dish) => dish.id === e.currentTarget.dataset.id)
    if (!selectedDish) return
    this.replaceVisionResult({ selectedDish, selectedMeasureUnit: dishMeasureUnit(selectedDish), serving: 1, customServingGrams: String(dishServingAmount(selectedDish)), estimate: null }, () => this.calculate())
  },
  choosePortion(e) {
    const serving = Number(e.currentTarget.dataset.value) || 1
    this.setData({ serving, customServingGrams: String(Math.round(dishServingAmount(this.data.selectedDish) * serving)) }, () => {
      this.calculate(() => {
        if (this.data.analysis) this.saveVisionLog({ silent: true })
      })
    })
  },
  updateServingGrams(e) {
    const customServingGrams = e.detail.value
    const dish = this.data.selectedDish
    if (!dish || !Number(customServingGrams) || Number(customServingGrams) <= 0) return this.setData({ customServingGrams })
    const serving = Number(customServingGrams) / dishServingAmount(dish)
    this.setData({ customServingGrams, serving }, () => this.calculate(() => { if (this.data.analysis) this.saveVisionLog({ silent: true }) }))
  },
  calculate(callback) {
    const dish = this.data.selectedDish
    if (!dish) return this.setData({ estimate: null })
    const factor = Number(this.data.serving) || 1
    this.setData({ estimate: {
      title: dish.title,
      unit: `${dish.foodsText} · ${this.data.customServingGrams || Math.round(dishServingAmount(dish) * factor)}${dishMeasureUnit(dish)}`,
      kcal: Math.round(dish.kcal * factor),
      protein: round1(dish.protein * factor),
      carbs: round1(dish.carbs * factor),
      fat: round1(dish.fat * factor),
      fiber: round1(dish.fiber * factor),
      nutritionDetails: (dish.nutritionDetails || []).map((item) => {
        const value = item.value === null || item.value === undefined ? null : round1(item.value * factor)
        return { ...item, value, displayText: value === null ? "--" : `${value}${item.unit}` }
      }),
      adviceTitle: dish.adviceTitle || "本餐建议",
      advice: dish.advice || ""
    }, selectedMeasureUnit: dishMeasureUnit(dish) }, callback)
  },
  portionLabel(value) {
    const portion = PORTIONS.find((item) => item.value === value)
    return portion ? portion.label : `${value}份`
  },
  usePlannedMeal() {
    const meal = this.data.plannedMeal
    if (!meal) return
    const foodsText = meal.foodsText || (meal.foods || []).join(" · ")
    const selectedDish = { id: `plan-${meal.id || Date.now()}`, title: meal.title, cuisine: "今日计划", slotLabel: "计划餐", foodsText, imageUrl: meal.imageUrl || "", cloudImageUrl: meal.cloudImageUrl || "", kcal: meal.kcal, protein: meal.protein, carbs: meal.carbs, fat: meal.fat, fiber: meal.fiber }
    this.replaceVisionResult({ selectedDish, selectedMeasureUnit: dishMeasureUnit(selectedDish), searchQuery: meal.title, searchResults: [], hasSearched: true, serving: 1, customServingGrams: String(dishServingAmount(selectedDish)), estimate: null }, () => this.calculate())
  },
  openVisionEdit() {
    const dish = this.data.selectedDish
    if (!dish || dish.cuisine !== "图片识别") return
    this.setData({
      showVisionEdit: true,
      visionEditForm: {
        title: dish.title || "",
        foodsText: dish.foodsText || "",
        kcal: String(dish.kcal || 0),
        protein: String(dish.protein || 0),
        carbs: String(dish.carbs || 0),
        fat: String(dish.fat || 0),
        fiber: String(dish.fiber || 0)
      }
    })
  },
  closeVisionEdit() { this.setData({ showVisionEdit: false }) },
  updateVisionEditField(e) { this.setData({ [`visionEditForm.${e.currentTarget.dataset.field}`]: e.detail.value }) },
  saveVisionEdit() {
    const form = this.data.visionEditForm
    const title = String(form.title || "").trim()
    const foodsText = String(form.foodsText || "").trim()
    const nutrition = {
      kcal: Number(form.kcal),
      protein: Number(form.protein),
      carbs: Number(form.carbs),
      fat: Number(form.fat),
      fiber: Number(form.fiber) || 0
    }
    if (!title || !foodsText || String(form.kcal == null ? "" : form.kcal).trim() === "" || !Number.isFinite(nutrition.kcal) || nutrition.kcal < 0 || [nutrition.protein, nutrition.carbs, nutrition.fat, nutrition.fiber].some((value) => value < 0 || !Number.isFinite(value))) {
      wx.showToast({ title: "请完整填写菜名、食材和营养值", icon: "none" })
      return
    }
    const selectedDish = { ...this.data.selectedDish, title, foodsText, ...nutrition }
    const analysis = { ...this.data.analysis, dishName: title, edited: true }
    this.setData({ selectedDish, analysis, showVisionEdit: false, selectedMeasureUnit: "g", serving: 1, customServingGrams: String(dishServingAmount(selectedDish)) }, () => {
      this.calculate(() => this.saveVisionLog({ silent: true }))
    })
    wx.showToast({ title: "已采用修改结果", icon: "success" })
  },
  openCustomFood() {
    this.setData({ showCustomFood: true, customFoodForm: { title: "", grams: "", measureUnit: "g", matched: false, kcal: "", protein: "", carbs: "", fat: "", fiber: "" } })
  },
  closeCustomFood() { this.setData({ showCustomFood: false }) },
  noop() {},
  updateCustomFoodField(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    if (field !== "title") return this.setData({ [`customFoodForm.${field}`]: value })
    const hadCatalogMatch = Boolean(this.data.customFoodForm.matched)
    const match = searchDishes(this.dishCatalog || buildDishCatalog(), value, 1)[0]
    if (!match || !value.trim()) {
      const customFoodForm = { ...this.data.customFoodForm, title: value, matched: false }
      if (hadCatalogMatch) Object.assign(customFoodForm, { grams: "", measureUnit: "g", kcal: "", protein: "", carbs: "", fat: "", fiber: "" })
      return this.setData({ customFoodForm })
    }
    const per100 = dishNutritionPer100(match)
    this.setData({ customFoodForm: { title: value, grams: String(dishServingAmount(match)), measureUnit: dishMeasureUnit(match), matched: true, kcal: String(per100.kcal), protein: String(per100.protein), carbs: String(per100.carbs), fat: String(per100.fat), fiber: String(per100.fiber) } })
  },
  chooseCustomFoodUnit(e) {
    const measureUnit = e.currentTarget.dataset.unit === "ml" ? "ml" : "g"
    if (measureUnit === this.data.customFoodForm.measureUnit) return
    const wasMatched = Boolean(this.data.customFoodForm.matched)
    const next = { ...this.data.customFoodForm, measureUnit, matched: false }
    if (wasMatched) Object.assign(next, { kcal: "", protein: "", carbs: "", fat: "", fiber: "" })
    this.setData({ customFoodForm: next })
    if (wasMatched) wx.showToast({ title: "单位不同，请填写每100单位营养", icon: "none" })
  },
  saveCustomFood() {
    const form = this.data.customFoodForm
    const grams = Number(form.grams)
    const per100 = { kcal: Number(form.kcal), protein: Number(form.protein), carbs: Number(form.carbs), fat: Number(form.fat), fiber: Number(form.fiber) || 0 }
    if (!form.title.trim() || !grams || grams <= 0 || String(form.kcal == null ? "" : form.kcal).trim() === "" || !Number.isFinite(per100.kcal) || per100.kcal < 0 || [per100.protein, per100.carbs, per100.fat].some((value) => value < 0 || !Number.isFinite(value))) {
      wx.showToast({ title: "请完整填写名称、份量和营养值", icon: "none" })
      return
    }
    const factor = grams / 100
    const measureUnit = form.measureUnit === "ml" ? "ml" : "g"
    const selectedDish = { id: `custom-${Date.now()}`, title: form.title.trim(), cuisine: "自定义", slotLabel: "本次记录", foodsText: `${form.title.trim()} ${grams}${measureUnit}`, servingAmount: grams, measureUnit, kcal: Math.round(per100.kcal * factor), protein: round1(per100.protein * factor), carbs: round1(per100.carbs * factor), fat: round1(per100.fat * factor), fiber: round1(per100.fiber * factor) }
    const customFoods = [...(wx.getStorageSync("customFoods") || []), selectedDish].slice(-30)
    wx.setStorageSync("customFoods", customFoods)
    this.replaceVisionResult({ selectedDish, selectedMeasureUnit: measureUnit, searchQuery: selectedDish.title, searchResults: [], hasSearched: true, serving: 1, customServingGrams: String(grams), estimate: null, showCustomFood: false }, () => this.calculate())
    wx.showToast({ title: "已采用自定义营养值", icon: "success" })
  },
  saveVisionLog({ silent = false } = {}) {
    const estimate = this.data.estimate
    const analysis = this.data.analysis
    if (!estimate || !analysis) return
    const commit = (imagePath) => {
      const logs = wx.getStorageSync("dietLogs") || []
      const id = this.data.autoSavedLogId || `${Date.now()}`
      const record = {
        id,
        date: this.data.recordDate || todayKey(),
        slot: this.data.slot,
        source: "vision",
        cuisine: "图片识别",
        imagePath: imagePath || "",
        visionImageFileID: this.data.imageFileID || "",
        confidence: analysis.confidence || "",
        recognitionEdited: Boolean(analysis.edited),
        actualGrams: Number(this.data.customServingGrams) || dishServingAmount(this.data.selectedDish || {}),
        ingredients: (Array.isArray(analysis.ingredients) ? analysis.ingredients : []).map((item) => ({
          name: item.name || "未命名食材",
          grams: round1((Number(item.grams) || 0) * (Number(this.data.serving) || 1)),
          kcal: Math.round((Number(item.kcal) || 0) * (Number(this.data.serving) || 1))
        })),
        nutritionDataVersion: 2,
        ...estimate
      }
      const existingIndex = logs.findIndex((item) => item.id === id)
      if (existingIndex >= 0) logs[existingIndex] = record
      else logs.push(record)
      wx.setStorageSync("dietLogs", logs.slice(-300))
      this.setData({ autoSavedLogId: id, autoSaveStatus: "当前餐食已记录，可去日历删除", savedImagePath: imagePath || this.data.savedImagePath })
      if (!silent) wx.showToast({ title: "识别成功，已自动记录", icon: "success" })
    }
    if (this.data.savedImagePath) return commit(this.data.savedImagePath)
    if (this.data.imagePath && wx.saveFile) {
      wx.saveFile({ tempFilePath: this.data.imagePath, success: (result) => commit(result.savedFilePath), fail: () => commit(this.data.imagePath) })
    } else {
      commit(this.data.imagePath)
    }
  },
  saveLog() {
    const estimate = this.data.estimate
    if (!estimate) {
      wx.showToast({ title: "请先搜索并选择菜品", icon: "none" })
      return
    }
    const commit = (imagePath) => {
      const logs = wx.getStorageSync("dietLogs") || []
      const selectedDish = this.data.selectedDish || {}
      const analysis = this.data.analysis
      const visionFields = analysis ? {
        visionImageFileID: this.data.imageFileID || "",
        confidence: analysis.confidence || "",
        recognitionEdited: Boolean(analysis.edited),
        actualGrams: Number(this.data.customServingGrams) || dishServingAmount(selectedDish),
        ingredients: (Array.isArray(analysis.ingredients) ? analysis.ingredients : []).map((item) => ({ name: item.name || "未命名食材", grams: round1((Number(item.grams) || 0) * (Number(this.data.serving) || 1)), kcal: Math.round((Number(item.kcal) || 0) * (Number(this.data.serving) || 1)) })),
        nutritionDataVersion: 2
      } : {}
      const source = analysis ? "vision" : this.data.recordMode === "manual" ? "manual" : this.data.recordMode === "plan" ? "plan" : "dish-catalog"
      logs.push({ id: `${Date.now()}`, date: this.data.recordDate || todayKey(), slot: this.data.slot, source, cuisine: selectedDish.cuisine || "", imagePath: imagePath || "", catalogImageUrl: analysis ? "" : (selectedDish.cloudImageUrl || selectedDish.imageUrl || ""), amount: analysis ? undefined : (Number(this.data.customServingGrams) || dishServingAmount(selectedDish)), measureUnit: analysis ? undefined : dishMeasureUnit(selectedDish), ...visionFields, ...estimate })
      wx.setStorageSync("dietLogs", logs.slice(-300))
      wx.showToast({ title: "已记录", icon: "success" })
      setTimeout(() => wx.navigateBack(), 500)
    }
    if (this.data.imagePath && wx.saveFile) {
      wx.saveFile({ tempFilePath: this.data.imagePath, success: (result) => commit(result.savedFilePath), fail: () => commit(this.data.imagePath) })
    } else {
      commit(this.data.imagePath)
    }
  },
  goToCalendar() { wx.switchTab({ url: "/pages/history/history" }) },
  goBack() { wx.navigateBack() }
})
