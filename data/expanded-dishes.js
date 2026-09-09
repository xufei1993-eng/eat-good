const CUISINES = {
  "家常菜": ["家常炒", "清炒", "蒜香", "香煎", "红烧", "炖"],
  "川菜": ["麻辣", "香辣", "水煮", "泡椒", "干锅", "鱼香"],
  "粤菜": ["白灼", "豉汁", "啫啫", "清蒸", "蜜汁", "上汤"],
  "江浙菜": ["葱油", "糟香", "酱烧", "清炖", "糖醋", "油焖"],
  "西北菜": ["孜然", "椒麻", "手抓", "烩", "酱香", "干煸"],
  "东北菜": ["锅包", "酱炖", "酸菜炖", "地三鲜风味", "家常熘", "铁锅炖"],
  "日韩料理": ["照烧", "韩式辣炒", "味噌", "盐烤", "泡菜炒", "寿喜烧风味"],
  "轻食": ["低脂香煎", "油醋拌", "低温烤", "黑椒烤", "藜麦拌", "柠檬香草"],
  "烧烤": ["炭烤", "孜然烤", "蒜香烤", "香辣烤", "蜜汁烤", "椒盐烤"],
  "粉面": ["清汤", "红油", "酸辣", "番茄", "麻酱", "菌菇汤"],
  "海鲜": ["清蒸", "白灼", "蒜蓉", "葱姜炒", "豉汁蒸", "香煎"]
}

const PROTEINS = [
  ["鸡胸肉", 165, 31, 0, 3.6], ["鸡腿肉", 181, 24, 0, 9], ["牛肉", 187, 26, 0, 9],
  ["猪里脊", 155, 29, 0, 3.5], ["瘦肉", 143, 26, 0, 4], ["虾仁", 99, 24, 0.2, 0.3],
  ["鱼片", 128, 22, 0, 4.5], ["鱿鱼", 92, 15.6, 3.1, 1.4], ["豆腐", 110, 12, 3, 6],
  ["鸡蛋", 144, 13, 1.5, 10], ["鸭胸", 190, 24, 0, 10], ["扇贝", 88, 17, 3.2, 0.8]
]

const VEGETABLES = [
  ["西兰花", 34, 2.8, 6.6, 0.4, 2.6], ["青椒", 22, 1, 5.4, 0.2, 1.4], ["芹菜", 16, 0.7, 3, 0.2, 1.6],
  ["番茄", 18, 0.9, 3.9, 0.2, 1.2], ["香菇", 26, 2.2, 5.2, 0.3, 2.5], ["杏鲍菇", 31, 1.3, 6.8, 0.1, 2.1],
  ["木耳", 27, 1.5, 6, 0.2, 2.6], ["荷兰豆", 42, 2.8, 7.5, 0.2, 2.6], ["洋葱", 40, 1.1, 9.3, 0.1, 1.7],
  ["莴笋", 15, 1, 2.8, 0.1, 1.3], ["冬瓜", 12, 0.4, 2.6, 0.2, 1.1], ["南瓜", 26, 1, 6.5, 0.1, 0.5],
  ["土豆", 77, 2, 17.5, 0.1, 2.2], ["茄子", 25, 1, 5.9, 0.2, 3], ["白菜", 16, 1.2, 3.2, 0.2, 1.2],
  ["菜花", 25, 1.9, 5, 0.3, 2], ["黄瓜", 16, 0.8, 3.6, 0.1, 0.5], ["菠菜", 23, 2.9, 3.6, 0.4, 2.2],
  ["秋葵", 33, 1.9, 7.5, 0.2, 3.2], ["莲藕", 74, 2.6, 17.2, 0.1, 4.9], ["四季豆", 31, 1.8, 7, 0.2, 2.7],
  ["娃娃菜", 13, 1.5, 2.4, 0.2, 1], ["豆芽", 30, 3, 5.9, 0.2, 1.8], ["海带", 13, 1.2, 3, 0.1, 0.5]
]

const STAPLES = [
  ["米饭", 116, 2.6, 25.9, 0.3, 0.3], ["杂粮饭", 125, 3.2, 25, 1.2, 2], ["糙米饭", 111, 2.6, 23, 0.9, 1.8],
  ["面条", 138, 4.5, 28, 1, 1.2], ["荞麦面", 136, 5, 27, 1, 2.2], ["米粉", 122, 2, 27, 0.4, 0.8]
]

const round1 = (value) => Math.round(value * 10) / 10

function nutritionFor(protein, vegetable, staple, oilGrams) {
  const proteinGrams = 100
  const vegetableGrams = 120
  const stapleGrams = staple ? 150 : 0
  const factors = [proteinGrams / 100, vegetableGrams / 100, stapleGrams / 100]
  const kcal = protein[1] * factors[0] + vegetable[1] * factors[1] + (staple ? staple[1] * factors[2] : 0) + oilGrams * 9
  return {
    kcal: Math.round(kcal),
    protein: round1(protein[2] * factors[0] + vegetable[2] * factors[1] + (staple ? staple[2] * factors[2] : 0)),
    carbs: round1(protein[3] * factors[0] + vegetable[3] * factors[1] + (staple ? staple[3] * factors[2] : 0)),
    fat: round1(protein[4] * factors[0] + vegetable[4] * factors[1] + (staple ? staple[4] * factors[2] : 0) + oilGrams),
    fiber: round1((vegetable[5] || 0) * factors[1] + (staple ? (staple[5] || 0) * factors[2] : 0)),
    sodium: 550
  }
}

function generateExpandedDishes(existing = [], target = 3000) {
  const result = existing.slice(0, target)
  const names = new Set(result.map((item) => item.name))
  const cuisineEntries = Object.entries(CUISINES)
  let cursor = 0
  while (result.length < target) {
    const cuisineIndex = cursor % cuisineEntries.length
    const [cuisine, methods] = cuisineEntries[cuisineIndex]
    const method = methods[Math.floor(cursor / cuisineEntries.length) % methods.length]
    const protein = PROTEINS[Math.floor(cursor / (cuisineEntries.length * methods.length)) % PROTEINS.length]
    const vegetable = VEGETABLES[Math.floor(cursor / (cuisineEntries.length * methods.length * PROTEINS.length)) % VEGETABLES.length]
    const isMeal = cuisine === "粉面" || cursor % 4 === 0
    const staple = isMeal ? STAPLES[(cursor + cuisineIndex) % STAPLES.length] : null
    const suffix = staple ? (cuisine === "粉面" ? staple[0] : `${staple[0]}套餐`) : ""
    let name = `${method}${vegetable[0]}${protein[0]}${suffix}`
    cursor += 1
    if (names.has(name)) name = `${name}·标准做法${(cursor % 9) + 1}`
    if (names.has(name)) continue
    names.add(name)
    const oilGrams = cuisine === "轻食" ? 5 : /清蒸|白灼|清汤|炖|上汤/.test(method) ? 4 : 9
    const servingAmount = staple ? 370 : 230
    result.push({
      sourceKey: `expanded-v1:${cuisine}:${method}:${protein[0]}:${vegetable[0]}:${staple ? staple[0] : "dish"}`,
      source: "generated-curated",
      name,
      aliases: [`${vegetable[0]}${protein[0]}`, `${protein[0]}${vegetable[0]}`],
      category: staple ? "主食套餐" : "家常菜品",
      cuisine,
      slot: staple ? (cursor % 2 ? "lunch" : "dinner") : "all",
      servingUnit: "标准份",
      servingAmount,
      measureUnit: "g",
      servingGrams: servingAmount,
      description: `${protein[0]} 100g · ${vegetable[0]} 120g${staple ? ` · ${staple[0]} 150g` : ""} · 烹调油约 ${oilGrams}g；营养值为标准化食材估算，实际以做法为准。`,
      tags: [cuisine, "扩展菜品", "营养估算", staple ? "套餐" : "单菜", ...(staple ? ["自助餐"] : [])],
      allergens: protein[0] === "虾仁" || protein[0] === "鱿鱼" || protein[0] === "扇贝" ? ["甲壳类或软体类"] : protein[0] === "鸡蛋" ? ["蛋类"] : protein[0] === "豆腐" ? ["大豆"] : [],
      nutrition: nutritionFor(protein, vegetable, staple, oilGrams),
      nutritionBasis: "template-estimate-v1",
      status: "online"
    })
  }
  return result
}

module.exports = { generateExpandedDishes }
