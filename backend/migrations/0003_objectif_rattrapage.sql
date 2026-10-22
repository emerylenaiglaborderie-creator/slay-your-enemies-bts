-- Objectif de progression d'un plan de rattrapage, fixé par le formateur.
-- Un plan n'est pas stocké : il découle de la dernière mauvaise note d'une matière.
-- L'objectif est donc rattaché à cette note, au plus un par note.
-- Aucune ligne pour une note : pas d'objectif, le plan fonctionne comme avant.

CREATE TABLE recovery_goals (
    grade_id   uuid PRIMARY KEY REFERENCES grades(id) ON DELETE CASCADE,
    -- Nombre de bonnes réponses à obtenir, purement informatif (sans effet sur l'XP).
    target     integer NOT NULL CHECK (target > 0),
    created_at timestamptz NOT NULL DEFAULT now()
);
