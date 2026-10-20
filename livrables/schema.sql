-- Schéma de la base de données, Slay your enemies (projet BTS SIO, CDD-QUIZ-2026-001)
-- Structure seule, sans données, après les migrations 0001 et 0002 (backend/migrations/).
-- Généré le 20/10/2026 avec pg_dump --schema-only.

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.11 (Debian 17.11-1.pgdg13+2)
-- Dumped by pg_dump version 17.11 (Debian 17.11-1.pgdg13+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: challenge_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.challenge_status AS ENUM (
    'pending',
    'accepted',
    'declined',
    'completed'
);


--
-- Name: difficulty_level; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.difficulty_level AS ENUM (
    'easy',
    'medium',
    'hard'
);


--
-- Name: evaluation_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.evaluation_type AS ENUM (
    'controle',
    'examen',
    'projet'
);


--
-- Name: question_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.question_type AS ENUM (
    'mcq',
    'true_false',
    'free_text'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'student',
    'trainer'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: answers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.answers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    question_id uuid NOT NULL,
    label text NOT NULL,
    is_correct boolean
);


--
-- Name: attempt_answers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attempt_answers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    attempt_id uuid NOT NULL,
    question_id uuid NOT NULL,
    answer_id uuid,
    free_text text,
    is_correct boolean,
    time_ms integer NOT NULL,
    CONSTRAINT attempt_answers_time_ms_check CHECK ((time_ms >= 0))
);


--
-- Name: attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    quiz_id uuid NOT NULL,
    challenge_id uuid,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    score integer,
    total_time_ms integer
);


--
-- Name: challenges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.challenges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    quiz_id uuid NOT NULL,
    challenger_id uuid NOT NULL,
    challenged_id uuid NOT NULL,
    status public.challenge_status DEFAULT 'pending'::public.challenge_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT challenges_check CHECK ((challenger_id <> challenged_id))
);


--
-- Name: class_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_members (
    class_id uuid NOT NULL,
    student_id uuid NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: classes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.classes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trainer_id uuid NOT NULL,
    name text NOT NULL,
    join_code text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: evaluations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evaluations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    class_id uuid NOT NULL,
    title text NOT NULL,
    type public.evaluation_type NOT NULL,
    theme text,
    date date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: grades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.grades (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    class_id uuid NOT NULL,
    student_id uuid NOT NULL,
    evaluation_id uuid,
    subject text NOT NULL,
    value double precision NOT NULL,
    max double precision DEFAULT 20 NOT NULL,
    coef double precision DEFAULT 1 NOT NULL,
    graded_on date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT grades_check CHECK (((value >= (0)::double precision) AND (value <= max))),
    CONSTRAINT grades_coef_check CHECK ((coef > (0)::double precision)),
    CONSTRAINT grades_max_check CHECK ((max > (0)::double precision))
);


--
-- Name: pets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pets (
    user_id uuid NOT NULL,
    name text DEFAULT 'Braise'::text NOT NULL,
    xp integer DEFAULT 0 NOT NULL,
    level integer DEFAULT 1 NOT NULL,
    streak integer DEFAULT 0 NOT NULL,
    last_active_day date,
    xp_on_last_active_day integer DEFAULT 0 NOT NULL,
    CONSTRAINT pets_level_check CHECK ((level >= 1)),
    CONSTRAINT pets_xp_check CHECK ((xp >= 0))
);


--
-- Name: questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    quiz_id uuid NOT NULL,
    type public.question_type NOT NULL,
    statement text NOT NULL,
    explanation text,
    image_url text,
    points integer DEFAULT 1 NOT NULL,
    "position" integer NOT NULL,
    CONSTRAINT questions_points_check CHECK ((points >= 0))
);


--
-- Name: quizzes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quizzes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    author_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    theme text NOT NULL,
    difficulty public.difficulty_level NOT NULL,
    seconds_per_question integer NOT NULL,
    is_published boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT quizzes_seconds_per_question_check CHECK ((seconds_per_question > 0))
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    display_name text NOT NULL,
    role public.user_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: xp_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xp_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    amount integer NOT NULL,
    reason text NOT NULL,
    ref_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT xp_events_amount_check CHECK ((amount > 0)),
    CONSTRAINT xp_events_reason_check CHECK ((reason = ANY (ARRAY['quiz'::text, 'challenge_won'::text, 'good_grade'::text])))
);


--
-- Name: answers answers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.answers
    ADD CONSTRAINT answers_pkey PRIMARY KEY (id);


--
-- Name: attempt_answers attempt_answers_attempt_id_question_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attempt_answers
    ADD CONSTRAINT attempt_answers_attempt_id_question_id_key UNIQUE (attempt_id, question_id);


--
-- Name: attempt_answers attempt_answers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attempt_answers
    ADD CONSTRAINT attempt_answers_pkey PRIMARY KEY (id);


--
-- Name: attempts attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attempts
    ADD CONSTRAINT attempts_pkey PRIMARY KEY (id);


--
-- Name: challenges challenges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.challenges
    ADD CONSTRAINT challenges_pkey PRIMARY KEY (id);


--
-- Name: class_members class_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_members
    ADD CONSTRAINT class_members_pkey PRIMARY KEY (class_id, student_id);


--
-- Name: classes classes_join_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_join_code_key UNIQUE (join_code);


--
-- Name: classes classes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_pkey PRIMARY KEY (id);


--
-- Name: evaluations evaluations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluations
    ADD CONSTRAINT evaluations_pkey PRIMARY KEY (id);


--
-- Name: grades grades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grades
    ADD CONSTRAINT grades_pkey PRIMARY KEY (id);


--
-- Name: pets pets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pets
    ADD CONSTRAINT pets_pkey PRIMARY KEY (user_id);


--
-- Name: questions questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_pkey PRIMARY KEY (id);


--
-- Name: questions questions_quiz_id_position_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_quiz_id_position_key UNIQUE (quiz_id, "position");


--
-- Name: quizzes quizzes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quizzes
    ADD CONSTRAINT quizzes_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: xp_events xp_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xp_events
    ADD CONSTRAINT xp_events_pkey PRIMARY KEY (id);


--
-- Name: answers_question_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX answers_question_idx ON public.answers USING btree (question_id);


--
-- Name: attempts_quiz_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attempts_quiz_idx ON public.attempts USING btree (quiz_id);


--
-- Name: attempts_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attempts_user_idx ON public.attempts USING btree (user_id);


--
-- Name: class_members_student_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX class_members_student_idx ON public.class_members USING btree (student_id);


--
-- Name: classes_trainer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX classes_trainer_idx ON public.classes USING btree (trainer_id);


--
-- Name: evaluations_class_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX evaluations_class_idx ON public.evaluations USING btree (class_id, date);


--
-- Name: grades_class_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX grades_class_idx ON public.grades USING btree (class_id);


--
-- Name: grades_student_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX grades_student_idx ON public.grades USING btree (student_id, graded_on);


--
-- Name: quizzes_author_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX quizzes_author_idx ON public.quizzes USING btree (author_id);


--
-- Name: xp_events_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xp_events_user_idx ON public.xp_events USING btree (user_id, created_at DESC);


--
-- Name: answers answers_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.answers
    ADD CONSTRAINT answers_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE CASCADE;


--
-- Name: attempt_answers attempt_answers_answer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attempt_answers
    ADD CONSTRAINT attempt_answers_answer_id_fkey FOREIGN KEY (answer_id) REFERENCES public.answers(id) ON DELETE SET NULL;


--
-- Name: attempt_answers attempt_answers_attempt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attempt_answers
    ADD CONSTRAINT attempt_answers_attempt_id_fkey FOREIGN KEY (attempt_id) REFERENCES public.attempts(id) ON DELETE CASCADE;


--
-- Name: attempt_answers attempt_answers_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attempt_answers
    ADD CONSTRAINT attempt_answers_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE CASCADE;


--
-- Name: attempts attempts_challenge_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attempts
    ADD CONSTRAINT attempts_challenge_id_fkey FOREIGN KEY (challenge_id) REFERENCES public.challenges(id) ON DELETE SET NULL;


--
-- Name: attempts attempts_quiz_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attempts
    ADD CONSTRAINT attempts_quiz_id_fkey FOREIGN KEY (quiz_id) REFERENCES public.quizzes(id) ON DELETE CASCADE;


--
-- Name: attempts attempts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attempts
    ADD CONSTRAINT attempts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: challenges challenges_challenged_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.challenges
    ADD CONSTRAINT challenges_challenged_id_fkey FOREIGN KEY (challenged_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: challenges challenges_challenger_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.challenges
    ADD CONSTRAINT challenges_challenger_id_fkey FOREIGN KEY (challenger_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: challenges challenges_quiz_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.challenges
    ADD CONSTRAINT challenges_quiz_id_fkey FOREIGN KEY (quiz_id) REFERENCES public.quizzes(id) ON DELETE CASCADE;


--
-- Name: class_members class_members_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_members
    ADD CONSTRAINT class_members_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: class_members class_members_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_members
    ADD CONSTRAINT class_members_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: classes classes_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: evaluations evaluations_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluations
    ADD CONSTRAINT evaluations_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: grades grades_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grades
    ADD CONSTRAINT grades_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: grades grades_evaluation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grades
    ADD CONSTRAINT grades_evaluation_id_fkey FOREIGN KEY (evaluation_id) REFERENCES public.evaluations(id) ON DELETE SET NULL;


--
-- Name: grades grades_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grades
    ADD CONSTRAINT grades_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: pets pets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pets
    ADD CONSTRAINT pets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: questions questions_quiz_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_quiz_id_fkey FOREIGN KEY (quiz_id) REFERENCES public.quizzes(id) ON DELETE CASCADE;


--
-- Name: quizzes quizzes_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quizzes
    ADD CONSTRAINT quizzes_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: xp_events xp_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xp_events
    ADD CONSTRAINT xp_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--


