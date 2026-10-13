-- Schéma initial, conforme au livrable SQL_schema (dbdiagram.io).
-- Les contraintes marquées "ajout" ne figurent pas sur le diagramme.

CREATE TYPE user_role AS ENUM ('student', 'trainer');
CREATE TYPE difficulty_level AS ENUM ('easy', 'medium', 'hard');
CREATE TYPE question_type AS ENUM ('mcq', 'true_false', 'free_text');
CREATE TYPE challenge_status AS ENUM ('pending', 'accepted', 'declined', 'completed');

CREATE TABLE users (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email         text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    display_name  text NOT NULL,
    role          user_role NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE quizzes (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title                text NOT NULL,
    description          text,
    theme                text NOT NULL,
    difficulty           difficulty_level NOT NULL,
    seconds_per_question int NOT NULL CHECK (seconds_per_question > 0), -- ajout : CHECK
    is_published         boolean NOT NULL DEFAULT false,
    created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quizzes_author_idx ON quizzes(author_id);

CREATE TABLE questions (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id     uuid NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    type        question_type NOT NULL,
    statement   text NOT NULL,
    explanation text,
    image_url   text,
    points      int NOT NULL DEFAULT 1 CHECK (points >= 0), -- ajout : CHECK
    position    int NOT NULL,
    UNIQUE (quiz_id, position) -- ajout
);

-- Pour une question free_text, une ligne avec is_correct = true sert de réponse attendue (indicative).
CREATE TABLE answers (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    label       text NOT NULL,
    is_correct  boolean
);
CREATE INDEX answers_question_idx ON answers(question_id);

CREATE TABLE challenges (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id       uuid NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    challenger_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    challenged_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status        challenge_status NOT NULL DEFAULT 'pending',
    created_at    timestamptz NOT NULL DEFAULT now(),
    CHECK (challenger_id <> challenged_id) -- ajout
);

CREATE TABLE attempts (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    quiz_id       uuid NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    challenge_id  uuid REFERENCES challenges(id) ON DELETE SET NULL,
    started_at    timestamptz NOT NULL DEFAULT now(),
    finished_at   timestamptz,
    score         int,
    total_time_ms int
);
CREATE INDEX attempts_quiz_idx ON attempts(quiz_id);
CREATE INDEX attempts_user_idx ON attempts(user_id);

-- is_correct reste NULL pour le texte libre tant que le formateur n'a pas corrigé (F-007).
CREATE TABLE attempt_answers (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id  uuid NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
    question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    answer_id   uuid REFERENCES answers(id) ON DELETE SET NULL,
    free_text   text,
    is_correct  boolean,
    time_ms     int NOT NULL CHECK (time_ms >= 0),
    UNIQUE (attempt_id, question_id) -- ajout : une réponse par question et par tentative
);
