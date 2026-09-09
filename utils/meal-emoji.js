const CUISINE_EMOJIS = {
  "家常菜": "🍚",
  "川菜": "🌶️",
  "粤菜": "🥟",
  "江浙菜": "🐟",
  "西北菜": "🍜",
  "东北菜": "🥘",
  "日韩料理": "🍱",
  "轻食": "🥗",
  "烧烤": "🍢",
  "粉面": "🍜",
  "海鲜": "🦐"
}

const FOOD_RULES = [
  [/虾|虾仁|海鲜|蟹|扇贝|蛤|鲍/, "🦐"],
  [/鱼|鲈|鲑|鳕|三文鱼|鳝/, "🐟"],
  [/鸡蛋|滑蛋|炒蛋|煎蛋|蛋饼|鸡蛋卷/, "🍳"],
  [/鸡胸|鸡丝|鸡丁|鸡腿|鸡翅|鸡肉|滑鸡|白切鸡|鸡(?!蛋)/, "🍗"],
  [/牛肉|牛腩|黄牛|牛排|牛(?!奶)/, "🥩"],
  [/猪|排骨|肉丝|肉片|瘦肉|肉末|叉烧|腊肉/, "🥩"],
  [/羊|羊肉/, "🍖"],
  [/豆腐|豆浆|豆花|大豆/, "🫘"],
  [/面|米线|米粉|河粉|粉丝|乌冬|馄饨|抄手|汤粉/, "🍜"],
  [/粥|汤|羹|炖|煲/, "🥣"],
  [/饭|糙米|杂粮|煲仔|拌饭/, "🍚"],
  [/包|馍|饼|卷|三明治|吐司|馒头|烧卖|虾饺|蒸饺|肠粉/, "🥟"],
  [/燕麦|五谷|玉米|红薯|南瓜|土豆/, "🌽"],
  [/沙拉|轻食|蔬菜|青菜|生菜|西兰花|菠菜|冬瓜|苦瓜/, "🥗"],
  [/水果|香蕉|苹果|莓|橙/, "🍎"],
  [/牛奶|酸奶|奶昔/, "🥛"],
  [/蘑菇|香菇|菌菇|杏鲍菇|木耳/, "🍄"],
  [/辣|剁椒|水煮|麻婆|宫保|川味|湘味/, "🌶️"]
]

function pushUnique(list, emoji) {
  if (emoji && list.indexOf(emoji) < 0) list.push(emoji)
}

function getMealEmoji(meal = {}) {
  const text = `${meal.title || ""} ${(meal.foods || []).join(" ")}`
  const emojis = []
  FOOD_RULES.forEach(([pattern, emoji]) => {
    if (emojis.length < 3 && pattern.test(text)) pushUnique(emojis, emoji)
  })
  if (!emojis.length) pushUnique(emojis, meal.slot === "breakfast" ? "🥣" : "🍚")
  if (emojis.length === 1) {
    pushUnique(emojis, meal.slot === "breakfast" ? "🍽️" : "🥬")
  }
  return emojis.slice(0, 3).join("")
}

function getCuisineEmoji(cuisine) {
  return CUISINE_EMOJIS[cuisine] || "🍽️"
}

module.exports = { getMealEmoji, getCuisineEmoji, CUISINE_EMOJIS }
