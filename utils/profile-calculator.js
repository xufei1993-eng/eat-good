const ACTIVITY_FACTORS = { low: 1.2, medium: 1.55, high: 1.725 }
const PROFILE_SCHEMA_VERSION = 2

function round(value, step = 1) { return Math.round(value / step) * step }

function bmi(weightKg, heightCm) {
  if (!weightKg || !heightCm) return 0
  return Math.round(weightKg / Math.pow(heightCm / 100, 2) * 10) / 10
}

function bmiLabel(value) {
  if (!value) return ""
  if (value < 18.5) return "偏低"
  if (value < 24) return "正常"
  if (value < 28) return "超重"
  return "肥胖"
}

function restingEnergy({ gender, age, heightCm, weightKg }) {
  const sexConstant = gender === "male" ? 5 : -161
  return 10 * weightKg + 6.25 * heightCm - 5 * age + sexConstant
}

function calculateProfileTargets(profile) {
  const age = Number(profile.age)
  const heightCm = Number(profile.heightCm)
  const currentWeightKg = Number(profile.currentWeightKg)
  const prePregnancyWeightKg = Number(profile.prePregnancyWeightKg)
  const isPregnancy = profile.profileMode === "pregnancy"
  const calculationGender = isPregnancy ? "female" : profile.gender
  const calculationWeight = isPregnancy ? prePregnancyWeightKg : currentWeightKg
  if (!calculationGender || !age || !heightCm || !calculationWeight) return null

  const base = restingEnergy({ gender: calculationGender, age, heightCm, weightKg: calculationWeight })
  const activityLevel = profile.profileMode === "fatloss" ? profile.activityLevel : "low"
  const maintenance = base * (ACTIVITY_FACTORS[activityLevel] || ACTIVITY_FACTORS.low)
  const trimesterAdds = { 1: 0, 2: 300, 3: 450 }
  let dailyKcal = maintenance
  if (profile.profileMode === "fatloss") dailyKcal -= 300
  if (isPregnancy) dailyKcal += trimesterAdds[Number(profile.trimester)] || 0
  dailyKcal = Math.max(1200, round(dailyKcal, 10))

  const proteinFactors = profile.profileMode === "fatloss"
    ? { low: 1.2, medium: 1.4, high: 1.6 }
    : profile.profileMode === "pregnancy" ? { low: 1.1 } : { low: 0.9 }
  const proteinFactor = proteinFactors[activityLevel] || proteinFactors.low
  const proteinWeight = isPregnancy ? prePregnancyWeightKg : currentWeightKg
  const prePregnancyBmi = isPregnancy ? bmi(prePregnancyWeightKg, heightCm) : 0

  return {
    restingKcal: round(base, 10),
    dailyKcal,
    protein: round(proteinWeight * proteinFactor),
    fiber: 25,
    currentBmi: bmi(currentWeightKg, heightCm),
    prePregnancyBmi,
    prePregnancyBmiLabel: bmiLabel(prePregnancyBmi),
    formula: "Mifflin-St Jeor"
  }
}

function isProfileComplete(profile = {}) {
  if (profile.profileVersion !== PROFILE_SCHEMA_VERSION || !profile.profileCreated || !profile.profileMode || !profile.allergyStatus) return false
  if (!profile.gender || !Number(profile.age) || !Number(profile.heightCm) || !Number(profile.currentWeightKg)) return false
  if (profile.profileMode === "pregnancy" && !Number(profile.prePregnancyWeightKg)) return false
  return true
}

module.exports = { ACTIVITY_FACTORS, PROFILE_SCHEMA_VERSION, bmi, bmiLabel, restingEnergy, calculateProfileTargets, isProfileComplete }
