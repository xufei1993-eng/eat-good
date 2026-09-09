const { calculateProfileTargets } = require("./profile-calculator")

// Executable subset of the local v2 nutrition rules. Values remain estimates,
// so profile-specific medical plans always take priority.
const MEAL_RULES = {
  breakfast: { proteinMin: 22, fiberMin: 5, sodiumMax: 600, carbRange: [0.45, 0.58], mission: "高蛋白启动，兼顾稳定能量" },
  lunch: { proteinMin: 28, fiberMin: 5, sodiumMax: 800, carbRange: [0.45, 0.58], mission: "均衡饱腹，支持下午状态" },
  dinner: { proteinMin: 25, fiberMin: 8, sodiumMax: 500, carbRange: [0.35, 0.50], mission: "轻量、足纤维并控制钠" }
}

function selectedAllergens(preferences) {
  return (preferences.allergens || []).filter((item) => item.checked).map((item) => item.label)
}

function isSafe(meal, preferences) {
  const avoided = selectedAllergens(preferences)
  if ((meal.allergens || []).some((allergen) => avoided.indexOf(allergen) >= 0)) return false
  if (preferences.profileMode === "pregnancy" && meal.pregnancySafe === false) return false
  return true
}

function distanceFromRange(value, range) {
  if (value >= range[0] && value <= range[1]) return 0
  return value < range[0] ? range[0] - value : value - range[1]
}

function evaluateMeal(meal, slot, preferences) {
  const rule = MEAL_RULES[slot]
  const proteinRatio = meal.protein * 4 / meal.kcal
  const carbRatio = meal.carbs * 4 / meal.kcal
  let score = 50
  const profileTargets = calculateProfileTargets(preferences)
  if (profileTargets) {
    const distributions = preferences.profileMode === "fatloss"
      ? { breakfast: 0.3, lunch: 0.4, dinner: 0.25 }
      : { breakfast: 0.27, lunch: 0.38, dinner: 0.3 }
    const mealTarget = profileTargets.dailyKcal * distributions[slot]
    const calorieGap = Math.abs(meal.kcal - mealTarget) / mealTarget
    score += Math.max(0, 18 - calorieGap * 40)
  }
  score += Math.min(18, meal.protein / rule.proteinMin * 18)
  score += Math.min(14, meal.fiber / rule.fiberMin * 14)
  score += Math.max(0, 10 - distanceFromRange(carbRatio, rule.carbRange) * 60)
  score += meal.sodium <= rule.sodiumMax ? 8 : Math.max(0, 8 - (meal.sodium - rule.sodiumMax) / 80)

  if (preferences.profileMode === "fatloss") {
    if (meal.protein >= 25) score += 9
    if (meal.fiber >= 8) score += 8
    if (slot === "dinner" && carbRatio <= 0.4) score += 8
  }
  if (preferences.profileMode === "pregnancy") {
    if ((meal.tags || []).indexOf("全熟") >= 0) score += 8
    if ((meal.tags || []).indexOf("深色蔬菜") >= 0) score += 6
    if (preferences.gestationalDiabetes && (meal.tags || []).indexOf("低GI") >= 0) score += 12
    if (preferences.pregnancyHypertension && meal.sodium <= rule.sodiumMax) score += 12
  }
  if (preferences.profileMode === "health" && (meal.tags || []).indexOf("多样化") >= 0) score += 8
  return { score, proteinRatio, carbRatio }
}

function buildReason(meal, slot, preferences, evaluation) {
  const rule = MEAL_RULES[slot]
  const reasons = []
  if (preferences.profileMode === "pregnancy") {
    reasons.push((meal.tags || []).indexOf("全熟") >= 0 ? "按孕期档案优先选择全熟食材" : "按孕期档案避开已知风险食材")
    if (preferences.gestationalDiabetes && (meal.tags || []).indexOf("低GI") >= 0) reasons.push("主食结构更适合控制餐后血糖波动")
    if (preferences.pregnancyHypertension && meal.sodium <= rule.sodiumMax) reasons.push("估算钠含量在本餐控制范围内")
  } else if (preferences.profileMode === "fatloss") {
    reasons.push("蛋白质达到本餐优先目标，有助于提升饱腹感")
    if (meal.fiber >= 8) reasons.push("膳食纤维达到本餐优先目标")
    if (slot === "dinner" && evaluation.carbRatio <= 0.4) reasons.push("晚餐适当降低了碳水供能占比")
  } else {
    reasons.push("蛋白质与膳食纤维搭配更均衡")
    if ((meal.tags || []).indexOf("多样化") >= 0) reasons.push("覆盖主食、蛋白质和蔬菜，食材更丰富")
  }
  if (!reasons.length) reasons.push(rule.mission)
  return reasons.slice(0, 2).join("；")
}

function chooseMeal(candidates, slot, preferences, date, usedIds = []) {
  const safe = candidates.filter((meal) => isSafe(meal, preferences) && usedIds.indexOf(meal.id) < 0)
  const fallback = candidates.filter((meal) => isSafe(meal, preferences))
  const safeCuisineVariants = preferences.tasteFocus ? safe.filter((meal) => meal.cuisineVariant && (meal.tastes || []).indexOf(preferences.tasteFocus) >= 0) : []
  const safeCuisineMeals = preferences.tasteFocus ? safe.filter((meal) => (meal.tastes || []).indexOf(preferences.tasteFocus) >= 0) : []
  const pool = safeCuisineVariants.length ? safeCuisineVariants : (safeCuisineMeals.length ? safeCuisineMeals : (safe.length ? safe : fallback))
  const dayOffset = Math.floor(date.getTime() / 86400000)
  const ranked = pool.map((meal) => {
    const evaluation = evaluateMeal(meal, slot, preferences)
    return { meal, evaluation }
  }).sort((a, b) => b.evaluation.score - a.evaluation.score)
  const bestScore = ranked[0].evaluation.score
  // A selected cuisine is an explicit user constraint. Keep every safe dish in
  // that cuisine rotatable instead of collapsing the list to one top score.
  const eligible = preferences.tasteFocus ? ranked : ranked.filter((item) => item.evaluation.score >= bestScore - 12)
  const tasteOffset = preferences.tasteFocus ? Array.from(preferences.tasteFocus).reduce((sum, char) => sum + char.charCodeAt(0), 0) : 0
  const rotationOffset = Number(preferences.rotationOffset) || 0
  const selected = eligible[(dayOffset + tasteOffset + rotationOffset) % eligible.length]
  const tasteReason = preferences.tasteFocus && (selected.meal.tastes || []).indexOf(preferences.tasteFocus) >= 0 ? `已按“${preferences.tasteFocus}”菜系偏好调整推荐` : ""
  const recommendationReason = [buildReason(selected.meal, slot, preferences, selected.evaluation), tasteReason].filter(Boolean).join("；")
  return { ...selected.meal, recommendationReason, ruleScore: Math.round(selected.evaluation.score) }
}

module.exports = { MEAL_RULES, chooseMeal, evaluateMeal, isSafe }
