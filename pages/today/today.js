const { buildDailyPlan, todayKey } = require("../../utils/daily-plan")
const { buildMacroGuide } = require("../../utils/macro-guide")
const { buildRecipe } = require("../../utils/recipe-guide")
const { getMealEmoji, getCuisineEmoji } = require("../../utils/meal-emoji")
const { buildDishCatalog, searchDishes, dishServingAmount, dishMeasureUnit } = require("../../utils/dish-catalog")
const { loadCloudCatalog, searchCloudCatalog } = require("../../utils/cloud-catalog")
const { defaultProfileAvatar } = require("../../utils/profile-avatar")
const { compressForUpload } = require("../../utils/image-helper")
const { uiVariant } = require("../../config/index")
const CUISINES = ["家常菜", "川菜", "粤菜", "江浙菜", "西北菜", "东北菜", "日韩料理", "轻食", "烧烤", "粉面", "海鲜"]

function normalizePreferences(saved) {
  const preferences = saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {}
  const savedTastes = Array.isArray(preferences.tastes) ? preferences.tastes.filter(Boolean) : []
  const hasValidCuisine = savedTastes.some((item) => item.checked && CUISINES.indexOf(item.label) >= 0)
  const tastes = hasValidCuisine
    ? CUISINES.map((label) => {
      const savedItem = savedTastes.find((item) => item.label === label)
      return { label, checked: Boolean(savedItem && savedItem.checked) }
    })
    : CUISINES.map((label) => ({ label, checked: label === "家常菜" }))
  return {
    ...preferences,
    profileMode: preferences.profileMode || "health",
    tastes,
    allergens: Array.isArray(preferences.allergens) ? preferences.allergens.filter(Boolean) : []
  }
}

function normalizeLogs(saved) {
  return Array.isArray(saved) ? saved.filter((item) => item && typeof item === "object").map((item) => ({ ...item, kcal: Math.round(Number(item.kcal) || 0), protein: Math.round((Number(item.protein) || 0) * 10) / 10, carbs: Math.round((Number(item.carbs) || 0) * 10) / 10, fat: Math.round((Number(item.fat) || 0) * 10) / 10, fiber: Math.round((Number(item.fiber) || 0) * 10) / 10 })) : []
}

function round1(value) { return Math.round((Number(value) || 0) * 10) / 10 }

function scaleVisionDetails(dish, factor) {
  return {
    ingredients: (dish.ingredients || []).map((item) => ({ ...item, grams: round1((Number(item.grams) || 0) * factor), kcal: Math.round((Number(item.kcal) || 0) * factor) })),
    nutritionDetails: (dish.nutritionDetails || []).map((item) => {
      const value = item.value === null || item.value === undefined ? null : round1(Number(item.value) * factor)
      return { ...item, value, displayText: value === null ? "--" : `${value}${item.unit || ""}` }
    })
  }
}

function sheetVisionRecord(page, estimate, imagePath) {
  return {
    source: "vision",
    cuisine: "图片识别",
    imagePath: imagePath || "",
    visionImageFileID: page.data.sheetPhotoFileID || "",
    confidence: estimate.confidence || "",
    recognitionEdited: Boolean(estimate.recognitionEdited),
    nutritionDataVersion: 2,
    actualGrams: Number(page.data.sheetCustomGrams) || estimate.servingGrams || 0,
    ingredients: estimate.ingredients || [],
    title: estimate.title,
    unit: estimate.unit,
    kcal: estimate.kcal,
    protein: estimate.protein,
    carbs: estimate.carbs,
    fat: estimate.fat,
    fiber: estimate.fiber,
    nutritionDetails: estimate.nutritionDetails || [],
    adviceTitle: estimate.adviceTitle || "本餐建议",
    advice: estimate.advice || ""
  }
}

function formatRecordDate(value) {
  const parts = String(value || "").split("-")
  return parts.length === 3 ? `${Number(parts[1])}月${Number(parts[2])}日` : "选择日期"
}

function buildMacroProgress(consumed, targets) {
  return ["protein", "carbs", "fat"].reduce((result, key) => {
    const target = Number(targets[key]) || 0
    result[key] = target ? Math.min(100, Math.round((Number(consumed[key]) || 0) / target * 100)) : 0
    return result
  }, {})
}

function buildEnergyRingStyle(percent, isOverTarget) {
  const value = Math.max(0, Math.min(100, Number(percent) || 0))
  const arcValue = Math.round(value * 0.5 * 10) / 10
  const accent = isOverTarget ? "#d95f49" : "#2e8f88"
  return `background: conic-gradient(from 270deg, ${accent} 0%, ${accent} ${arcValue}%, #dfece1 ${arcValue}%, #dfece1 100%);`
}

const SHEET_NUTRIENTS = [
  { key: "fiber", label: "膳食纤维", unit: "g" }, { key: "sugar", label: "糖", unit: "g" },
  { key: "saturatedFat", label: "饱和脂肪", unit: "g" }, { key: "transFat", label: "反式脂肪", unit: "g" },
  { key: "sodium", label: "钠", unit: "mg" }, { key: "potassium", label: "钾", unit: "mg" },
  { key: "calcium", label: "钙", unit: "mg" }, { key: "iron", label: "铁", unit: "mg" },
  { key: "vitaminD", label: "维生素 D", unit: "μg" }, { key: "vitaminB6", label: "维生素 B6", unit: "mg" },
  { key: "vitaminB12", label: "维生素 B12", unit: "μg" }, { key: "cholesterol", label: "胆固醇", unit: "mg" }
]

function buildRecoveryPlan(profileMode) {
  const targets = profileMode === "pregnancy"
    ? { kcal: 1900, protein: 75, carbs: 238, fat: 59, fiber: 25 }
    : profileMode === "fatloss"
      ? { kcal: 1500, protein: 90, carbs: 169, fat: 52, fiber: 25 }
      : { kcal: 1700, protein: 75, carbs: 213, fat: 53, fiber: 25 }
  const meals = [
    { id: "recovery-breakfast", slot: "breakfast", label: "早餐", time: "08:00", title: "鸡蛋燕麦早餐", foods: ["燕麦 40g", "全熟鸡蛋 2个", "无糖牛奶 250ml"], kcal: 480, protein: 28, carbs: 52, fat: 17, fiber: 7, recommendationReason: "优先补充蛋白质和全谷物，帮助稳定上午能量" },
    { id: "recovery-lunch", slot: "lunch", label: "午餐", time: "12:00", title: "糙米鸡肉蔬菜碗", foods: ["糙米饭 150g", "全熟鸡胸肉 120g", "时蔬 250g"], kcal: 620, protein: 42, carbs: 72, fat: 16, fiber: 10, recommendationReason: "主食、优质蛋白质和蔬菜搭配完整，饱腹感更稳定" },
    { id: "recovery-dinner", slot: "dinner", label: "晚餐", time: "18:30", title: "豆腐鱼肉蔬菜餐", foods: ["低汞鱼 100g", "北豆腐 120g", "绿叶蔬菜 250g"], kcal: 500, protein: 38, carbs: 42, fat: 19, fiber: 9, recommendationReason: "晚餐控制份量，同时保留蛋白质和膳食纤维" }
  ]
  return { targets, meals, profileTargets: null, mealTotals: targets }
}

function buildMealFriendInsight(preferences, logs, allLogs, selectedTastes, plan, consumed, activeMeal) {
  const targets = plan.targets || {}
  const proteinGap = Math.max(0, Math.round(((Number(targets.protein) || 0) - (Number(consumed.protein) || 0)) * 10) / 10)
  const carbTarget = Number(targets.carbs) || Math.round((Number(targets.kcal) || 0) * 0.5 / 4)
  const carbPercent = carbTarget ? Math.round((Number(consumed.carbs) || 0) / carbTarget * 100) : 0
  const nextMeal = (activeMeal && !activeMeal.recorded ? activeMeal : null) || (plan.meals || []).find((meal) => !logs.some((item) => item.mealId === meal.id)) || activeMeal
  const nextLabel = nextMeal ? nextMeal.label : "下一餐"
  const nextTitle = nextMeal ? `“${nextMeal.title}”` : "一份均衡餐"
  const base = { context: "结合今天的记录", tone: "gap", badge: "今日建议" }

  if (preferences.profileMode === "pregnancy" && preferences.gestationalDiabetes) {
    return { ...base, tone: "care", badge: "孕期提醒", title: "下一餐，把主食和蛋白质搭着吃", message: `${nextLabel}${nextTitle}已经搭配了主食、蛋白质和蔬菜。按计划份量进食，并继续遵循医生给出的血糖监测方案。`, action: `下一步：完成${nextLabel}后记录实际份量` }
  }
  if (preferences.profileMode === "pregnancy" && preferences.pregnancyHypertension) {
    return { ...base, tone: "care", badge: "孕期提醒", title: "这一餐，清淡和全熟更重要", message: `${nextLabel}${nextTitle}优先使用新鲜、全熟食材。少用加工肉和额外酱料，具体限盐要求以医生方案为准。`, action: `下一步：记录${nextLabel}，留意实际调味` }
  }
  if (!logs.length) {
    const opening = preferences.profileMode === "pregnancy" ? "今天先从全熟、均衡的一餐开始。" : preferences.profileMode === "fatloss" ? "今天先把第一餐如实记录，不需要刻意少报。" : "今天先记录第一餐，后面的建议会跟着实际摄入调整。"
    return { ...base, tone: "start", badge: "开始今天", title: "先吃好一顿，再决定下一顿", message: `${opening}${nextLabel}${nextTitle}已经按当前档案配好份量。`, action: `下一步：吃完后记录这份${nextLabel}` }
  }
  if (logs.length >= 3) {
    return { ...base, tone: "positive", badge: "做得不错", title: "今天三餐都记录下来了", message: `蛋白质完成 ${Math.min(100, Math.round((Number(consumed.protein) || 0) / (Number(targets.protein) || 1) * 100))}%，饮食节奏已经很清楚。持续记录实际份量，明天的建议会更贴合。`, action: "下一步：回顾今天，补充没有记下的零食或饮品" }
  }
  if (proteinGap >= 10) {
    const mealProtein = nextMeal ? Number(nextMeal.protein) || 0 : 0
    const profileNote = preferences.profileMode === "pregnancy" ? "孕期优先选择全熟蛋、全熟瘦肉、豆制品或低汞鱼。" : "可以从鸡蛋、瘦肉、鱼虾、奶和豆制品中搭配。"
    return { ...base, badge: preferences.profileMode === "pregnancy" ? "孕期营养" : "营养缺口", title: `今天蛋白质还差 ${proteinGap}g`, message: `${nextLabel}${nextTitle}约含 ${mealProtein}g 蛋白质。${profileNote}`, action: `下一步：先完成${nextLabel}的蛋白质食材` }
  }
  if (carbPercent >= 85) {
    return { ...base, tone: "balance", badge: "份量提醒", title: `今天碳水已完成 ${carbPercent}%`, message: `${nextLabel}按推荐份量吃即可，优先保留蔬菜和蛋白质，不需要用跳餐来补偿。`, action: `下一步：主食按餐盘建议份量取用` }
  }
  const weekStart = new Date()
  weekStart.setDate(weekStart.getDate() - 6)
  const weeklyLogs = allLogs.filter((item) => item.date >= todayKey(weekStart) && item.date <= todayKey())
  const cuisineCounts = weeklyLogs.reduce((counts, item) => {
    if (item.cuisine) counts[item.cuisine] = (counts[item.cuisine] || 0) + 1
    return counts
  }, {})
  const repeatedCuisine = Object.keys(cuisineCounts).sort((a, b) => cuisineCounts[b] - cuisineCounts[a])[0]
  const alternative = selectedTastes.find((taste) => taste !== repeatedCuisine)
  if (repeatedCuisine && cuisineCounts[repeatedCuisine] >= 3 && alternative) {
    return { ...base, tone: "rotation", badge: "本周轮换", title: `这周${repeatedCuisine}已经吃了 ${cuisineCounts[repeatedCuisine]} 次`, message: `下一餐可以换成${alternative}，在不改变营养目标的前提下增加口味和食材变化。`, action: `下一步：点选“${alternative}”查看新推荐` }
  }
  return { ...base, tone: "positive", badge: "节奏不错", title: "今天的记录正在变完整", message: `已经记录 ${logs.length} 餐，继续按实际份量记录，饭友会根据剩余目标调整下一条建议。`, action: `下一步：完成并记录${nextLabel}` }
}

function profileAvatar(preferences) {
  if (preferences.avatarUrl) return preferences.avatarUrl
  return defaultProfileAvatar(preferences.profileMode, preferences.gender)
}

Page({
  data: { headerInset: 0, uiVariant: ["forest", "dark", "paper", "tracker"].includes(uiVariant) ? uiVariant : "forest", dateText: "", greeting: "你好", profileLabel: "日常健康", profileMark: "健", profileAvatarUrl: "", targetTitle: "吃得均衡，也吃得刚刚好", targetSubtitle: "三餐有节奏，营养不过量", targetMacros: {}, macroProgress: { protein: 0, carbs: 0, fat: 0 }, energyRingStyle: buildEnergyRingStyle(0, false), activeMacro: "protein", macroGuide: null, showMacroDetails: false, macroRotation: { protein: 0, carbs: 0, fat: 0 }, mealFriend: null, selectedTastes: [], selectedTasteItems: [], cuisineOptions: [], selectedCuisineCount: 0, showCuisineManager: false, showRecipe: false, showRecordSheet: false, showSheetVisionEdit: false, sheetRecordDate: "", sheetRecordDateMax: "", sheetRecordDateLabel: "", sheetSaveStatus: "", sheetMode: "search", sheetQuery: "", sheetResults: [], sheetTag: "全部", sheetSelectedDish: null, sheetSearchEstimate: null, sheetSearchGrams: "", sheetSearchUnit: "g", sheetAnalyzing: false, sheetError: "", sheetPhotoPath: "", sheetPhotoFileID: "", sheetVisionDish: null, sheetVisionEstimate: null, sheetVisionLogId: "", sheetNutrientsExpanded: false, sheetManualDetailsExpanded: false, sheetServing: 1, sheetCustomGrams: "", sheetManual: { title: "", grams: "", measureUnit: "g", matched: false, kcal: "", protein: "", carbs: "", fat: "" }, recipe: null, activeTaste: "", remainingKcal: 0, energyBalanceText: "余 0 千卡", isOverTarget: false, activeSlot: "breakfast", activeMeal: null, rotationOffsets: { breakfast: 0, lunch: 0, dinner: 0 }, plan: { meals: [], targets: { kcal: 0, protein: 0, fiber: 0 } }, logs: [], consumed: {}, progress: { kcal: 0, protein: 0, fiber: 0 } },
  onLoad(options = {}) {
    const now = new Date()
    const menu = wx.getMenuButtonBoundingClientRect()
    const hour = now.getHours()
    const requestedVariant = ["forest", "dark", "paper", "tracker"].includes(options.variant) ? options.variant : this.data.uiVariant
    this.setData({ uiVariant: requestedVariant, headerInset: menu.top, dateText: `${now.getMonth() + 1}月${now.getDate()}日`, greeting: hour < 11 ? "早上好" : hour < 14 ? "中午好" : hour < 18 ? "下午好" : "晚上好", activeSlot: hour < 10 ? "breakfast" : hour < 16 ? "lunch" : "dinner" })
  },
  onShow() {
    const tabBar = typeof this.getTabBar === "function" ? this.getTabBar() : null
    if (tabBar) tabBar.showForPage(0)
    this.refresh(this.data.activeTaste)
    loadCloudCatalog("dish").then((items) => {
      if (items.length) this.refresh(this.data.activeTaste)
    })
  },
  onShareAppMessage() {
    return {
      title: "吃对饭 · 今日健康餐单",
      path: "/pages/today/today"
    }
  },
  getPreferences() { return normalizePreferences(wx.getStorageSync("preferences")) },
  refresh(tasteFocus = "") {
    try {
      this.refreshContent(tasteFocus)
    } catch (error) {
      console.error("首页数据刷新失败", error)
      const preferences = this.getPreferences()
      const cuisineOptions = CUISINES.map((label) => ({ label, emoji: getCuisineEmoji(label), checked: preferences.tastes.some((item) => item && item.label === label && item.checked) }))
      const selectedTastes = cuisineOptions.filter((item) => item.checked).map((item) => item.label)
      const selectedTasteItems = selectedTastes.map((label) => ({ label, emoji: getCuisineEmoji(label) }))
      const activeTaste = selectedTastes.indexOf(tasteFocus) >= 0 ? tasteFocus : (selectedTastes[0] || "")
      const plan = buildRecoveryPlan(preferences.profileMode)
      const meals = plan.meals.map((meal) => ({
        ...meal,
        recorded: false,
        foodCount: Array.isArray(meal.foods) ? meal.foods.length : 0,
        foodsText: meal.foods.join(" · "),
        visualEmoji: getMealEmoji(meal),
        recipe: buildRecipe(meal),
        visualMark: { breakfast: "早", lunch: "午", dinner: "晚" }[meal.slot],
        recordLabel: `+ 记录这份${meal.label}`
      }))
      const targetMacros = { protein: plan.targets.protein, carbs: Math.round(plan.targets.kcal * 0.5 / 4), fat: Math.round(plan.targets.kcal * 0.28 / 9) }
      const activeMacro = this.data.activeMacro || "protein"
      this.setData({
        profileLabel: preferences.profileMode === "pregnancy" ? "孕期模式" : preferences.profileMode === "fatloss" ? "减脂模式" : "日常健康",
        profileMark: preferences.profileMode === "pregnancy" ? "孕" : preferences.profileMode === "fatloss" ? "减" : "健",
        profileAvatarUrl: profileAvatar(preferences),
        targetTitle: preferences.profileMode === "pregnancy" ? "安全优先，也要吃得丰富" : preferences.profileMode === "fatloss" ? "吃饱，也吃得刚刚好" : "规律吃饭，就是今天的目标",
        targetSubtitle: "食材多样、三餐均衡，减少重复选择",
        targetMacros,
        macroProgress: { protein: 0, carbs: 0, fat: 0 },
        energyRingStyle: buildEnergyRingStyle(0, false),
        activeMacro,
        macroGuide: buildMacroGuide(activeMacro, targetMacros, preferences, (this.data.macroRotation || {})[activeMacro] || 0),
        selectedTastes,
        selectedTasteItems,
        cuisineOptions,
        selectedCuisineCount: selectedTastes.length,
        activeTaste,
        remainingKcal: plan.targets.kcal,
        energyBalanceText: `余 ${plan.targets.kcal} 千卡`,
        isOverTarget: false,
        plan: { ...plan, meals },
        activeMeal: meals.find((meal) => meal.slot === this.data.activeSlot) || meals[0] || null,
        logs: [],
        consumed: { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
        progress: { kcal: 0, protein: 0, fiber: 0 },
        mealFriend: buildMealFriendInsight(preferences, [], [], selectedTastes, plan, { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }, meals.find((meal) => meal.slot === this.data.activeSlot) || meals[0] || null)
      })
    }
  },
  refreshContent(tasteFocus = "") {
    const preferences = this.getPreferences()
    const cuisineOptions = CUISINES.map((label) => ({ label, emoji: getCuisineEmoji(label), checked: preferences.tastes.some((item) => item && item.label === label && item.checked) }))
    const selectedTastes = cuisineOptions.filter((item) => item.checked).map((item) => item.label)
    const selectedTasteItems = selectedTastes.map((label) => ({ label, emoji: getCuisineEmoji(label) }))
    const activeTaste = selectedTastes.indexOf(tasteFocus) >= 0 ? tasteFocus : (selectedTastes[0] || "")
    const rotationOffsets = this.data.rotationOffsets || { breakfast: 0, lunch: 0, dinner: 0 }
    const plan = buildDailyPlan({ ...preferences, tasteFocus: activeTaste, rotationOffsets })
    const allLogs = normalizeLogs(wx.getStorageSync("dietLogs"))
    const logs = allLogs.filter((item) => item.date === todayKey())
    const meals = plan.meals.map((meal) => {
      const recorded = logs.some((item) => item.source === "plan" && item.mealId === meal.id)
      return { ...meal, recorded, foodCount: meal.foods.length, visualEmoji: getMealEmoji(meal), recipe: buildRecipe(meal), visualMark: { breakfast: "早", lunch: "午", dinner: "晚" }[meal.slot], recordLabel: recorded ? `✓ 已记录这份${meal.label}` : `+ 记录这份${meal.label}` }
    })
    const planWithState = { ...plan, meals }
    const consumed = logs.reduce((sum, item) => {
      ;["kcal", "protein", "carbs", "fat", "fiber"].forEach((key) => { sum[key] += Number(item[key]) || 0 })
      return sum
    }, { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 })
    ;["kcal", "protein", "carbs", "fat", "fiber"].forEach((key) => { consumed[key] = key === "kcal" ? Math.round(consumed[key]) : round1(consumed[key]) })
    const progress = {}
    ;["kcal", "protein", "fiber"].forEach((key) => { progress[key] = Math.min(100, Math.round(consumed[key] / plan.targets[key] * 100)) })
    const isOverTarget = consumed.kcal > plan.targets.kcal
    const calorieDifference = Math.round(Math.abs(plan.targets.kcal - consumed.kcal))
    const energyBalanceText = isOverTarget ? `超出 ${calorieDifference} 千卡` : `余 ${calorieDifference} 千卡`
    const modeCopies = {
      pregnancy: { label: "孕期模式", mark: "孕", title: "安全优先，也要吃得丰富", subtitle: `当前为孕${["", "早", "中", "晚"][preferences.trimester] || "中"}期，三餐优先全熟与均衡搭配` },
      fatloss: { label: "减脂模式", mark: "减", title: "吃饱，也吃得刚刚好", subtitle: "优先蛋白质和膳食纤维，保持稳定节奏" },
      health: { label: "日常健康", mark: "健", title: "规律吃饭，就是今天的目标", subtitle: "食材多样、三餐均衡，减少重复选择" }
    }
    const modeCopy = modeCopies[preferences.profileMode] || modeCopies.health
    const targetMacros = { protein: plan.targets.protein, carbs: Math.round(plan.targets.kcal * 0.5 / 4), fat: Math.round(plan.targets.kcal * 0.28 / 9) }
    const macroProgress = buildMacroProgress(consumed, targetMacros)
    const activeMeal = meals.find((meal) => meal.slot === this.data.activeSlot) || meals[0] || null
    const macroRotation = this.data.macroRotation || { protein: 0, carbs: 0, fat: 0 }
    const macroGuide = this.data.activeMacro ? buildMacroGuide(this.data.activeMacro, targetMacros, preferences, macroRotation[this.data.activeMacro]) : null
    const mealFriend = buildMealFriendInsight(preferences, logs, allLogs, selectedTastes, planWithState, consumed, activeMeal)
    this.setData({ profileLabel: modeCopy.label, profileMark: modeCopy.mark, profileAvatarUrl: profileAvatar(preferences), targetTitle: modeCopy.title, targetSubtitle: modeCopy.subtitle, targetMacros, macroProgress, energyRingStyle: buildEnergyRingStyle(progress.kcal, isOverTarget), macroGuide, mealFriend, selectedTastes, selectedTasteItems, cuisineOptions, selectedCuisineCount: selectedTastes.length, activeTaste, remainingKcal: Math.round(plan.targets.kcal - consumed.kcal), energyBalanceText, isOverTarget, plan: planWithState, activeMeal, logs, consumed, progress })
  },
  chooseMacro(e) {
    const macro = e.currentTarget.dataset.macro
    const macroGuide = buildMacroGuide(macro, this.data.targetMacros, this.getPreferences(), this.data.macroRotation[macro] || 0)
    this.setData({ activeMacro: macro, macroGuide })
  },
  toggleMacroDetails() { this.setData({ showMacroDetails: !this.data.showMacroDetails }) },
  swapMacroGuide() {
    const activeMacro = this.data.activeMacro
    if (!activeMacro) return
    const macroRotation = { ...this.data.macroRotation, [activeMacro]: (this.data.macroRotation[activeMacro] || 0) + 1 }
    const macroGuide = buildMacroGuide(activeMacro, this.data.targetMacros, this.getPreferences(), macroRotation[activeMacro])
    this.setData({ macroRotation, macroGuide })
  },
  chooseTaste(e) { this.refresh(e.currentTarget.dataset.taste) },
  chooseMealSlot(e) {
    const activeSlot = e.currentTarget.dataset.slot
    const activeMeal = this.data.plan.meals.find((meal) => meal.slot === activeSlot) || null
    this.setData({ activeSlot, activeMeal })
  },
  openRecipe() {
    if (!this.data.activeMeal) return
    const recipe = this.data.activeMeal.recipe || buildRecipe(this.data.activeMeal)
    if (!recipe.available) {
      wx.showToast({ title: "这道菜的菜谱尚未收录", icon: "none" })
      return
    }
    this.setData({ recipe, showRecipe: true })
  },
  closeRecipe() { this.setData({ showRecipe: false }) },
  swapActiveMeal() {
    const activeSlot = this.data.activeSlot
    const rotationOffsets = { ...this.data.rotationOffsets, [activeSlot]: (this.data.rotationOffsets[activeSlot] || 0) + 1 }
    this.setData({ rotationOffsets }, () => this.refresh(this.data.activeTaste))
  },
  openCuisineManager() { this.setData({ showCuisineManager: true }) },
  closeCuisineManager() { this.setData({ showCuisineManager: false }) },
  noop() {},
  toggleCuisine(e) {
    const index = Number(e.currentTarget.dataset.index)
    const option = this.data.cuisineOptions[index]
    if (!option) return
    const selectedCount = this.data.cuisineOptions.filter((item) => item.checked).length
    if (!option.checked && selectedCount >= 10) {
      wx.showToast({ title: "最多选择 10 种菜系", icon: "none" })
      return
    }
    const tastes = this.data.cuisineOptions.map((item, itemIndex) => itemIndex === index ? { ...item, checked: !item.checked } : item)
    this.setData({ cuisineOptions: tastes, selectedCuisineCount: selectedCount + (option.checked ? -1 : 1) })
  },
  saveCuisinePreferences() {
    const hasSelectedCuisine = this.data.cuisineOptions.some((item) => item.checked)
    const tastes = hasSelectedCuisine
      ? this.data.cuisineOptions
      : this.data.cuisineOptions.map((item) => ({ ...item, checked: item.label === "家常菜" }))
    const selected = tastes.filter((item) => item.checked)
    wx.setStorageSync("preferences", { ...this.getPreferences(), tastes })
    const activeTaste = selected.some((item) => item.label === this.data.activeTaste) ? this.data.activeTaste : selected[0].label
    this.setData({ showCuisineManager: false, cuisineOptions: tastes, selectedCuisineCount: selected.length }, () => this.refresh(activeTaste))
    wx.showToast({ title: hasSelectedCuisine ? "菜系偏好已更新" : "已默认选择家常菜", icon: "success" })
  },
  recordMeal(e) {
    const slot = e.currentTarget.dataset.slot
    const meal = this.data.plan.meals.find((item) => item.slot === slot)
    if (!meal || meal.recorded) {
      wx.showToast({ title: meal ? "这餐已经记录" : "没有找到餐单", icon: "none" })
      return
    }
    const allLogs = normalizeLogs(wx.getStorageSync("dietLogs"))
    allLogs.push({ id: `${Date.now()}`, date: todayKey(), slot: meal.slot, source: "plan", mealId: meal.id, cuisine: this.data.activeTaste || "", title: meal.title, unit: meal.foodsText, catalogImageUrl: meal.cloudImageUrl || meal.imageUrl || "", kcal: meal.kcal, protein: meal.protein, carbs: meal.carbs, fat: meal.fat, fiber: meal.fiber })
    wx.setStorageSync("dietLogs", allLogs.slice(-300))
    this.refresh(this.data.activeTaste)
    wx.showToast({ title: "已记入今天", icon: "success" })
  },
  editTodayLog(e) {
    const id = String(e.currentTarget.dataset.id || "")
    if (!id) return
    const app = getApp()
    app.globalData.pendingHistoryEdit = { date: todayKey(), id }
    wx.switchTab({ url: "/pages/history/history" })
  },
  deleteTodayLog(e) { const id = String(e.currentTarget.dataset.id || ""); wx.showModal({ title: "删除这条记录？", content: "删除后今日营养汇总也会同步更新。", confirmText: "删除", success: (r) => { if (!r.confirm) return; wx.setStorageSync("dietLogs", normalizeLogs(wx.getStorageSync("dietLogs")).filter((item) => String(item.id) !== id)); this.refresh(this.data.activeTaste); wx.showToast({ title: "已删除", icon: "success" }) } }) },
  openRecordSheet() {
    const tabBar = typeof this.getTabBar === "function" ? this.getTabBar() : null
    if (tabBar) tabBar.hideForOverlay()
    this.sheetCatalog = buildDishCatalog()
    this.sheetManualMatchedDish = null
    const recent = normalizeLogs(wx.getStorageSync("dietLogs")).slice(-20).reverse()
    const recentTitles = []
    recent.forEach((item) => { if (item.title && recentTitles.indexOf(item.title) < 0) recentTitles.push(item.title) })
    const recentDishes = recentTitles.map((title) => this.sheetCatalog.find((dish) => dish.title === title)).filter(Boolean)
    const defaults = [...recentDishes, ...this.sheetCatalog].filter((dish, index, list) => list.findIndex((item) => item.id === dish.id) === index).slice(0, 20)
    const recordDate = todayKey()
    this.setData({ showRecordSheet: true, showSheetVisionEdit: false, sheetRecordDate: recordDate, sheetRecordDateMax: recordDate, sheetRecordDateLabel: formatRecordDate(recordDate), sheetSaveStatus: "", sheetMode: "photo", sheetQuery: "", sheetTag: "全部", sheetResults: defaults, sheetSelectedDish: null, sheetSearchEstimate: null, sheetSearchGrams: "", sheetSearchUnit: "g", sheetError: "", sheetAnalyzing: false, sheetPhotoPath: "", sheetPhotoFileID: "", sheetVisionDish: null, sheetVisionEstimate: null, sheetVisionLogId: "", sheetNutrientsExpanded: false, sheetServing: 1, sheetManual: { title: "", grams: "", measureUnit: "g", matched: false, kcal: "", protein: "", carbs: "", fat: "" } }, () => this.syncSheetCloudCatalog())
  },
  syncSheetCloudCatalog() {
    const localCatalog = buildDishCatalog()
    return Promise.all([loadCloudCatalog("dish"), loadCloudCatalog("food")]).then(([dishes, foods]) => {
      const cloudCatalog = [...dishes, ...foods]
      if (!cloudCatalog.length) return
      const seen = new Set()
      this.sheetCatalog = [...cloudCatalog, ...localCatalog].filter((item) => {
        const key = String(item.title || item.id || "").trim().toLowerCase()
        if (!key || seen.has(key)) return false
        seen.add(key)
        return true
      })
      if (!this.data.showRecordSheet) return
      const query = String(this.data.sheetQuery || "")
      this.setData({ sheetResults: query.trim() ? searchDishes(this.sheetCatalog, query, 20) : this.sheetCatalog.slice(0, 20) })
    })
  },
  changeSheetRecordDate(e) {
    const sheetRecordDate = e.detail.value
    this.setData({ sheetRecordDate, sheetRecordDateLabel: formatRecordDate(sheetRecordDate), sheetSaveStatus: this.data.sheetVisionLogId ? "记录日期已保存" : "" })
    const id = this.data.sheetVisionLogId
    if (!id) return
    const logs = normalizeLogs(wx.getStorageSync("dietLogs")); const index = logs.findIndex((item) => item.id === id)
    if (index >= 0) { logs[index] = { ...logs[index], date: sheetRecordDate }; wx.setStorageSync("dietLogs", logs.slice(-300)); this.refresh(this.data.activeTaste); wx.showToast({ title: "记录日期已更新", icon: "success" }) }
  },
  closeRecordSheet() {
    this.setData({ showRecordSheet: false })
    const tabBar = typeof this.getTabBar === "function" ? this.getTabBar() : null
    if (tabBar) tabBar.showForPage(0)
  },
  chooseRecordMode(e) {
    const mode = String(e.currentTarget.dataset.mode || "")
    if (["photo", "search", "manual"].indexOf(mode) < 0) return
    this.setData({ sheetMode: mode, sheetError: "" })
  },
  updateSheetSearch(e) {
    const sheetQuery = e.detail.value
    const catalog = this.sheetCatalog || buildDishCatalog()
    this.setData({ sheetQuery, sheetLoading: true, sheetResults: searchDishes(catalog, sheetQuery, 8) })
    clearTimeout(this.sheetSearchTimer)
    this.sheetSearchTimer = setTimeout(() => this.searchSheetCloud(sheetQuery, this.data.sheetTag), 250)
  },
  chooseSheetTag(e) {
    const sheetTag = e.currentTarget.dataset.tag || "全部"
    const fallback = sheetTag === "全部" ? (this.sheetCatalog || buildDishCatalog()).slice(0, 20) : []
    this.setData({ sheetTag, sheetQuery: "", sheetLoading: true, sheetResults: fallback })
    this.searchSheetCloud("", sheetTag)
  },
  searchSheetCloud(keyword, tag) {
    const requestId = (this.sheetSearchRequestId || 0) + 1
    this.sheetSearchRequestId = requestId
    return Promise.all([
      searchCloudCatalog("dish", { keyword, cuisine: tag === "自助餐" || tag === "全部" ? "" : tag, tag: tag === "自助餐" ? tag : "", pageSize: tag === "全部" ? 20 : 30 }),
      tag === "自助餐" || (!keyword && tag === "全部") ? Promise.resolve({ items: [] }) : searchCloudCatalog("food", { keyword, pageSize: 15 })
    ]).then(([dishes, foods]) => {
      if (requestId !== this.sheetSearchRequestId) return
      const localCatalog = this.sheetCatalog || buildDishCatalog()
      const local = (keyword ? searchDishes(localCatalog, keyword, 20) : localCatalog).filter((item) => !tag || tag === "全部" || item.cuisine === tag)
      const items = [...dishes.items, ...foods.items, ...local].filter((item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index).slice(0, tag === "全部" ? 20 : 30)
      this.setData({ sheetResults: items, sheetLoading: false })
    })
  },
  clearSheetSearch() {
    const catalog = this.sheetCatalog || buildDishCatalog()
    this.setData({ sheetQuery: "", sheetTag: "全部", sheetLoading: true, sheetResults: catalog.slice(0, 20) })
    this.searchSheetCloud("", "全部")
  },
  saveSheetDish(e) {
    const catalog = this.sheetCatalog || buildDishCatalog()
    const dish = catalog.find((item) => item.id === e.currentTarget.dataset.id) || this.data.sheetResults.find((item) => item.id === e.currentTarget.dataset.id)
    if (!dish) return
    const amount = dishServingAmount(dish)
    this.setData({ sheetSelectedDish: dish, sheetSearchEstimate: dish, sheetSearchGrams: String(amount), sheetSearchUnit: dishMeasureUnit(dish) })
  },
  clearSheetSelectedDish() { this.setData({ sheetSelectedDish: null, sheetSearchEstimate: null, sheetSearchGrams: "", sheetSearchUnit: "g" }) },
  updateSheetSearchGrams(e) {
    const grams = e.detail.value
    const dish = this.data.sheetSelectedDish
    if (!dish || !Number(grams) || Number(grams) <= 0) return this.setData({ sheetSearchGrams: grams })
    const factor = Number(grams) / dishServingAmount(dish)
    const round = (value) => Math.round(Number(value || 0) * factor * 10) / 10
    this.setData({ sheetSearchGrams: grams, sheetSearchEstimate: { ...dish, kcal: Math.round(dish.kcal * factor), protein: round(dish.protein), carbs: round(dish.carbs), fat: round(dish.fat), fiber: round(dish.fiber) } })
  },
  confirmSheetDish() {
    const dish = this.data.sheetSelectedDish
    const estimate = this.data.sheetSearchEstimate
    const amount = Number(this.data.sheetSearchGrams)
    const measureUnit = this.data.sheetSearchUnit || dishMeasureUnit(dish)
    if (!dish || !estimate || !amount || amount <= 0) return wx.showToast({ title: "请输入实际食用量", icon: "none" })
    this.commitSheetLog({ source: "dish-catalog", cuisine: dish.cuisine || "", title: dish.title, amount, measureUnit, unit: `${dish.title} ${amount}${measureUnit}`, catalogImageUrl: dish.cloudImageUrl || dish.imageUrl || "", kcal: estimate.kcal, protein: estimate.protein, carbs: estimate.carbs, fat: estimate.fat, fiber: estimate.fiber })
  },
  updateSheetManual(e) {
    this.setData({ [`sheetManual.${e.currentTarget.dataset.field}`]: e.detail.value })
  },
  updateSheetManualTitle(e) {
    const title = e.detail.value
    const catalog = this.sheetCatalog || buildDishCatalog()
    const match = searchDishes(catalog, title, 1)[0]
    const hadCatalogMatch = Boolean(this.sheetManualMatchedDish)
    this.sheetManualMatchedDish = match && title.trim() ? match : null
    if (!this.sheetManualMatchedDish) {
      const sheetManual = { ...this.data.sheetManual, title, matched: false }
      if (hadCatalogMatch) Object.assign(sheetManual, { grams: "", measureUnit: "g", kcal: "", protein: "", carbs: "", fat: "" })
      return this.setData({ sheetManual })
    }
    const amount = dishServingAmount(match)
    const measureUnit = dishMeasureUnit(match)
    this.setData({ sheetManual: { title, grams: String(amount), measureUnit, matched: true, kcal: String(Math.round(Number(match.kcal) || 0)), protein: String(round1(match.protein)), carbs: String(round1(match.carbs)), fat: String(round1(match.fat)) } })
  },
  updateSheetManualGrams(e) {
    const grams = e.detail.value
    if (!this.sheetManualMatchedDish || !Number(grams)) return this.setData({ "sheetManual.grams": grams })
    const factor = Number(grams) / dishServingAmount(this.sheetManualMatchedDish)
    this.setData({ "sheetManual.grams": grams, "sheetManual.kcal": String(Math.round(Number(this.sheetManualMatchedDish.kcal || 0) * factor)), "sheetManual.protein": String(round1(this.sheetManualMatchedDish.protein * factor)), "sheetManual.carbs": String(round1(this.sheetManualMatchedDish.carbs * factor)), "sheetManual.fat": String(round1(this.sheetManualMatchedDish.fat * factor)) })
  },
  chooseSheetManualUnit(e) {
    const measureUnit = e.currentTarget.dataset.unit === "ml" ? "ml" : "g"
    const matchedUnit = this.sheetManualMatchedDish ? dishMeasureUnit(this.sheetManualMatchedDish) : measureUnit
    if (this.sheetManualMatchedDish && matchedUnit !== measureUnit) {
      this.sheetManualMatchedDish = null
      this.setData({ sheetManual: { ...this.data.sheetManual, measureUnit, matched: false, kcal: "", protein: "", carbs: "", fat: "" } })
      wx.showToast({ title: "单位不同，请填写本次总营养", icon: "none" })
      return
    }
    this.setData({ "sheetManual.measureUnit": measureUnit })
  },
  editSheetVision() {
    const dish = this.data.sheetVisionEstimate
    if (!dish) return
    this.setData({ showSheetVisionEdit: true, sheetManual: { title: dish.title || "", kcal: String(dish.kcal || ""), protein: String(dish.protein || ""), carbs: String(dish.carbs || ""), fat: String(dish.fat || "") } })
  },
  closeSheetVisionEdit() { this.setData({ showSheetVisionEdit: false }) },
  toggleSheetNutrients() { this.setData({ sheetNutrientsExpanded: !this.data.sheetNutrientsExpanded }) },
  toggleSheetManualDetails() { this.setData({ sheetManualDetailsExpanded: !this.data.sheetManualDetailsExpanded }) },
  saveSheetManual() {
    const form = this.data.sheetManual
    const title = String(form.title || "").trim()
    const values = [form.kcal, form.protein || 0, form.carbs || 0, form.fat || 0].map(Number)
    if (!title || String(form.kcal == null ? "" : form.kcal).trim() === "" || values.some((value) => !Number.isFinite(value) || value < 0)) {
      wx.showToast({ title: "请完整填写名称和营养值", icon: "none" })
      return
    }
    if (this.data.showSheetVisionEdit && this.data.sheetVisionLogId) {
      const logs = normalizeLogs(wx.getStorageSync("dietLogs")); const index = logs.findIndex((item) => item.id === this.data.sheetVisionLogId)
      if (index >= 0) logs[index] = { ...logs[index], title, kcal: values[0], protein: values[1], carbs: values[2], fat: values[3], fiber: 0, edited: true }
      wx.setStorageSync("dietLogs", logs.slice(-300)); this.setData({ showSheetVisionEdit: false, sheetVisionEstimate: { ...this.data.sheetVisionEstimate, title, kcal: values[0], protein: values[1], carbs: values[2], fat: values[3], fiber: 0 } }); this.refresh(this.data.activeTaste); wx.showToast({ title: "已更新记录", icon: "success" }); return
    }
    const amount = Number(form.grams)
    const measureUnit = form.measureUnit === "ml" ? "ml" : "g"
    if (!amount || amount <= 0) return wx.showToast({ title: "请填写实际食用量", icon: "none" })
    this.commitSheetLog({ source: "manual", cuisine: "手工录入", title, amount, measureUnit, unit: `${title} ${amount}${measureUnit}`, kcal: values[0], protein: values[1], carbs: values[2], fat: values[3], fiber: 0 })
  },
  async chooseSheetPhoto() {
    if (this.data.sheetAnalyzing || this.checkingPhotoQuota) return
    this.checkingPhotoQuota = true
    const allowed = await require("../../utils/photo-quota").canTakePhoto()
    this.checkingPhotoQuota = false
    if (!allowed) return
    try {
      const res = await new Promise((resolve, reject) => {
        wx.chooseMedia({ count: 1, mediaType: ["image"], sourceType: ["camera", "album"], success: resolve, fail: reject })
      })
      const rawPath = res.tempFiles[0].tempFilePath
      const filePath = await compressForUpload(rawPath)
      this.setData({ sheetPhotoPath: filePath, sheetAnalyzing: true, sheetError: "", sheetVisionDish: null, sheetVisionEstimate: null, sheetServing: 1 })
      const cloudPath = `meal-images/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
      const upload = await wx.cloud.uploadFile({ cloudPath, filePath })
      const response = await wx.cloud.callFunction({ name: "analyzeMealImage", data: { fileID: upload.fileID, profile: this.getPreferences() } })
      const result = response.result || {}
      if (!result.ok || !result.analysis) throw new Error(result.message || "暂时无法识别这张图片")
      const analysis = result.analysis
      console.log('[吃对饭][首页拍照] AI识别输出:', analysis)
      analysis.score = Math.max(0, Math.min(100, Number(analysis.score) || 0))
      analysis.scoreTitle = String(analysis.scoreTitle || "营养点评").slice(0, 4)
      const ingredients = Array.isArray(analysis.ingredients) ? analysis.ingredients : []
      const nutrients = analysis.nutrients || {}
      const nutritionDetails = SHEET_NUTRIENTS.map((item) => { const raw = nutrients[item.key]; const value = raw && typeof raw === "object" ? raw.value : raw; const numericValue = value == null || value === "" ? null : Number(value); return { ...item, value: Number.isFinite(numericValue) ? numericValue : null, displayText: Number.isFinite(numericValue) ? `${numericValue}${item.unit}` : "--" } }).filter((item) => item.displayText !== "--" || item.key === "fiber")
      const servingGrams = Math.round(ingredients.reduce((sum, item) => sum + (Number(item.grams) || 0), 0)) || 100
      const normalizedIngredients = ingredients.map((item) => ({ name: item.name || "未命名食材", grams: Number(item.grams) || 0, kcal: Number(item.kcal) || 0 }))
      const dish = { confidence: analysis.confidence || "", recognitionEdited: false, title: analysis.dishName || "图片中的餐食", unit: ingredients.map((item) => `${item.name} ${item.grams || ""}g`).join(" · ") || "主要食材待确认", servingGrams, ingredients: normalizedIngredients, kcal: Number(analysis.kcal) || ingredients.reduce((sum, item) => sum + (Number(item.kcal) || 0), 0), protein: Number(analysis.protein) || 0, carbs: Number(analysis.carbs) || 0, fat: Number(analysis.fat) || 0, fiber: Number(analysis.fiber) || 0, nutritionDetails, adviceTitle: analysis.adviceTitle || "本餐建议", advice: analysis.advice || "把这餐放进全天结构中看，后续餐次可补足蔬菜、全谷物或优质蛋白。" }
      dish.score = analysis.score
      dish.scoreTitle = analysis.scoreTitle
      this.setData({ sheetPhotoFileID: upload.fileID, sheetAnalyzing: false, sheetVisionDish: dish, sheetVisionEstimate: dish, sheetCustomGrams: String(servingGrams) })
      const autoSave = (imagePath) => { const current = this.data.sheetVisionEstimate || dish; this.commitSheetLog(sheetVisionRecord(this, current, imagePath), { keepOpen: true }) }
      if (wx.saveFile) wx.saveFile({ tempFilePath: filePath, success: (saved) => autoSave(saved.savedFilePath), fail: () => autoSave(filePath) })
      else autoSave(filePath)
    } catch (error) {
      this.setData({ sheetAnalyzing: false, sheetError: (error && error.message) || "识别失败，请改用搜索或手工录入" })
    }
  },
  chooseSheetPortion(e) {
    const sheetServing = Number(e.currentTarget.dataset.value) || 1
    const dish = this.data.sheetVisionDish
    if (!dish) return
    const round = (value) => Math.round(Number(value || 0) * sheetServing * 10) / 10
    this.setData({ sheetServing, sheetCustomGrams: String(Math.round(dish.servingGrams * sheetServing)), sheetVisionEstimate: { ...dish, ...scaleVisionDetails(dish, sheetServing), kcal: Math.round(dish.kcal * sheetServing), protein: round(dish.protein), carbs: round(dish.carbs), fat: round(dish.fat), fiber: round(dish.fiber) } }, () => this.updateSheetVisionLog())
  },
  updateSheetCustomGrams(e) {
    const grams = e.detail.value
    const dish = this.data.sheetVisionDish
    if (!dish || !Number(grams) || Number(grams) <= 0) return this.setData({ sheetCustomGrams: grams })
    const factor = Number(grams) / dish.servingGrams
    const round = (value) => Math.round(Number(value || 0) * factor * 10) / 10
    this.setData({ sheetCustomGrams: grams, sheetServing: factor, sheetVisionEstimate: { ...dish, ...scaleVisionDetails(dish, factor), kcal: Math.round(dish.kcal * factor), protein: round(dish.protein), carbs: round(dish.carbs), fat: round(dish.fat), fiber: round(dish.fiber) } }, () => this.updateSheetVisionLog())
  },
  saveSheetPhoto() {
    const estimate = this.data.sheetVisionEstimate
    if (!estimate) return
    const commit = (imagePath) => this.commitSheetLog(sheetVisionRecord(this, estimate, imagePath))
    if (wx.saveFile && this.data.sheetPhotoPath) wx.saveFile({ tempFilePath: this.data.sheetPhotoPath, success: (saved) => commit(saved.savedFilePath), fail: () => commit(this.data.sheetPhotoPath) })
    else commit(this.data.sheetPhotoPath)
  },
  updateSheetVisionLog() {
    const estimate = this.data.sheetVisionEstimate
    const id = this.data.sheetVisionLogId
    if (!estimate || !id) return
    const logs = normalizeLogs(wx.getStorageSync("dietLogs")); const index = logs.findIndex((item) => item.id === id)
    if (index < 0) return
    logs[index] = { ...logs[index], ...sheetVisionRecord(this, estimate, logs[index].imagePath) }
    wx.setStorageSync("dietLogs", logs.slice(-300)); this.setData({ sheetSaveStatus: "更改已保存" }); this.refresh(this.data.activeTaste)
  },
  commitSheetLog(record, { keepOpen = false } = {}) {
    const logs = normalizeLogs(wx.getStorageSync("dietLogs"))
    const existingId = record.source === "vision" ? this.data.sheetVisionLogId : ""
    const id = existingId || `${Date.now()}`
    const nextRecord = { id, date: this.data.sheetRecordDate || todayKey(), slot: this.data.activeSlot || "snack", ...record }
    const existingIndex = logs.findIndex((item) => item.id === id)
    if (existingIndex >= 0) logs[existingIndex] = nextRecord
    else logs.push(nextRecord)
    wx.setStorageSync("dietLogs", logs.slice(-300))
    this.setData({ sheetAnalyzing: false, sheetSaveStatus: record.source === "vision" ? "已自动保存" : "已保存", sheetVisionLogId: record.source === "vision" ? id : this.data.sheetVisionLogId, sheetManual: { title: "", grams: "", measureUnit: "g", matched: false, kcal: "", protein: "", carbs: "", fat: "" } })
    this.refresh(this.data.activeTaste)
    const selectedDate = this.data.sheetRecordDate || todayKey()
    wx.showToast({ title: selectedDate === todayKey() ? "已记入今天" : `已记入${formatRecordDate(selectedDate)}`, icon: "success" })
    if (!keepOpen) this.closeRecordSheet()
  },
  openProfile() { wx.switchTab({ url: "/pages/preferences/preferences" }) },
  openHistory() { wx.switchTab({ url: "/pages/history/history" }) }
})
