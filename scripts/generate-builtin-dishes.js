const fs = require("fs")
const path = require("path")
const baseMeals = require("../data/base-meals")
const { buildDishCatalog, dishServingAmount, dishMeasureUnit } = require("../utils/dish-catalog")
const { generateExpandedDishes } = require("../data/expanded-dishes")

function nutrition(item) {
  return {
    kcal: Number(item.kcal) || 0,
    protein: Number(item.protein) || 0,
    carbs: Number(item.carbs) || 0,
    fat: Number(item.fat) || 0,
    fiber: Number(item.fiber) || 0,
    sodium: Number(item.sodium) || 0
  }
}

function catalogDish(item) {
  return {
    sourceKey: `dish-catalog:${item.id}`,
    source: "builtin",
    name: item.title,
    aliases: [],
    category: item.cuisine === "基础餐食" ? "基础餐食" : "内置菜品",
    cuisine: item.cuisine || "",
    slot: item.slot || "all",
    servingUnit: item.unit || "标准份",
    servingAmount: dishServingAmount(item),
    measureUnit: dishMeasureUnit(item),
    servingGrams: dishMeasureUnit(item) === "g" ? dishServingAmount(item) : 0,
    description: item.foodsText || "",
    tags: ["内置数据"],
    allergens: Array.isArray(item.allergens) ? item.allergens : [],
    nutrition: nutrition(item),
    status: "online"
  }
}

function baseMealDish(item, slot) {
  const description = (item.foods || []).join(" · ")
  const grams = (description.match(/\d+(?:\.\d+)?g/gi) || []).reduce((sum, value) => sum + Number.parseFloat(value), 0)
  return {
    sourceKey: `base-meal:${slot}:${item.id}`,
    source: "builtin",
    name: item.title,
    aliases: [],
    category: "营养套餐",
    cuisine: (item.tastes || [])[0] || "",
    slot,
    servingUnit: "标准份",
    servingAmount: grams || 100,
    measureUnit: "g",
    servingGrams: grams || 100,
    description,
    tags: ["内置数据", ...(item.tags || [])],
    allergens: item.allergens || [],
    nutrition: nutrition(item),
    status: "online"
  }
}

const catalog = buildDishCatalog().map(catalogDish)
const catalogTitles = new Set(catalog.map((item) => item.name))
const planDishes = Object.entries(baseMeals)
  .flatMap(([slot, items]) => (items || []).map((item) => baseMealDish(item, slot)))
  .filter((item) => !catalogTitles.has(item.name))
const dishes = generateExpandedDishes([...catalog, ...planDishes], 3000)
const output = path.resolve(__dirname, "../admin/builtin-dishes.json")

fs.writeFileSync(output, `${JSON.stringify(dishes, null, 2)}\n`)
console.log(`Generated ${dishes.length} built-in dishes at ${output}`)
