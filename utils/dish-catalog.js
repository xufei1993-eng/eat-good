const recipes = require("../data/cuisine-recipes")

const SLOT_LABELS = { breakfast: "早餐", lunch: "午餐", dinner: "晚餐" }

// Generic dishes are deliberately separated from recipes with meat, eggs or
// seafood. They provide a conservative baseline when the user enters only a
// staple name, so “凉面” is never silently treated as “鸡丝凉面”.
const GENERIC_DISHES = [
  { title: "青椒", foodsText: "青椒 100g", servingGrams: 100, kcal: 22, protein: 1, carbs: 5.4, fat: 0.2, fiber: 1.4 },
  { title: "青菜", foodsText: "熟青菜 100g · 不含额外用油", servingGrams: 100, kcal: 18, protein: 1.5, carbs: 3.2, fat: 0.3, fiber: 1.8 },
  { title: "绿豆芽", foodsText: "熟绿豆芽 100g · 不含额外用油", servingGrams: 100, kcal: 18, protein: 2.1, carbs: 2.9, fat: 0.1, fiber: 1.2 },
  { title: "空心菜", foodsText: "熟空心菜 100g · 不含额外用油", servingGrams: 100, kcal: 20, protein: 2.2, carbs: 3.1, fat: 0.3, fiber: 1.9 },
  { title: "西兰花", foodsText: "熟西兰花 100g · 不含额外用油", servingGrams: 100, kcal: 34, protein: 2.8, carbs: 6.6, fat: 0.4, fiber: 2.6 },
  { title: "菠菜", foodsText: "熟菠菜 100g · 不含额外用油", servingGrams: 100, kcal: 23, protein: 2.9, carbs: 3.6, fat: 0.4, fiber: 2.2 },
  { title: "生菜", foodsText: "生菜 100g · 不含沙拉酱", servingGrams: 100, kcal: 15, protein: 1.4, carbs: 2.9, fat: 0.2, fiber: 1.3 },
  { title: "黄瓜", foodsText: "黄瓜 100g", servingGrams: 100, kcal: 16, protein: 0.8, carbs: 3.6, fat: 0.1, fiber: 0.5 },
  { title: "番茄", foodsText: "番茄 100g", servingGrams: 100, kcal: 18, protein: 0.9, carbs: 3.9, fat: 0.2, fiber: 1.2 },
  { title: "凉面", foodsText: "熟面条 200g · 黄瓜丝 80g · 基础调味 · 不含肉类配料", kcal: 320, protein: 9.2, carbs: 56, fat: 6.5, fiber: 3.5 },
  { title: "汤面", foodsText: "熟面条 200g · 清汤 250ml · 青菜 100g · 不含肉蛋配料", kcal: 270, protein: 9, carbs: 52, fat: 2.5, fiber: 3.2 },
  { title: "米粉", foodsText: "熟米粉 200g · 清汤 250ml · 青菜 100g · 不含肉蛋配料", kcal: 245, protein: 4.2, carbs: 53, fat: 1.4, fiber: 2.3 },
  { title: "白粥", foodsText: "大米粥 300g · 不含额外配料", kcal: 138, protein: 3.3, carbs: 30, fat: 0.6, fiber: 0.5 },
  { title: "米饭", foodsText: "熟米饭 150g", kcal: 174, protein: 3.9, carbs: 38.4, fat: 0.5, fiber: 0.5 },
  { title: "炒饭", foodsText: "熟米饭 200g · 时蔬 80g · 烹调油 8g · 不含肉蛋配料", kcal: 345, protein: 6, carbs: 58, fat: 9, fiber: 2.8 },
  { title: "沙拉", foodsText: "混合生菜 200g · 黄瓜番茄 100g · 油醋汁 15ml · 不含肉蛋配料", kcal: 125, protein: 3, carbs: 10, fat: 8, fiber: 4.5 },
  { title: "燕麦碗", foodsText: "燕麦 40g · 无糖牛奶 200ml · 低糖水果 100g · 不含坚果配料", kcal: 285, protein: 12, carbs: 43, fat: 7, fiber: 6.5 },
  { title: "饮用水", foodsText: "饮用水 300ml", servingAmount: 300, measureUnit: "ml", kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  { title: "水", foodsText: "饮用水 300ml", servingAmount: 300, measureUnit: "ml", kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  { title: "美式咖啡", foodsText: "黑咖啡 300ml · 不加糖奶", servingAmount: 300, measureUnit: "ml", kcal: 5, protein: 0.3, carbs: 0, fat: 0, fiber: 0 },
  { title: "拿铁", foodsText: "浓缩咖啡 30ml · 低脂牛奶 250ml · 不加糖", servingAmount: 280, measureUnit: "ml", kcal: 110, protein: 8.5, carbs: 12, fat: 3.5, fiber: 0 },
  { title: "咖啡", foodsText: "黑咖啡 300ml · 不加糖奶", servingAmount: 300, measureUnit: "ml", kcal: 5, protein: 0.3, carbs: 0, fat: 0, fiber: 0 },
  { title: "馒头", foodsText: "普通馒头 100g", kcal: 223, protein: 7, carbs: 47, fat: 1.1, fiber: 1.3 },
  { title: "豆浆", foodsText: "无糖豆浆 300ml", servingAmount: 300, measureUnit: "ml", kcal: 93, protein: 9, carbs: 4.5, fat: 4.8, fiber: 1.8 }
]

function numberFrom(value, fallback = 0) {
  const parsed = Number.parseFloat(String(value == null ? "" : value).replace(/g/gi, ""))
  return Number.isFinite(parsed) ? parsed : fallback
}

function estimateCarbs(slot, protein, fat) {
  const baseline = { breakfast: 48, lunch: 65, dinner: 52 }[slot] || 52
  return Math.max(20, Math.round((baseline - Math.max(0, protein - 25) * 0.25 - Math.max(0, fat - 12) * 0.2) * 10) / 10)
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/[\s·，、（）()]/g, "")
}

function dishServingGrams(dish = {}) {
  if (Number(dish.servingGrams) > 0) return Number(dish.servingGrams)
  const matches = String(dish.foodsText || "").match(/(?:\d+(?:\.\d+)?)g/gi) || []
  const total = matches.reduce((sum, value) => sum + numberFrom(value), 0)
  return total > 0 ? Math.round(total) : 100
}

function dishMeasureUnit(dish = {}) {
  const explicit = String(dish.measureUnit || dish.measurementUnit || "").toLowerCase()
  if (explicit === "ml") return "ml"
  if (explicit === "g") return "g"
  const text = String(dish.foodsText || dish.description || "")
  const hasMl = /\d+(?:\.\d+)?\s*ml\b/i.test(text)
  const withoutMl = text.replace(/\d+(?:\.\d+)?\s*ml\b/gi, "")
  return hasMl && !/\d+(?:\.\d+)?\s*g\b/i.test(withoutMl) ? "ml" : "g"
}

function dishServingAmount(dish = {}) {
  if (Number(dish.servingAmount) > 0) return Number(dish.servingAmount)
  const unit = dishMeasureUnit(dish)
  const text = String(dish.foodsText || dish.description || "")
  if (unit === "ml") {
    const matches = text.match(/\d+(?:\.\d+)?\s*ml\b/gi) || []
    const total = matches.reduce((sum, value) => sum + numberFrom(value), 0)
    return total > 0 ? Math.round(total) : 100
  }
  return dishServingGrams(dish)
}

function dishNutritionPer100(dish = {}) {
  const factor = 100 / dishServingAmount(dish)
  const round1 = (value) => Math.round(Number(value || 0) * factor * 10) / 10
  return { kcal: round1(dish.kcal), protein: round1(dish.protein), carbs: round1(dish.carbs), fat: round1(dish.fat), fiber: round1(dish.fiber), measureUnit: dishMeasureUnit(dish) }
}

function buildDishCatalog() {
  const catalog = GENERIC_DISHES.map((dish, index) => ({
    id: `generic-${index}`,
    cuisine: "基础餐食",
    slot: "all",
    slotLabel: "普通做法",
    unit: "标准份",
    fiber: 0,
    ...dish,
    searchText: normalizeText(`${dish.title}${dish.foodsText}基础餐食普通做法`)
  }))
  Object.keys(recipes).forEach((cuisine) => {
    Object.keys(SLOT_LABELS).forEach((slot) => {
      const dishes = recipes[cuisine] && recipes[cuisine][slot]
      ;(dishes || []).forEach((dish, index) => {
        const protein = numberFrom(dish.protein)
        const fat = numberFrom(dish.fat)
        const fiber = numberFrom(dish.fiber)
        const carbs = numberFrom(dish.carbs, estimateCarbs(slot, protein, fat))
        catalog.push({
          id: `dish-${cuisine}-${slot}-${index}`,
          title: dish.name,
          cuisine,
          slot,
          slotLabel: SLOT_LABELS[slot],
          unit: "标准份",
          foodsText: dish.desc,
          kcal: Number(dish.kcal) || Math.round(protein * 4 + carbs * 4 + fat * 9),
          protein,
          carbs,
          fat,
          fiber,
          searchText: normalizeText(`${dish.name}${dish.desc}${cuisine}${SLOT_LABELS[slot]}`)
        })
      })
    })
  })
  return catalog
}

function scoreDish(dish, query) {
  const normalized = normalizeText(query)
  if (!normalized) return 0
  const title = normalizeText(dish.title)
  if (title === normalized) return 100
  if (title.startsWith(normalized)) return 80
  if (title.includes(normalized)) return 65
  if (normalized.length >= 2 && normalized.includes(title)) return 55
  return dish.searchText.includes(normalized) ? 30 : -1
}

const MODIFIERS = [
  { aliases: ["鸡胸肉", "鸡肉", "鸡丝"], label: "鸡胸肉 80g", kcal: 132, protein: 24.8, carbs: 0, fat: 3.2, fiber: 0 },
  { aliases: ["牛肉", "牛肉片"], label: "瘦牛肉 80g", kcal: 136, protein: 20.8, carbs: 0, fat: 5.6, fiber: 0 },
  { aliases: ["虾仁", "虾"], label: "全熟虾仁 80g", kcal: 79, protein: 16.8, carbs: 0.2, fat: 1.2, fiber: 0 },
  { aliases: ["鸡蛋", "蛋"], label: "全熟鸡蛋 1个", kcal: 70, protein: 6, carbs: 1, fat: 5, fiber: 0 },
  { aliases: ["火腿"], label: "火腿 40g", kcal: 64, protein: 8, carbs: 1.2, fat: 3, fiber: 0 },
  { aliases: ["豆腐"], label: "北豆腐 100g", kcal: 110, protein: 12, carbs: 3, fat: 6, fiber: 1 },
  { aliases: ["番茄", "西红柿"], label: "番茄 100g", kcal: 18, protein: 0.9, carbs: 3.9, fat: 0.2, fiber: 1.2 },
  { aliases: ["羽衣甘蓝"], label: "羽衣甘蓝 80g", kcal: 28, protein: 2.3, carbs: 5.6, fat: 0.4, fiber: 2.8 },
  { aliases: ["生菜", "混合生菜"], label: "混合生菜 100g", kcal: 17, protein: 1.2, carbs: 2.5, fat: 0.2, fiber: 1.4 },
  { aliases: ["牛油果", "鳄梨"], label: "牛油果半个 70g", kcal: 112, protein: 1.4, carbs: 6, fat: 10.3, fiber: 4.7 },
  { aliases: ["金枪鱼"], label: "水浸金枪鱼 80g", kcal: 93, protein: 20.4, carbs: 0, fat: 0.8, fiber: 0 },
  { aliases: ["三文鱼"], label: "全熟三文鱼 80g", kcal: 166, protein: 17.6, carbs: 0, fat: 10.4, fiber: 0 },
  { aliases: ["鹰嘴豆"], label: "熟鹰嘴豆 60g", kcal: 98, protein: 5.3, carbs: 16.4, fat: 1.6, fiber: 4.6 },
  { aliases: ["玉米"], label: "熟玉米粒 80g", kcal: 86, protein: 2.7, carbs: 18.4, fat: 1.1, fiber: 2.2 },
  { aliases: ["藜麦"], label: "熟藜麦 100g", kcal: 120, protein: 4.4, carbs: 21.3, fat: 1.9, fiber: 2.8 },
  { aliases: ["酸奶", "无糖酸奶"], label: "无糖酸奶 150g", kcal: 90, protein: 7.5, carbs: 9, fat: 3, fiber: 0 },
  { aliases: ["坚果"], label: "原味坚果 15g", kcal: 90, protein: 3, carbs: 3, fat: 8, fiber: 1.5 },
  { aliases: ["美式咖啡", "美式"], label: "美式咖啡 300ml", kcal: 5, protein: 0.3, carbs: 0, fat: 0, fiber: 0 },
  { aliases: ["拿铁咖啡", "拿铁"], label: "低脂拿铁 250ml", kcal: 110, protein: 8.5, carbs: 12, fat: 3.5, fiber: 0 },
  { aliases: ["咖啡"], label: "黑咖啡 300ml", kcal: 5, protein: 0.3, carbs: 0, fat: 0, fiber: 0 }
]

function composeGenericDish(catalog, query) {
  const normalized = normalizeText(query)
  const bases = catalog
    .filter((dish) => dish.cuisine === "基础餐食" && normalized !== normalizeText(dish.title))
    .sort((a, b) => normalizeText(b.title).length - normalizeText(a.title).length)
  for (const base of bases) {
    const baseTitle = normalizeText(base.title)
    if (!normalized.endsWith(baseTitle)) continue
    let remaining = normalized.slice(0, -baseTitle.length)
    const matched = []
    const candidates = MODIFIERS.slice().sort((a, b) => Math.max(...b.aliases.map((alias) => alias.length)) - Math.max(...a.aliases.map((alias) => alias.length)))
    while (remaining) {
      const modifier = candidates.find((item) => item.aliases.some((alias) => remaining.startsWith(normalizeText(alias))))
      if (!modifier) break
      const alias = modifier.aliases.find((item) => remaining.startsWith(normalizeText(item)))
      remaining = remaining.slice(normalizeText(alias).length)
      matched.push(modifier)
    }
    if (!matched.length || remaining) continue
    const totals = matched.reduce((sum, item) => ({
      kcal: sum.kcal + item.kcal,
      protein: sum.protein + item.protein,
      carbs: sum.carbs + item.carbs,
      fat: sum.fat + item.fat,
      fiber: sum.fiber + item.fiber
    }), { kcal: base.kcal, protein: base.protein, carbs: base.carbs, fat: base.fat, fiber: base.fiber })
    return {
      ...base,
      id: `composed-${normalized}`,
      title: query,
      foodsText: `${base.foodsText.replace(/ · 不含[^·]+/, "")} · ${matched.map((item) => item.label).join(" · ")}`,
      ...totals,
      cuisine: "组合估算",
      slotLabel: "基础做法 + 配料",
      searchText: normalized,
      composed: true
    }
  }
  return null
}

function standaloneModifier(query) {
  const normalized = normalizeText(query)
  const modifier = MODIFIERS.find((item) => item.aliases.some((alias) => normalizeText(alias) === normalized))
  if (!modifier) return null
  return {
    id: `modifier-${normalized}`,
    title: query,
    cuisine: "轻食配料",
    slot: "all",
    slotLabel: "常见份量",
    unit: "标准份",
    foodsText: modifier.label,
    kcal: modifier.kcal,
    protein: modifier.protein,
    carbs: modifier.carbs,
    fat: modifier.fat,
    fiber: modifier.fiber,
    searchText: normalized,
    composed: true
  }
}

function searchDishes(catalog, query, limit = 8) {
  if (!normalizeText(query)) return catalog.slice(0, limit)
  const standaloneCandidate = standaloneModifier(query)
  const composed = standaloneCandidate ? null : composeGenericDish(catalog, query)
  const results = catalog
    .map((dish) => ({ dish, score: scoreDish(dish, query) }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score || a.dish.title.length - b.dish.title.length)
    .slice(0, limit)
    .map((item) => item.dish)
  const standalone = results.some((item) => normalizeText(item.title) === normalizeText(query)) ? null : standaloneCandidate
  const special = composed || standalone
  return special ? [special, ...results.filter((item) => item.id !== special.id)].slice(0, limit) : results
}

module.exports = { buildDishCatalog, searchDishes, dishServingGrams, dishServingAmount, dishMeasureUnit, dishNutritionPer100 }
