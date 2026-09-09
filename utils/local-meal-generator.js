const recipes = require("../data/cuisine-recipes")

function hash(value) {
  return Array.from(String(value)).reduce((sum, char) => ((sum * 31) + char.charCodeAt(0)) >>> 0, 7)
}

function inferAllergens(text) {
  const allergens = []
  if (/蛋/.test(text)) allergens.push("鸡蛋")
  if (/牛奶|酸奶/.test(text)) allergens.push("乳制品")
  if (/豆浆|豆腐|味噌|大酱/.test(text)) allergens.push("大豆")
  if (/鱼|鲑鱼|鲈鱼/.test(text)) allergens.push("鱼类")
  if (/虾/.test(text)) allergens.push("甲壳类")
  if (/面|馄饨|抄手|薄饼|馍|肠粉/.test(text)) allergens.push("小麦/麸质")
  return allergens
}

function numericGram(value, fallback = 0) {
  const parsed = Number.parseFloat(String(value == null ? "" : value).replace(/g/gi, ""))
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeRecipe(recipe) {
  if (Array.isArray(recipe)) return { name: recipe[0], desc: recipe[1] }
  return recipe && typeof recipe === "object" ? recipe : {}
}

function estimateCarbs(slot, protein, fat, fallback) {
  const slotDefaults = { breakfast: 48, lunch: 65, dinner: 52 }
  const fallbackCarbs = Number(fallback && fallback.carbs)
  if (fallbackCarbs > 0) return fallbackCarbs
  const baseline = slotDefaults[slot] || 52
  return Math.max(20, Math.round((baseline - Math.max(0, protein - 25) * 0.25 - Math.max(0, fat - 12) * 0.2) * 10) / 10)
}

function buildCuisineMeal(cuisine, slot, selectedRecipe, fallback) {
  const selected = normalizeRecipe(selectedRecipe)
  const protein = numericGram(selected.protein, Number(fallback.protein) || 0)
  const fat = numericGram(selected.fat, Number(fallback.fat) || 0)
  const fiber = numericGram(selected.fiber, Number(fallback.fiber) || 0)
  const carbs = numericGram(selected.carbs, estimateCarbs(slot, protein, fat, fallback))
  const kcal = Number(selected.kcal) || Math.round(protein * 4 + carbs * 4 + fat * 9)
  const desc = selected.desc || ""
  return {
    ...fallback,
    id: `local-${hash(`${cuisine}-${slot}-${selected.name}`)}`,
    title: selected.name,
    foods: desc.split(" · ").filter(Boolean),
    kcal,
    protein,
    carbs,
    fat,
    fiber,
    allergens: inferAllergens(desc),
    tastes: [cuisine],
    cuisineVariant: true,
    nutritionSource: "recipe"
  }
}

function localCuisineMeals(cuisine, slot, fallback) {
  const candidates = recipes[cuisine] && recipes[cuisine][slot]
  if (!candidates || !candidates.length) return []
  return candidates.map((candidate) => buildCuisineMeal(cuisine, slot, candidate, fallback))
}

function localCuisineMeal(cuisine, slot, date, fallback, rotationOffset = 0) {
  const candidates = localCuisineMeals(cuisine, slot, fallback)
  if (!candidates.length) return null
  const dayKey = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
  return candidates[(hash(`${dayKey}-${cuisine}-${slot}`) + rotationOffset) % candidates.length]
}

module.exports = { localCuisineMeal, localCuisineMeals }
