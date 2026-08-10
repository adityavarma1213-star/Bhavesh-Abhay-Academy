# BAA OS — Final Theme + Challenge Implementation

## Locked design
- Aurora — flagship/default
- Galaxy — student/teen exploration
- Academic — parents/teachers/schools
- NeoGlass — premium alternative
- Calm — focus/wellbeing
- Duology — animated kids experience
- Light / Dark / System mode for every theme

## Student home-screen additions
- XP Points
- Level
- Challenge count
- Challenge wins
- Challenge Arena quick access
- Leaderboard area

## Module 51 — Challenge & Competition Arena
- Cross-grade challenges
- XP Race
- Quiz Battle with class-appropriate questions and normalized scoring
- Study Streak Battle
- Weekly XP Battle
- Team Battle
- Accept / Decline workflow in the local-first UI
- Production API boundary at `/api/challenges`
- PostgreSQL migration `db/migrations/002_challenge_arena.sql`

## Important deployment note
The local browser UI can demonstrate challenge flows without a database. Real student-to-student discovery, notifications and persistent challenge state require authenticated deployment of the API plus PostgreSQL. The frontend does not claim a local test challenge is a live network challenge.
