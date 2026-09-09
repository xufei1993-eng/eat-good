const RECIPE_LIBRARY = require("../data/recipe-library")

function buildRecipe(meal) {
  const title = meal && meal.title ? meal.title : "今日推荐"
  const source = RECIPE_LIBRARY[title]

  if (!source) {
    return {
      title,
      ingredients: [],
      steps: [],
      note: "这道菜暂未收录可靠菜谱。",
      available: false
    }
  }

  return {
    title,
    ingredients: source.ingredients.slice(),
    steps: source.steps.slice(),
    note: source.tips || "",
    available: true
  }
}

module.exports = { buildRecipe }
