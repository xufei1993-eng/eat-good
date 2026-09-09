const MACROS = {
  protein: {
    label: "蛋白质",
    unit: "g",
    intro: "优先把蛋白质分散到三餐，比集中在一餐更容易吃够，也有利于维持饱腹感和肌肉蛋白合成。",
    foods: [
      { name: "熟鸡胸肉", amount: 100, unit: "g", value: 31, allergens: [], note: "高蛋白、脂肪较低" },
      { name: "全熟鸡蛋", amount: 2, unit: "个", value: 12, allergens: ["鸡蛋"], note: "同时提供胆碱" },
      { name: "低汞鱼", amount: 100, unit: "g", value: 22, allergens: ["鱼类"], note: "孕期须完全熟透" },
      { name: "北豆腐", amount: 150, unit: "g", value: 18, allergens: ["大豆"], note: "植物蛋白来源" },
      { name: "纯牛奶", amount: 250, unit: "ml", value: 8, allergens: ["乳制品"], note: "同时补充钙" },
      { name: "熟瘦牛肉", amount: 100, unit: "g", value: 26, allergens: [], note: "同时提供血红素铁" },
      { name: "全熟虾仁", amount: 100, unit: "g", value: 20, allergens: ["甲壳类"], note: "脂肪较低，必须熟透" }
    ]
  },
  carbs: {
    label: "碳水",
    unit: "g",
    intro: "碳水目标应主要来自全谷物、薯类、豆类、水果和奶，而不是用糖或甜饮补足。每餐搭配蛋白质与蔬菜，可减缓餐后血糖波动。",
    foods: [
      { name: "熟糙米饭", amount: 180, unit: "g", value: 54, allergens: [], note: "主食，保留更多膳食纤维" },
      { name: "燕麦", amount: 50, unit: "g", value: 31, allergens: ["小麦/麸质"], note: "适合早餐" },
      { name: "蒸红薯", amount: 200, unit: "g", value: 40, allergens: [], note: "薯类主食，不额外加糖" },
      { name: "杂豆饭", amount: 180, unit: "g", value: 50, allergens: [], note: "兼顾蛋白质与纤维" },
      { name: "低糖水果", amount: 200, unit: "g", value: 24, allergens: [], note: "分次吃，不榨汁" },
      { name: "蒸玉米", amount: 180, unit: "g", value: 34, allergens: [], note: "可替换部分精制主食" },
      { name: "全麦面包", amount: 80, unit: "g", value: 34, allergens: ["小麦/麸质"], note: "留意配料表中的添加糖" }
    ]
  },
  fat: {
    label: "脂肪",
    unit: "g",
    intro: "脂肪不需要完全避免，应优先选择不饱和脂肪，并控制烹调油和坚果份量；少用油炸食品、肥肉和反式脂肪。",
    foods: [
      { name: "烹调植物油", amount: 10, unit: "g", value: 10, allergens: [], note: "约 2 茶匙，计入炒菜用油" },
      { name: "原味坚果", amount: 20, unit: "g", value: 11, allergens: ["坚果"], note: "选择无盐款" },
      { name: "全熟鸡蛋", amount: 2, unit: "个", value: 10, allergens: ["鸡蛋"], note: "脂肪与优质蛋白并存" },
      { name: "熟三文鱼", amount: 100, unit: "g", value: 12, allergens: ["鱼类"], note: "含 n-3 脂肪酸，必须熟透" },
      { name: "牛油果", amount: 100, unit: "g", value: 15, allergens: [], note: "不饱和脂肪来源" },
      { name: "花生酱", amount: 20, unit: "g", value: 10, allergens: ["花生"], note: "选择无糖、低盐款" },
      { name: "亚麻籽", amount: 15, unit: "g", value: 6, allergens: [], note: "磨碎后拌入燕麦或酸奶" }
    ]
  }
}

function selectedAllergens(preferences) {
  return (preferences.allergens || []).filter((item) => item.checked).map((item) => item.label)
}

function roundedAmount(value, unit) {
  if (unit === "个") return Math.max(1, Math.round(value))
  if (unit === "ml") return Math.max(50, Math.round(value / 50) * 50)
  return Math.max(5, Math.round(value / 5) * 5)
}

function buildCombination(foods, target) {
  const baseTotal = foods.reduce((sum, food) => sum + food.value, 0)
  const factor = Math.max(0.75, Math.min(1.8, target / baseTotal))
  const portions = foods.map((food) => {
    const amount = roundedAmount(food.amount * factor, food.unit)
    const value = Math.round(food.value * amount / food.amount)
    return { ...food, amount, value, portion: `${food.name} ${amount}${food.unit}` }
  })
  return { portions, total: portions.reduce((sum, food) => sum + food.value, 0) }
}

function profileNote(macro, preferences) {
  if (preferences.profileMode !== "pregnancy") return "如有肾脏、肝脏或代谢性疾病，应以医生或注册营养师给出的个体方案为准。"
  if (preferences.gestationalDiabetes && macro === "carbs") return "已按妊娠糖尿病风险提示：碳水分配到三餐和加餐，不喝果汁，不单独吃大量精制主食，并结合医生要求监测餐后血糖。"
  if (preferences.pregnancyHypertension && macro === "fat") return "已按妊娠期高血压风险提示：坚果选无盐款，减少加工肉和油炸食品；脂肪目标不等于额外添加同等重量的油。"
  return "孕期推荐使用巴氏杀菌奶、全熟蛋和全熟低汞鱼，避免生食、未熟食物及高汞鱼类。"
}

function buildMacroGuide(macro, targets, preferences = {}, rotationOffset = 0) {
  const config = MACROS[macro] || MACROS.protein
  const target = Math.round(Number(targets[macro]) || 0)
  const avoided = selectedAllergens(preferences)
  const safeFoods = config.foods.filter((food) => !(food.allergens || []).some((item) => avoided.indexOf(item) >= 0))
  const offset = safeFoods.length ? rotationOffset % safeFoods.length : 0
  const rotatedFoods = safeFoods.slice(offset).concat(safeFoods.slice(0, offset))
  const featured = rotatedFoods.slice(0, Math.min(4, rotatedFoods.length))
  const combination = buildCombination(featured, target)
  const perMeal = Math.round(target / 3)
  const sourceNames = featured.map((food) => food.name).join("、")
  const quickAdvice = macro === "protein"
    ? `三餐各安排约 ${perMeal}g，可从${sourceNames}中轮换搭配。`
    : macro === "carbs"
      ? `优先选择${sourceNames}，分到三餐吃，并与蛋白质、蔬菜搭配。`
      : `优先从${sourceNames}获取，全天总量控制在目标附近。`
  const principleText = macro === "protein"
    ? "鱼、禽、蛋、奶和豆制品轮换，不必集中在一餐补足。"
    : macro === "carbs"
      ? "优先全谷物、杂豆和薯类，少用甜饮或甜食补量。"
      : "优先鱼类、坚果和植物油，少选油炸食品与肥肉。"
  return {
    macro,
    label: config.label,
    target,
    intro: config.intro,
    quickAdvice,
    principleText,
    perMealText: macro === "protein" ? `可先按每餐约 ${perMeal}g 安排，再根据当天记录补足。` : macro === "carbs" ? `可将约 80% 分配到三餐，其余来自奶、水果和加餐，避免集中在一餐。` : `这是全天食物中脂肪的总量，不是额外添加 ${target}g 烹调油。`,
    foods: featured.map((food) => ({ ...food, valueText: `约含 ${food.value}g ${config.label}` })),
    combinationText: combination.portions.map((food) => food.portion).join(" + "),
    combinationTotal: combination.total,
    note: profileNote(macro, preferences),
    allergyText: safeFoods.length < config.foods.length ? `已根据档案排除：${avoided.join("、")}` : "已按当前档案筛选食物来源"
  }
}

module.exports = { MACROS, buildMacroGuide }
