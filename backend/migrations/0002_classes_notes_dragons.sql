-- Classes, évaluations, notes et dragons des élèves.
-- Ces tables ne figurent pas sur le premier diagramme : livrable SQL à mettre à jour.

CREATE TYPE evaluation_type AS ENUM ('controle', 'examen', 'projet');

-- Une classe appartient à un formateur ; les élèves la rejoignent avec son code.
CREATE TABLE classes (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    trainer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       text NOT NULL,
    join_code  text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX classes_trainer_idx ON classes(trainer_id);

CREATE TABLE class_members (
    class_id   uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (class_id, student_id)
);
CREATE INDEX class_members_student_idx ON class_members(student_id);

-- Dates d'évaluation, saisies par le formateur pour une classe.
CREATE TABLE evaluations (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id   uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    title      text NOT NULL,
    type       evaluation_type NOT NULL,
    theme      text,
    date       date NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX evaluations_class_idx ON evaluations(class_id, date);

-- Notes saisies par le formateur. `subject` est comparé au thème des quiz pour le plan de rattrapage.
CREATE TABLE grades (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id      uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    student_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    evaluation_id uuid REFERENCES evaluations(id) ON DELETE SET NULL,
    subject       text NOT NULL,
    value         double precision NOT NULL,
    max           double precision NOT NULL DEFAULT 20 CHECK (max > 0),
    coef          double precision NOT NULL DEFAULT 1 CHECK (coef > 0),
    graded_on     date NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    CHECK (value >= 0 AND value <= max)
);
CREATE INDEX grades_student_idx ON grades(student_id, graded_on);
CREATE INDEX grades_class_idx ON grades(class_id);

-- Dragon d'un élève (un par élève). Le stade se déduit du niveau.
CREATE TABLE pets (
    user_id               uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    name                  text NOT NULL DEFAULT 'Braise',
    xp                    int NOT NULL DEFAULT 0 CHECK (xp >= 0),
    level                 int NOT NULL DEFAULT 1 CHECK (level >= 1),
    streak                int NOT NULL DEFAULT 0,
    last_active_day       date,
    xp_on_last_active_day int NOT NULL DEFAULT 0
);

-- Historique des gains d'XP, affiché à l'élève et au formateur.
CREATE TABLE xp_events (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount     int NOT NULL CHECK (amount > 0),
    reason     text NOT NULL CHECK (reason IN ('quiz', 'challenge_won', 'good_grade')),
    ref_id     uuid,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX xp_events_user_idx ON xp_events(user_id, created_at DESC);
