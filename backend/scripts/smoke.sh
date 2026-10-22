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
status() { # méthode chemin token [corps] : code HTTP seul, sans échouer sur une erreur
  curl -s -o /dev/null -w '%{http_code}' -X "$1" "$API$2" -H "Authorization: Bearer $3" -H 'Content-Type: application/json' ${4:+-d "$4"}
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

# Objectif de progression d'un plan de rattrapage (table recovery_goals)
COUNT=$(call GET "/classes/$CLASS_ID/grades" "$T" | jq length)
check "objectif 0 refusé" "$(status POST "/classes/$CLASS_ID/grades" "$T" "{\"subject\":\"sql\",\"graded_on\":\"$TODAY\",\"entries\":[{\"student_id\":\"$A_ID\",\"value\":15},{\"student_id\":\"$B_ID\",\"value\":7,\"recovery_target\":0}]}")" 400
check "objectif négatif refusé" "$(status POST "/classes/$CLASS_ID/grades" "$T" "{\"subject\":\"sql\",\"graded_on\":\"$TODAY\",\"entries\":[{\"student_id\":\"$B_ID\",\"value\":7,\"recovery_target\":-3}]}")" 400
check "lot refusé : aucune note créée" "$(call GET "/classes/$CLASS_ID/grades" "$T" | jq length)" "$COUNT"
check "objectif sur une note sans plan refusé" "$(status POST "/classes/$CLASS_ID/grades" "$T" "{\"subject\":\"sql\",\"graded_on\":\"$TODAY\",\"entries\":[{\"student_id\":\"$A_ID\",\"value\":14,\"recovery_target\":8}]}")" 400
GOAL=$(call POST "/classes/$CLASS_ID/grades" "$T" "{\"subject\":\"sql\",\"graded_on\":\"$TODAY\",\"entries\":[{\"student_id\":\"$B_ID\",\"value\":7,\"recovery_target\":8}]}")
check "note avec objectif : plan ouvert" "$(echo "$GOAL" | jq -r '.[0].outcome')" recovery
G_ID=$(echo "$GOAL" | jq -r '.[0].id')
plans_bob() { call GET "/classes/$CLASS_ID/dashboard" "$T" | jq -r '[.students[] | select(.display_name=="Bob") | .recovery_plans[] | "\(.subject):\(.target)"] | sort | join(",")'; }
check "tableau de bord : objectif affiché, plan sans objectif inchangé" "$(plans_bob)" "reseau:null,sql:8"
check "vue élève : objectif" "$(call GET /me/grades "$B" | jq -r '.recovery_plans[] | select(.subject=="sql") | .target')" 8
check "PUT objectif 0 refusé" "$(status PUT "/grades/$G_ID/recovery-goal" "$T" '{"target":0}')" 400
check "PUT objectif par un élève refusé" "$(status PUT "/grades/$G_ID/recovery-goal" "$B" '{"target":5}')" 403
T2=$(register "prof2$RUN@test.fr" "Prof 2" trainer)
check "PUT objectif par un autre formateur : note introuvable" "$(status PUT "/grades/$G_ID/recovery-goal" "$T2" '{"target":5}')" 404
check "PUT objectif sur une note inconnue" "$(status PUT "/grades/00000000-0000-0000-0000-000000000000/recovery-goal" "$T" '{"target":5}')" 404
GOOD_ID=$(call GET "/classes/$CLASS_ID/grades" "$T" | jq -r '[.[] | select(.value >= 10)][0].id')
check "PUT objectif sur une bonne note refusé" "$(status PUT "/grades/$GOOD_ID/recovery-goal" "$T" '{"target":5}')" 400
check "PUT objectif valide" "$(status PUT "/grades/$G_ID/recovery-goal" "$T" '{"target":12}')" 204
check "objectif modifié" "$(plans_bob)" "reseau:null,sql:12"
check "DELETE objectif" "$(status DELETE "/grades/$G_ID/recovery-goal" "$T")" 204
check "plan sans objectif après retrait" "$(plans_bob)" "reseau:null,sql:null"

# Durée personnalisée du plan de rattrapage (recovery_goals.days)
check "durée 0 refusée" "$(status POST "/classes/$CLASS_ID/grades" "$T" "{\"subject\":\"web\",\"graded_on\":\"$TODAY\",\"entries\":[{\"student_id\":\"$B_ID\",\"value\":5,\"recovery_days\":0}]}")" 400
check "durée de plus d'un an refusée" "$(status POST "/classes/$CLASS_ID/grades" "$T" "{\"subject\":\"web\",\"graded_on\":\"$TODAY\",\"entries\":[{\"student_id\":\"$B_ID\",\"value\":5,\"recovery_days\":366}]}")" 400
check "durée sur une note sans plan refusée" "$(status POST "/classes/$CLASS_ID/grades" "$T" "{\"subject\":\"web\",\"graded_on\":\"$TODAY\",\"entries\":[{\"student_id\":\"$A_ID\",\"value\":12,\"recovery_days\":30}]}")" 400
call POST "/classes/$CLASS_ID/grades" "$T" "{\"subject\":\"web\",\"graded_on\":\"$TODAY\",\"entries\":[{\"student_id\":\"$B_ID\",\"value\":5,\"recovery_target\":10,\"recovery_days\":30}]}" >/dev/null
IN30=$(date -v+30d +%F 2>/dev/null || date -d '+30 days' +%F)
check "plan de 30 jours" "$(call GET "/classes/$CLASS_ID/dashboard" "$T" | jq -r '.students[] | select(.display_name=="Bob") | .recovery_plans[] | select(.subject=="web") | "\(.until),\(.days),\(.target)"')" "$IN30,30,10"
check "PUT sans objectif ni durée refusé" "$(status PUT "/grades/$G_ID/recovery-goal" "$T" '{}')" 400
check "PUT durée 0 refusée" "$(status PUT "/grades/$G_ID/recovery-goal" "$T" '{"days":0}')" 400
check "PUT durée seule" "$(status PUT "/grades/$G_ID/recovery-goal" "$T" '{"days":7}')" 204
IN7=$(date -v+7d +%F 2>/dev/null || date -d '+7 days' +%F)
check "plan raccourci à 7 jours, sans objectif" "$(call GET /me/grades "$B" | jq -r '.recovery_plans[] | select(.subject=="sql") | "\(.until),\(.days),\(.target)"')" "$IN7,7,null"
echo "Scénario complet : OK"
