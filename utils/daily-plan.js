const { chooseMeal } = require("./nutrition-engine")
const { calculateProfileTargets } = require("./profile-calculator")
const { localCuisineMeals } = require("./local-meal-generator")
const PLAN_LIBRARY = require("../data/base-meals")

function scaledValue(value, factor) { return Math.round(value * factor * 10) / 10 }

function cachedCloudMeals(slot) {
  if (typeof wx === "undefined" || !wx.getStorageSync) return []
  const dishes = wx.getStorageSync("cloudCatalog:dish")
  if (!Array.isArray(dishes)) return []
  return dishes.filter((dish) => dish && dish.slot === slot && Number(dish.kcal) > 0).map((dish) => ({
    id: `cloud-${dish.id}`,
    title: dish.title,
    foods: String(dish.foodsText || dish.title).split(" · ").filter(Boolean),
    kcal: Number(dish.kcal) || 0,
    protein: Number(dish.protein) || 0,
    carbs: Number(dish.carbs) || 0,
    fat: Number(dish.fat) || 0,
    fiber: Number(dish.fiber) || 0,
    sodium: Number(dish.nutrition && dish.nutrition.sodium) || 0,
    allergens: Array.isArray(dish.allergens) ? dish.allergens : [],
    tags: Array.isArray(dish.tags) ? dish.tags : [],
    tastes: dish.cuisine ? [dish.cuisine] : [],
    cuisine: dish.cuisine || "",
    imageUrl: dish.imageUrl || "",
    cloudImageUrl: dish.cloudImageUrl || "",
    nutritionSource: "cloud"
  }))
}

function mealsForTaste(meals, tasteFocus, slot, date, rotationOffset = 0) {
  if (meals.some((meal) => meal.nutritionSource === "cloud")) {
    const tasteMatches = tasteFocus ? meals.filter((meal) => (meal.tastes || []).includes(tasteFocus)) : []
    return tasteMatches.length ? tasteMatches : meals
  }
  if (!tasteFocus) return meals
  const generated = localCuisineMeals(tasteFocus, slot, meals[0])
  return generated.length ? generated : meals
}

function scaleMeal(meal, targetKcal) {
  if (!targetKcal) return { ...meal, portionFactor: 1, foodsText: meal.foods.join(" · ") }
  const rawFactor = targetKcal / meal.kcal
  const portionFactor = Math.round(Math.max(0.8, Math.min(1.6, rawFactor)) * 10) / 10
  const portionText = portionFactor === 1 ? "" : ` · 建议整体约 ${portionFactor} 份`
  return {
    ...meal,
    portionFactor,
    targetKcal: Math.round(targetKcal),
    foodsText: meal.foods.join(" · ") + portionText,
    kcal: Math.round(meal.kcal * portionFactor),
    protein: scaledValue(meal.protein, portionFactor),
    carbs: scaledValue(meal.carbs, portionFactor),
    fat: scaledValue(meal.fat, portionFactor),
    fiber: scaledValue(meal.fiber, portionFactor),
    recommendationReason: meal.recommendationReason + (portionFactor === 1 ? "" : `；份量已按档案目标调整为约 ${portionFactor} 份`)
  }
}

function buildDailyPlan(preferences = {}, date = new Date()) {
  const selectedCuisine = Array.isArray(preferences.tastes)
    ? preferences.tastes.find((item) => item && item.checked && item.label)
    : null
  const tasteFocus = preferences.tasteFocus || (selectedCuisine && selectedCuisine.label) || "家常菜"
  const profileTargets = calculateProfileTargets(preferences)
  const distributions = preferences.profileMode === "fatloss"
    ? { breakfast: 0.3, lunch: 0.4, dinner: 0.25 }
    : { breakfast: 0.27, lunch: 0.38, dinner: 0.3 }
  const rotationOffsets = preferences.rotationOffsets || {}
  const breakfastLibrary = cachedCloudMeals("breakfast")
  const lunchLibrary = cachedCloudMeals("lunch")
  const dinnerLibrary = cachedCloudMeals("dinner")
  const baseMeals = [
    { slot: "breakfast", label: "早餐", time: "08:00", ...chooseMeal(mealsForTaste(breakfastLibrary.length ? breakfastLibrary : PLAN_LIBRARY.breakfast, tasteFocus, "breakfast", date, rotationOffsets.breakfast), "breakfast", { ...preferences, tasteFocus, rotationOffset: rotationOffsets.breakfast }, date) },
    { slot: "lunch", label: "午餐", time: "12:00", ...chooseMeal(mealsForTaste(lunchLibrary.length ? lunchLibrary : PLAN_LIBRARY.lunch, tasteFocus, "lunch", date, rotationOffsets.lunch), "lunch", { ...preferences, tasteFocus, rotationOffset: rotationOffsets.lunch }, date) },
    { slot: "dinner", label: "晚餐", time: "18:30", ...chooseMeal(mealsForTaste(dinnerLibrary.length ? dinnerLibrary : PLAN_LIBRARY.dinner, tasteFocus, "dinner", date, rotationOffsets.dinner), "dinner", { ...preferences, tasteFocus, rotationOffset: rotationOffsets.dinner }, date) }
  ]
  const meals = baseMeals.map((meal) => scaleMeal(meal, profileTargets && profileTargets.dailyKcal * distributions[meal.slot]))
  const mealTotals = meals.reduce((sum, meal) => ({
    kcal: sum.kcal + meal.kcal,
    protein: sum.protein + meal.protein,
    carbs: sum.carbs + meal.carbs,
    fat: sum.fat + meal.fat,
    fiber: sum.fiber + meal.fiber
  }), { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 })
  const targets = profileTargets ? { ...mealTotals, kcal: profileTargets.dailyKcal, protein: profileTargets.protein, fiber: profileTargets.fiber } : mealTotals
  return { meals, targets, profileTargets, mealTotals }
}

function todayKey(date = new Date()) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-")
}

module.exports = { PLAN_LIBRARY, buildDailyPlan, todayKey }
