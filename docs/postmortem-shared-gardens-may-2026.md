# Post-Mortem: Shared Gardens Feature Deployment
**Date:** May 2026
**Severity:** Production outage — existing users locked out of their accounts
**Duration:** Several hours across multiple sessions
**Resolution:** Full production database rollback to pre-feature schema

---

## What Happened (Timeline)

1. Built multi-user shared gardens feature across 7 phases on the `staging` branch
2. Pushed staging branch to GitHub and ran migration 002 in Supabase SQL Editor
3. **Critical mistake:** Migration 002 was run on the production Supabase database, not the staging one
4. Production code (on `main` branch) was now running against a migrated database it didn't understand
5. Existing users could no longer access their gardens (RLS policies now required `garden_members` rows the old code didn't know about)
6. Multiple attempts to patch production while it was live failed, each creating new issues
7. Eventually rolled back the database schema via a down migration — which itself required 4+ rounds of debugging because it failed partially and silently
8. Production restored after several hours of outage

---

## Root Causes

### 1. No environment boundary was established upfront
Before any work began, the two-environment setup (staging Supabase project vs production Supabase project) was never explicitly mapped out. When the time came to run the migration, it was unclear which project was which, and the migration landed on production.

### 2. Migration was run on production before production code was deployed
The correct order is: deploy new code first, then run the migration (or both atomically). What happened instead was: migration ran on the production database while the production server was still running old code. This left the system in an inconsistent state — new schema, old code.

### 3. No backup was taken before running migrations
Before any schema migration runs on production, a database snapshot should exist so rollback is a single button click, not hours of debugging.

### 4. The down migration was not written or tested before deployment
We had a migration (002_shared_gardens.sql) but no corresponding rollback. When rollback was needed, the down migration was written under pressure, had bugs, and failed silently at multiple points. Policies were dropped but not recreated. Column renames didn't execute. This turned a simple rollback into a multi-hour debugging session.

### 5. RLS policies had a design flaw that wasn't caught before deployment
The `garden_members` SELECT policy queried `garden_members` from within itself (self-referential). In Supabase's PostgreSQL environment this causes `auth.uid()` to return null, making the policy always deny access. This bug existed in the migration from the start and was only discovered after deploying to a live environment.

### 6. Missing environment variable not caught before deployment
`SUPABASE_SERVICE_ROLE_KEY` was not set in Vercel. The admin client that inserts the first `garden_members` row (bootstrapping ownership) silently fell back to the anon key and failed without throwing an error. New gardens were created without their owner rows.

### 7. Vercel branch configuration was assumed, not verified
It was assumed production was deploying from `staging`. In reality production was always deploying from `main`. This led to incorrect diagnosis and wasted time trying to fix a Vercel configuration that was already correct.

### 8. Diagnostic queries were run piecemeal instead of all at once
Multiple times a single query was run, interpreted, then a fix was applied, which then revealed a new unknown. A comprehensive diagnostic (all unknowns answered in one round) would have identified the full picture before any action was taken.

---

## What Claude Should Have Done Differently

1. **Establish the environment map before writing a single line of code.** Ask explicitly: "Which Supabase project URL is production? Which is staging? Which Vercel environment tracks which branch?" Write it down and confirm before proceeding.

2. **Write the down migration at the same time as the up migration.** Both should exist, and the down migration should be tested on a copy before any production work.

3. **Provide a pre-deployment checklist before saying "ready to deploy."** This checklist should include:
   - [ ] Staging QA complete and signed off
   - [ ] DB backup taken
   - [ ] All Vercel environment variables verified (including service role key)
   - [ ] Vercel branch configuration confirmed
   - [ ] Down migration written and reviewed
   - [ ] Deployment order documented (code first or migration first, never both at once blindly)

4. **Never instruct running a migration on any database without first confirming which environment it is.** Should have asked: "Before you run this — can you confirm you're in the staging Supabase project, not production?"

5. **Run comprehensive diagnostics before taking action.** When something is broken, gather all relevant information in one round before prescribing a fix. Avoid the pattern of: run one query → apply fix → discover new unknown → repeat.

6. **Test RLS policies explicitly.** Before committing any RLS policy that references the same table or uses a security-definer function, verify it works as expected. The self-referential garden_members policy failure was predictable.

7. **Flag the risk of schema migrations on shared databases explicitly.** Both staging and production shared one Supabase project for a period. This should have been called out as a high-risk configuration before doing any migration work.

---

## What the User Should Do Differently

1. **Before starting any major feature: confirm the environment map.**
   - Which Supabase URL is production?
   - Which Supabase URL is staging?
   - Which Vercel branch deploys to production?
   - Write these down somewhere accessible.

2. **Take a database snapshot before running any migration.** In Supabase: Dashboard → Database → Backups. This makes rollback a one-click operation instead of a debugging session.

3. **Do not run migrations on production until staging QA is signed off.** The migration should only touch the production database at the very end of the process, after the code has been merged to `main` and deployed.

4. **Treat production as untouchable during development.** The rule should be: staging is where all testing, migrations, and debugging happen. Production only receives changes through a deliberate, planned promotion.

5. **When Claude says "paste all queries to get a complete picture before proceeding" — insist on it.** Several times in this session diagnostics were run piecemeal. Waiting the extra minute to get complete information upfront prevents hours of back-and-forth.

---

## The Correct Deployment Process for Future Schema Migrations

```
1. Build and test feature entirely on staging branch
2. Run migration on STAGING Supabase database only
3. QA test staging thoroughly — all flows, all user types
4. Get sign-off: "staging is working correctly"
5. Take a PRODUCTION database backup (Supabase Dashboard → Backups)
6. Open PR: staging → main on GitHub
7. Merge PR (Vercel auto-deploys new code to production from main)
8. Run migration on PRODUCTION Supabase database
9. Smoke test production immediately after
10. If anything is wrong: restore from backup (step 5), not a manually written down migration
```

---

## Specific Technical Lessons

| Issue | Lesson |
|---|---|
| Self-referential RLS on `garden_members` | Don't query the same table inside its own RLS policy — use `user_id = auth.uid()` directly |
| `auth.uid()` null in security definer functions | Supabase does not reliably pass JWT context into security definer functions — avoid this pattern |
| Bootstrap circular dependency on `garden_members` INSERT | Use `createSupabaseAdminClient()` for the first owner row insert — document this clearly in the migration |
| Silent failure of admin client without service role key | Check all required environment variables exist before deploying — add to pre-deployment checklist |
| Down migration failing silently partway through | Test down migrations on a copy of the DB before ever needing them in production |
| RLS "no policies = deny all" | When RLS is enabled and all policies are dropped, the table becomes inaccessible — always drop and recreate atomically |

---

## Status at Close of This Session

- **Production:** Restored to pre-sharing schema, all users can access their data
- **Staging:** Shared gardens feature (Phases 1–7) built and deployed, migration 002 applied to staging DB, RLS issues corrected
- **Remaining work:** Complete staging QA, then follow the deployment process above to promote to production
