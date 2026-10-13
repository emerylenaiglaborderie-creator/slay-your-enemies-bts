#!/usr/bin/env bash
# Scénario de bout en bout contre une API lancée localement (cargo run).
# Usage : ./scripts/smoke.sh [http://localhost:3000]   (nécessite curl et jq)
set -euo pipefail
API=${1:-http://localhost:3000}
RUN=$RANDOM

call() { # méthode chemin token [corps]
  curl -sS -f -X "$1" "$API$2" -H "Authorization: Bearer $3" -H 'Content-Type: application/json' ${4:+-d "$4"}
}
register() { # email nom rôle
  curl -sS -f -X POST "$API/auth/register" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"motdepasse\",\"display_name\":\"$2\",\"role\":\"$3\"}" | jq -r .token
}
check() { [ "$2" = "$3" ] && echo "ok   $1" || { echo "FAIL $1 : attendu $3, obtenu $2"; exit 1; }; }

T=$(register "prof$RUN@test.fr" "Prof" trainer)
A=$(register "alice$RUN@test.fr" "Alice" student)
B=$(register "bob$RUN@test.fr" "Bob" student)
B_ID=$(call GET /me "$B" | jq -r .id)
A_ID=$(call GET /me "$A" | jq -r .id)

# Classe : le formateur la crée, les élèves la rejoignent avec le code
CLASS=$(call POST /classes "$T" '{"name":"SIO1 test"}')
CLASS_ID=$(echo "$CLASS" | jq -r .id); CODE=$(echo "$CLASS" | jq -r .join_code)
call POST /classes/join "$A" "{\"code\":\"$(echo "$CODE" | tr 'A-Z' 'a-z')\"}" >/dev/null
check "rejoindre une classe" "$(call POST /classes/join "$B" "{\"code\":\"$CODE\"}" | jq .member_count)" 2
check "code masqué aux élèves" "$(call GET "/classes/$CLASS_ID" "$A" | jq -r .join_code)" null
check "élève ne crée pas d'évaluation" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/classes/$CLASS_ID/evaluations" -H "Authorization: Bearer $A" -H 'Content-Type: application/json' -d '{"title":"x","type":"controle","date":"2030-01-01"}')" 403
call POST "/classes/$CLASS_ID/evaluations" "$T" '{"title":"Contrôle réseau","type":"controle","theme":"reseau","date":"2030-01-15"}' >/dev/null
check "évaluation visible de l'élève" "$(call GET /evaluations "$A" | jq -r '.[0].title')" "Contrôle réseau"

QUIZ=$(call POST /quizzes "$T" '{"title":"Réseaux","theme":"reseau","difficulty":"easy","seconds_per_question":20,"is_published":true}' | jq -r .id)
call POST "/quizzes/$QUIZ/questions" "$T" '{"type":"mcq","statement":"Port HTTPS ?","points":2,"answers":[{"label":"80","is_correct":false},{"label":"443","is_correct":true}]}'
call POST "/quizzes/$QUIZ/questions" "$T" '{"type":"true_false","statement":"TCP est orienté connexion","answers":[{"label":"Vrai","is_correct":true},{"label":"Faux","is_correct":false}]}'
call POST "/quizzes/$QUIZ/questions" "$T" '{"type":"free_text","statement":"Que signifie DNS ?","answers":[{"label":"Domain Name System","is_correct":true}]}'

# Vue étudiant : pas de bonne réponse exposée, pas de réponse attendue pour le texte libre.
VIEW=$(call GET "/quizzes/$QUIZ" "$A")
check "is_correct masqué" "$(echo "$VIEW" | jq '[.questions[].answers[] | has("is_correct")] | any')" false
check "réponse texte libre masquée" "$(echo "$VIEW" | jq '.questions[2].answers | length')" 0
check "étudiant ne crée pas de quiz" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/quizzes" -H "Authorization: Bearer $A" -H 'Content-Type: application/json' -d '{"title":"x","theme":"x","difficulty":"easy","seconds_per_question":20}')" 403

Q1=$(echo "$VIEW" | jq -r '.questions[0].id'); Q1_OK=$(call GET "/quizzes/$QUIZ" "$T" | jq -r '.questions[0].answers[] | select(.is_correct) | .id')
Q2=$(echo "$VIEW" | jq -r '.questions[1].id'); Q2_OK=$(call GET "/quizzes/$QUIZ" "$T" | jq -r '.questions[1].answers[] | select(.is_correct) | .id')
Q3=$(echo "$VIEW" | jq -r '.questions[2].id')

# Défi Alice -> Bob
CH=$(call POST /challenges "$A" "{\"quiz_id\":\"$QUIZ\",\"challenged_id\":\"$B_ID\"}" | jq -r .id)
check "défi accepté" "$(call PATCH "/challenges/$CH" "$B" '{"status":"accepted"}' | jq -r .status)" accepted

# Alice : tout juste, texte libre à corriger
AT_A=$(call POST /attempts "$A" "{\"quiz_id\":\"$QUIZ\",\"challenge_id\":\"$CH\"}" | jq -r .id)
check "QCM juste" "$(call POST "/attempts/$AT_A/answers" "$A" "{\"question_id\":\"$Q1\",\"answer_id\":\"$Q1_OK\",\"time_ms\":4000}" | jq .is_correct)" true
call POST "/attempts/$AT_A/answers" "$A" "{\"question_id\":\"$Q2\",\"answer_id\":\"$Q2_OK\",\"time_ms\":3000}" >/dev/null
check "texte libre en attente" "$(call POST "/attempts/$AT_A/answers" "$A" "{\"question_id\":\"$Q3\",\"free_text\":\"Domain Name System\",\"time_ms\":9000}" | jq .is_correct)" null
check "score Alice avant correction" "$(call POST "/attempts/$AT_A/finish" "$A" | jq .score)" 3

# Bob : QCM hors délai, Vrai/Faux juste
AT_B=$(call POST /attempts "$B" "{\"quiz_id\":\"$QUIZ\",\"challenge_id\":\"$CH\"}" | jq -r .id)
check "timer dépassé" "$(call POST "/attempts/$AT_B/answers" "$B" "{\"question_id\":\"$Q1\",\"answer_id\":\"$Q1_OK\",\"time_ms\":25000}" | jq .timed_out)" true
call POST "/attempts/$AT_B/answers" "$B" "{\"question_id\":\"$Q2\",\"answer_id\":\"$Q2_OK\",\"time_ms\":2000}" >/dev/null
check "score Bob" "$(call POST "/attempts/$AT_B/finish" "$B" | jq .score)" 1
check "défi terminé" "$(call GET "/challenges/$CH" "$A" | jq -r .status)" completed

# Correction manuelle du texte libre par le formateur
AA=$(call GET "/quizzes/$QUIZ/pending-answers" "$T" | jq -r '.[0].attempt_answer_id')
call PATCH "/attempt-answers/$AA/grade" "$T" '{"is_correct":true}'
check "classement (1er)" "$(call GET "/quizzes/$QUIZ/leaderboard" "$B" | jq -r '.[0].display_name + ":" + (.[0].score|tostring)')" "Alice:4"
check "stats : question la plus échouée" "$(call GET "/quizzes/$QUIZ/stats" "$T" | jq -r '.questions[0].statement')" "Port HTTPS ?"
check "historique Alice" "$(call GET /me/attempts "$A" | jq -r '.[0].max_score')" 4

# Notes : bonne note = bonus d'XP, mauvaise = plan de rattrapage sur le thème
TODAY=$(date +%F)
OUTCOMES=$(call POST "/classes/$CLASS_ID/grades" "$T" "{\"subject\":\"reseau\",\"coef\":2,\"graded_on\":\"$TODAY\",\"entries\":[{\"student_id\":\"$A_ID\",\"value\":16},{\"student_id\":\"$B_ID\",\"value\":7}]}")
check "issues des notes" "$(echo "$OUTCOMES" | jq -r '[.[].outcome] | join(",")')" "bonus,recovery"
check "note hors barème refusée" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/classes/$CLASS_ID/grades" -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d "{\"subject\":\"x\",\"graded_on\":\"$TODAY\",\"entries\":[{\"student_id\":\"$A_ID\",\"value\":25}]}")" 400
check "notes de l'élève" "$(call GET /me/grades "$B" | jq -r '.recovery_plans[0].subject')" reseau

# Dragon : quiz 15 + défi gagné 10 + bonne note 20 = 45 XP pour Alice
check "XP d'Alice" "$(call GET /me/pet "$A" | jq '.pet.xp')" 45
check "historique d'XP" "$(call GET /me/pet "$A" | jq -r '[.recent_events[].reason] | sort | join(",")')" "challenge_won,good_grade,quiz"
# Bob rejoue : question ratée puis réussie (+5) et rattrapage (2 bonnes réponses x 3)
AT_B2=$(call POST /attempts "$B" "{\"quiz_id\":\"$QUIZ\"}" | jq -r .id)
call POST "/attempts/$AT_B2/answers" "$B" "{\"question_id\":\"$Q1\",\"answer_id\":\"$Q1_OK\",\"time_ms\":3000}" >/dev/null
call POST "/attempts/$AT_B2/answers" "$B" "{\"question_id\":\"$Q2\",\"answer_id\":\"$Q2_OK\",\"time_ms\":3000}" >/dev/null
check "récompense maîtrise + rattrapage" "$(call POST "/attempts/$AT_B2/finish" "$B" | jq -r '.reward | "\(.mastered),\(.recovery),\(.gained)"')" "1,6,26"
check "formateur sans dragon" "$(curl -s -o /dev/null -w '%{http_code}' "$API/me/pet" -H "Authorization: Bearer $T")" 403

# Tableau de bord du formateur
DASH=$(call GET "/classes/$CLASS_ID/dashboard" "$T")
check "tableau de bord : élèves" "$(echo "$DASH" | jq '.students | length')" 2
check "tableau de bord : dragon de Bob" "$(echo "$DASH" | jq -r '.students[] | select(.display_name=="Bob") | "\(.pet.xp),\(.pet.stage),\(.recovery_plans | length)"')" "41,egg,1"
check "tableau de bord : moyenne d'Alice" "$(echo "$DASH" | jq -r '.students[] | select(.display_name=="Alice") | .average')" 16.0
check "tableau de bord réservé" "$(curl -s -o /dev/null -w '%{http_code}' "$API/classes/$CLASS_ID/dashboard" -H "Authorization: Bearer $A")" 403
echo "Scénario complet : OK"
