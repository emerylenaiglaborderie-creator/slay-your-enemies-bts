//! Règles de progression du dragon, reprises de l'app d'origine (`web/src/domain/xp.ts`, `grades.ts`).
//! Fonctions pures : la base de données est gérée dans `routes/pet.rs`.
//!
//! Principe : le dragon récompense la régularité et la maîtrise, jamais le volume brut.
//! Il ne perd jamais d'XP ni de niveau ; une journée manquée remet seulement la série à zéro.

use chrono::NaiveDate;
use serde::Serialize;

/// XP fixe pour tout quiz terminé avec au moins une réponse.
pub const QUIZ_BASE: i32 = 15;
/// Par question réussie qui avait été ratée lors d'une tentative précédente.
pub const MASTERY_BONUS: i32 = 5;
/// Plafond quotidien des gains par quiz (les bonus ponctuels n'y sont pas soumis).
pub const DAILY_CAP: i32 = 60;
/// Bonus de série par jour consécutif au-delà du premier, plafonné à +50 %.
pub const STREAK_STEP: f64 = 0.05;
pub const STREAK_MAX_BONUS: f64 = 0.5;
/// XP pour passer du niveau 1 au 2, puis augmentation par niveau.
pub const LEVEL_BASE_COST: i32 = 20;
pub const LEVEL_COST_STEP: i32 = 5;
/// Niveau minimal de chaque stade : oeuf, bébé, jeune (même ordre que `web/src/domain/pet-stages.ts`).
pub const STAGE_MIN_LEVELS: [i32; 3] = [1, 5, 15];
pub const STAGE_IDS: [&str; 3] = ["egg", "baby", "young"];

/// Bonus ponctuel au vainqueur d'un défi.
pub const CHALLENGE_WIN_BONUS: i32 = 10;

/// Notes, ramenées sur 20.
pub const GOOD_GRADE_THRESHOLD: f64 = 14.0;
pub const BAD_GRADE_THRESHOLD: f64 = 10.0;
pub const GOOD_GRADE_BONUS: i32 = 20;
/// Une note plus ancienne ne donne pas de bonus (évite la saisie rétroactive).
pub const GRADE_BONUS_MAX_AGE_DAYS: i64 = 14;
pub const RECOVERY_DAYS: i64 = 14;
/// Pendant un plan de rattrapage : par bonne réponse à un quiz du même thème, plafonné par quiz.
pub const RECOVERY_BONUS_PER_ANSWER: i32 = 3;
pub const RECOVERY_BONUS_MAX: i32 = 15;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PetState {
    pub xp: i32,
    pub level: i32,
    pub streak: i32,
    pub last_active_day: Option<NaiveDate>,
    pub xp_on_last_active_day: i32,
}

/// XP totale nécessaire pour atteindre un niveau.
pub fn xp_for_level(level: i32) -> i32 {
    let steps = (level - 1).max(0);
    steps * LEVEL_BASE_COST + LEVEL_COST_STEP * steps * (steps - 1) / 2
}

pub fn level_for_xp(xp: i32) -> i32 {
    let mut level = 1;
    while xp_for_level(level + 1) <= xp {
        level += 1;
    }
    level
}

pub fn stage_for_level(level: i32) -> usize {
    STAGE_MIN_LEVELS.iter().rposition(|&min| level >= min).unwrap_or(0)
}

/// Avancement dans le niveau courant : (XP acquise dans le niveau, XP nécessaire pour le suivant).
pub fn level_progress(xp: i32) -> (i32, i32) {
    let level = level_for_xp(xp);
    let start = xp_for_level(level);
    (xp - start, xp_for_level(level + 1) - start)
}

/// Série affichée : elle retombe à 0 si la veille n'a pas eu d'activité.
pub fn current_streak(pet: &PetState, today: NaiveDate) -> i32 {
    match pet.last_active_day {
        Some(day) if (today - day).num_days() <= 1 => pet.streak,
        _ => 0,
    }
}

pub fn earned_today(pet: &PetState, today: NaiveDate) -> i32 {
    if pet.last_active_day == Some(today) { pet.xp_on_last_active_day } else { 0 }
}

pub fn streak_multiplier(streak: i32) -> f64 {
    1.0 + ((streak - 1).max(0) as f64 * STREAK_STEP).min(STREAK_MAX_BONUS)
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct Reward {
    pub gained: i32,
    pub base: i32,
    pub mastered: i32,
    pub recovery: i32,
    pub multiplier: f64,
    pub capped: bool,
    pub levels_gained: i32,
    pub stage_changed: bool,
}

fn grow(pet: PetState, xp: i32) -> (PetState, i32, bool) {
    let level = pet.level.max(level_for_xp(xp));
    let stage_changed = stage_for_level(level) != stage_for_level(pet.level);
    (PetState { xp, level, ..pet }, level - pet.level, stage_changed)
}

/// Applique un quiz terminé. `mastered` : questions réussies après un échec passé ;
/// `recovery_correct` : bonnes réponses comptant pour un plan de rattrapage.
pub fn apply_quiz(pet: PetState, mastered: i32, recovery_correct: i32, today: NaiveDate) -> (PetState, Reward) {
    let streak = match pet.last_active_day {
        Some(day) if day == today => pet.streak.max(1),
        Some(day) if (today - day).num_days() == 1 => pet.streak + 1,
        _ => 1,
    };
    let recovery = (recovery_correct * RECOVERY_BONUS_PER_ANSWER).min(RECOVERY_BONUS_MAX);
    let multiplier = streak_multiplier(streak);
    let raw = ((QUIZ_BASE + mastered * MASTERY_BONUS + recovery) as f64 * multiplier).round() as i32;
    let remaining = (DAILY_CAP - earned_today(&pet, today)).max(0);
    let gained = raw.min(remaining);

    let (grown, levels_gained, stage_changed) = grow(pet, pet.xp + gained);
    let next = PetState {
        streak,
        last_active_day: Some(today),
        xp_on_last_active_day: earned_today(&pet, today) + gained,
        ..grown
    };
    let reward = Reward {
        gained,
        base: QUIZ_BASE,
        mastered,
        recovery,
        multiplier,
        capped: gained < raw,
        levels_gained,
        stage_changed,
    };
    (next, reward)
}

/// Bonus ponctuel (bonne note, défi gagné) : hors plafond quotidien, sans effet sur la série.
pub fn apply_bonus(pet: PetState, amount: i32) -> PetState {
    if amount <= 0 {
        return pet;
    }
    grow(pet, pet.xp + amount).0
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum GradeLevel {
    Good,
    Neutral,
    Bad,
}

pub fn on20(value: f64, max: f64) -> f64 {
    value / max * 20.0
}

pub fn grade_level(value: f64, max: f64) -> GradeLevel {
    let score = on20(value, max);
    if score >= GOOD_GRADE_THRESHOLD {
        GradeLevel::Good
    } else if score < BAD_GRADE_THRESHOLD {
        GradeLevel::Bad
    } else {
        GradeLevel::Neutral
    }
}

/// Une bonne note récente rapporte un bonus unique, au moment de sa saisie.
pub fn earns_good_grade_bonus(value: f64, max: f64, graded_on: NaiveDate, today: NaiveDate) -> bool {
    let age = (today - graded_on).num_days();
    grade_level(value, max) == GradeLevel::Good && (0..=GRADE_BONUS_MAX_AGE_DAYS).contains(&age)
}

#[derive(Debug, Clone)]
pub struct GradeRef<'a> {
    pub subject: &'a str,
    pub value: f64,
    pub max: f64,
    pub graded_on: NaiveDate,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct RecoveryPlan {
    pub subject: String,
    pub until: NaiveDate,
}

fn same_subject(a: &str, b: &str) -> bool {
    a.trim().to_lowercase() == b.trim().to_lowercase()
}

/// Plans de rattrapage en cours : la dernière mauvaise note d'une matière ouvre un plan
/// pendant `RECOVERY_DAYS` jours ; seule une note correcte d'un jour postérieur le ferme.
pub fn active_recovery_plans(grades: &[GradeRef], today: NaiveDate) -> Vec<RecoveryPlan> {
    let mut subjects: Vec<&str> = Vec::new();
    for g in grades {
        if !subjects.iter().any(|s| same_subject(s, g.subject)) {
            subjects.push(g.subject);
        }
    }
    let mut plans: Vec<RecoveryPlan> = subjects
        .into_iter()
        .filter_map(|subject| {
            let list: Vec<&GradeRef> = grades.iter().filter(|g| same_subject(g.subject, subject)).collect();
            let last_bad = list
                .iter()
                .filter(|g| grade_level(g.value, g.max) == GradeLevel::Bad)
                .map(|g| g.graded_on)
                .max()?;
            let recovered = list.iter().any(|g| grade_level(g.value, g.max) != GradeLevel::Bad && g.graded_on > last_bad);
            let until = last_bad + chrono::Duration::days(RECOVERY_DAYS);
            (!recovered && until > today).then(|| RecoveryPlan { subject: subject.trim().to_string(), until })
        })
        .collect();
    plans.sort_by_key(|p| p.until);
    plans
}

/// Vrai si un quiz de ce thème compte pour l'un des plans.
pub fn theme_in_recovery(theme: &str, plans: &[RecoveryPlan]) -> bool {
    plans.iter().any(|p| same_subject(&p.subject, theme))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn day(d: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 10, d).unwrap()
    }

    fn new_pet() -> PetState {
        PetState { xp: 0, level: 1, streak: 0, last_active_day: None, xp_on_last_active_day: 0 }
    }

    #[test]
    fn niveaux_et_stades() {
        assert_eq!(xp_for_level(1), 0);
        assert_eq!(xp_for_level(2), 20);
        assert_eq!(xp_for_level(3), 45);
        assert_eq!(level_for_xp(44), 2);
        assert_eq!(level_for_xp(45), 3);
        assert_eq!(STAGE_IDS[stage_for_level(4)], "egg");
        assert_eq!(STAGE_IDS[stage_for_level(5)], "baby");
        assert_eq!(STAGE_IDS[stage_for_level(15)], "young");
        assert_eq!(level_progress(50), (5, 30));
    }

    #[test]
    fn premier_quiz() {
        let (pet, reward) = apply_quiz(new_pet(), 0, 0, day(10));
        assert_eq!(reward.gained, QUIZ_BASE);
        assert_eq!(pet.streak, 1);
        assert_eq!(pet.last_active_day, Some(day(10)));
    }

    #[test]
    fn maitrise_et_serie() {
        let pet = PetState { streak: 3, last_active_day: Some(day(9)), ..new_pet() };
        let (pet, reward) = apply_quiz(pet, 2, 0, day(10));
        assert_eq!(pet.streak, 4);
        assert_eq!(reward.gained, ((15 + 10) as f64 * 1.15).round() as i32);
    }

    #[test]
    fn jour_manque_remet_la_serie_sans_penalite() {
        let pet = PetState { xp: 100, level: level_for_xp(100), streak: 8, last_active_day: Some(day(5)), ..new_pet() };
        assert_eq!(current_streak(&pet, day(10)), 0);
        let (after, _) = apply_quiz(pet, 0, 0, day(10));
        assert_eq!(after.streak, 1);
        assert!(after.xp > pet.xp && after.level >= pet.level);
    }

    #[test]
    fn plafond_quotidien() {
        let pet = PetState { last_active_day: Some(day(10)), xp_on_last_active_day: 55, streak: 1, ..new_pet() };
        let (pet, reward) = apply_quiz(pet, 0, 0, day(10));
        assert_eq!(reward.gained, 5);
        assert!(reward.capped);
        assert_eq!(pet.xp_on_last_active_day, DAILY_CAP);
    }

    #[test]
    fn bonus_hors_plafond_sans_serie() {
        let pet = PetState { last_active_day: Some(day(10)), xp_on_last_active_day: DAILY_CAP, streak: 2, ..new_pet() };
        let after = apply_bonus(pet, GOOD_GRADE_BONUS);
        assert_eq!(after.xp, GOOD_GRADE_BONUS);
        assert_eq!(after.level, 2);
        assert_eq!(after.streak, 2);
    }

    #[test]
    fn rattrapage_plafonne() {
        let (_, reward) = apply_quiz(new_pet(), 0, 10, day(10));
        assert_eq!(reward.recovery, RECOVERY_BONUS_MAX);
    }

    #[test]
    fn bonus_de_bonne_note_recente_seulement() {
        assert!(earns_good_grade_bonus(15.0, 20.0, day(5), day(10)));
        assert!(!earns_good_grade_bonus(12.0, 20.0, day(5), day(10)));
        assert!(!earns_good_grade_bonus(15.0, 20.0, NaiveDate::from_ymd_opt(2026, 9, 1).unwrap(), day(10)));
    }

    #[test]
    fn plans_de_rattrapage() {
        let grades = [
            GradeRef { subject: "Réseau", value: 7.0, max: 20.0, graded_on: day(1) },
            GradeRef { subject: "SQL", value: 4.0, max: 20.0, graded_on: day(2) },
            GradeRef { subject: "sql", value: 12.0, max: 20.0, graded_on: day(3) },
        ];
        let plans = active_recovery_plans(&grades, day(10));
        assert_eq!(plans, vec![RecoveryPlan { subject: "Réseau".into(), until: day(15) }]);
        assert!(theme_in_recovery(" réseau ", &plans));
        assert!(active_recovery_plans(&grades, day(15)).is_empty());
    }
}
