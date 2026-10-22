-- Durée personnalisée d'un plan de rattrapage, fixée par le formateur sur la note qui l'ouvre.
-- Sans durée, le plan dure 14 jours (`RECOVERY_DAYS` dans backend/src/xp.rs), comme avant.
-- L'objectif et la durée sont chacun facultatifs, mais une ligne porte au moins l'un des deux :
-- l'absence de ligne reste le seul moyen de dire « ni objectif ni durée ».

ALTER TABLE recovery_goals ALTER COLUMN target DROP NOT NULL;

-- Bornée à un an : au-delà, le plan n'a plus de sens et la date de fin pourrait déborder.
ALTER TABLE recovery_goals ADD COLUMN days integer CHECK (days BETWEEN 1 AND 365);

ALTER TABLE recovery_goals ADD CONSTRAINT recovery_goals_not_empty CHECK (target IS NOT NULL OR days IS NOT NULL);
