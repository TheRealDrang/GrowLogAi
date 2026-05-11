# PRD: Shared Garden Access (Multi-User)
**GrowLog AI — Feature Specification**
Version 1.0 | May 2026

---

## Overview

Enable multiple users to tend the same garden together. A garden owner can invite other GrowLog users (or new users) to join their garden with either edit or view-only access. All members see shared crops, conversations, and session logs. Attribution shows who did what.

---

## Background & Current State

The app is built on Next.js (App Router), Supabase (auth + database), Google Sheets (logging), Resend (transactional email), and Vercel (hosting). Every database table currently uses a single `user_id` field with RLS policies of the form `auth.uid() = user_id`. This feature requires replacing that single-owner model with a membership model at the garden level.

Existing file structure to be aware of:
- `app/api/gardens/route.ts` — garden list and create
- `app/api/gardens/[id]/route.ts` — garden detail, update, delete
- `app/settings/page.tsx` — settings UI (garden settings, account)
- `app/onboarding/` — multi-step onboarding (welcome, garden, crop, sheets)
- `app/garden/[id]/page.tsx` — garden detail view
- `lib/supabase.ts` — server Supabase client
- `lib/supabase-browser.ts` — browser Supabase client
- `lib/google-sheets.ts` — Google Sheets and Drive API helpers
- `supabase/migrations/001_initial_schema.sql` — current schema

---

## Roles & Permissions

| Action | Owner | Edit Member | View-Only Member |
|---|---|---|---|
| View garden, crops, logs, conversations | ✅ | ✅ | ✅ |
| Add a crop | ✅ | ✅ | ❌ |
| Edit any crop | ✅ | ✅ | ❌ |
| Delete a crop | ✅ (any) | ✅ (own crops only) | ❌ |
| Log a session / chat with AI | ✅ | ✅ | ❌ |
| Start a new AI conversation | ✅ | ✅ | ❌ |
| Read all conversations and history | ✅ | ✅ | ✅ |
| Invite new members | ✅ | ❌ | ❌ |
| Change a member's role | ✅ | ❌ | ❌ |
| Revoke a member's access | ✅ | ❌ | ❌ |
| Share Google Sheet with a member | ✅ | ❌ | ❌ |
| Delete the garden | ✅ | ❌ | ❌ |
| Transfer garden ownership | ✅ | ❌ | ❌ |
| Create their own separate garden | ✅ | ✅ | ✅ |

---

## Database Changes

### Migration 002: Shared Gardens Schema

Create file: `supabase/migrations/002_shared_gardens.sql`

#### 1. Add `profiles` table

```sql
create table if not exists profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  avatar_url    text,
  updated_at    timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "users can view any profile"
  on profiles for select using (true);

create policy "users can update own profile"
  on profiles for update using (auth.uid() = id);

create policy "users can insert own profile"
  on profiles for insert with check (auth.uid() = id);

-- Auto-create profile on new user signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

create trigger profiles_updated_at
  before update on profiles
  for each row execute function update_updated_at();
```

#### 2. Add `garden_members` table

```sql
create table if not exists garden_members (
  id          uuid primary key default uuid_generate_v4(),
  garden_id   uuid not null references gardens(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('owner', 'edit', 'view')),
  joined_at   timestamptz not null default now(),
  unique (garden_id, user_id)
);

create index if not exists garden_members_garden_id_idx on garden_members(garden_id);
create index if not exists garden_members_user_id_idx on garden_members(user_id);

alter table garden_members enable row level security;

-- Anyone can see members of gardens they belong to
create policy "members can view garden members"
  on garden_members for select using (
    exists (
      select 1 from garden_members gm
      where gm.garden_id = garden_members.garden_id
        and gm.user_id = auth.uid()
    )
  );

-- Only owners can add members
create policy "owners can insert garden members"
  on garden_members for insert with check (
    exists (
      select 1 from garden_members gm
      where gm.garden_id = garden_members.garden_id
        and gm.user_id = auth.uid()
        and gm.role = 'owner'
    )
  );

-- Only owners can update roles
create policy "owners can update garden members"
  on garden_members for update using (
    exists (
      select 1 from garden_members gm
      where gm.garden_id = garden_members.garden_id
        and gm.user_id = auth.uid()
        and gm.role = 'owner'
    )
  );

-- Only owners can remove members (or members can remove themselves)
create policy "owners or self can delete garden members"
  on garden_members for delete using (
    auth.uid() = user_id
    or exists (
      select 1 from garden_members gm
      where gm.garden_id = garden_members.garden_id
        and gm.user_id = auth.uid()
        and gm.role = 'owner'
    )
  );
```

#### 3. Add `garden_invites` table

```sql
create table if not exists garden_invites (
  id            uuid primary key default uuid_generate_v4(),
  garden_id     uuid not null references gardens(id) on delete cascade,
  invited_by    uuid not null references auth.users(id) on delete cascade,
  email         text not null,
  role          text not null check (role in ('edit', 'view')),
  token         uuid not null default uuid_generate_v4(),
  accepted_at   timestamptz,
  expires_at    timestamptz not null default (now() + interval '7 days'),
  created_at    timestamptz not null default now(),
  unique (garden_id, email)
);

create index if not exists garden_invites_token_idx on garden_invites(token);
create index if not exists garden_invites_email_idx on garden_invites(email);

alter table garden_invites enable row level security;

-- Garden owners can see invites for their gardens
create policy "owners can view invites"
  on garden_invites for select using (
    exists (
      select 1 from garden_members gm
      where gm.garden_id = garden_invites.garden_id
        and gm.user_id = auth.uid()
        and gm.role = 'owner'
    )
  );

-- Garden owners can create invites
create policy "owners can create invites"
  on garden_invites for insert with check (
    exists (
      select 1 from garden_members gm
      where gm.garden_id = garden_invites.garden_id
        and gm.user_id = auth.uid()
        and gm.role = 'owner'
    )
  );

-- Garden owners can delete/cancel invites
create policy "owners can delete invites"
  on garden_invites for delete using (
    exists (
      select 1 from garden_members gm
      where gm.garden_id = garden_invites.garden_id
        and gm.user_id = auth.uid()
        and gm.role = 'owner'
    )
  );
```

#### 4. Add `user_tooltip_progress` table

```sql
create table if not exists user_tooltip_progress (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  dismissed     text[] not null default '{}',   -- array of tooltip IDs that have been dismissed
  first_seen_at timestamptz not null default now()
);

alter table user_tooltip_progress enable row level security;

create policy "users can manage own tooltip progress"
  on user_tooltip_progress for all using (auth.uid() = user_id);
```

#### 5. Migrate existing gardens to garden_members

```sql
-- Backfill: every existing garden owner becomes an 'owner' member
insert into garden_members (garden_id, user_id, role)
select id, user_id, 'owner'
from gardens
on conflict (garden_id, user_id) do nothing;
```

#### 6. Update RLS policies on existing tables

Drop old single-owner policies and replace with membership-aware ones.

**gardens table:**
```sql
drop policy if exists "users can view own gardens" on gardens;
drop policy if exists "users can insert own gardens" on gardens;
drop policy if exists "users can update own gardens" on gardens;
drop policy if exists "users can delete own gardens" on gardens;

create policy "garden members can view gardens"
  on gardens for select using (
    exists (
      select 1 from garden_members gm
      where gm.garden_id = gardens.id
        and gm.user_id = auth.uid()
    )
  );

create policy "any user can insert garden"
  on gardens for insert with check (true);
  -- Owner row in garden_members is added by API immediately after insert

create policy "owners can update gardens"
  on gardens for update using (
    exists (
      select 1 from garden_members gm
      where gm.garden_id = gardens.id
        and gm.user_id = auth.uid()
        and gm.role = 'owner'
    )
  );

create policy "owners can delete gardens"
  on gardens for delete using (
    exists (
      select 1 from garden_members gm
      where gm.garden_id = gardens.id
        and gm.user_id = auth.uid()
        and gm.role = 'owner'
    )
  );
```

**crops table:**
```sql
drop policy if exists "users can view own crops" on crops;
drop policy if exists "users can insert own crops" on crops;
drop policy if exists "users can update own crops" on crops;
drop policy if exists "users can delete own crops" on crops;

-- Rename user_id to created_by for clarity (keep user_id as alias for compatibility during migration)
alter table crops rename column user_id to created_by;

create policy "garden members can view crops"
  on crops for select using (
    exists (
      select 1 from garden_members gm
      where gm.garden_id = crops.garden_id
        and gm.user_id = auth.uid()
    )
  );

create policy "edit members can insert crops"
  on crops for insert with check (
    exists (
      select 1 from garden_members gm
      where gm.garden_id = crops.garden_id
        and gm.user_id = auth.uid()
        and gm.role in ('owner', 'edit')
    )
  );

create policy "edit members can update crops"
  on crops for update using (
    exists (
      select 1 from garden_members gm
      where gm.garden_id = crops.garden_id
        and gm.user_id = auth.uid()
        and gm.role in ('owner', 'edit')
    )
  );

-- Owner can delete any crop; edit members can only delete their own
create policy "owners or creators can delete crops"
  on crops for delete using (
    auth.uid() = created_by
    or exists (
      select 1 from garden_members gm
      where gm.garden_id = crops.garden_id
        and gm.user_id = auth.uid()
        and gm.role = 'owner'
    )
  );
```

**conversations table:**
```sql
drop policy if exists "users can view own conversations" on conversations;
drop policy if exists "users can insert own conversations" on conversations;
drop policy if exists "users can delete own conversations" on conversations;

-- Rename user_id to created_by
alter table conversations rename column user_id to created_by;

create policy "garden members can view conversations"
  on conversations for select using (
    exists (
      select 1 from crops c
      join garden_members gm on gm.garden_id = c.garden_id
      where c.id = conversations.crop_id
        and gm.user_id = auth.uid()
    )
  );

create policy "edit members can insert conversations"
  on conversations for insert with check (
    exists (
      select 1 from crops c
      join garden_members gm on gm.garden_id = c.garden_id
      where c.id = conversations.crop_id
        and gm.user_id = auth.uid()
        and gm.role in ('owner', 'edit')
    )
  );

create policy "owners or creators can delete conversations"
  on conversations for delete using (
    auth.uid() = created_by
    or exists (
      select 1 from crops c
      join garden_members gm on gm.garden_id = c.garden_id
      where c.id = conversations.crop_id
        and gm.user_id = auth.uid()
        and gm.role = 'owner'
    )
  );
```

**session_logs table:**
```sql
drop policy if exists "users can view own session logs" on session_logs;
drop policy if exists "users can insert own session logs" on session_logs;
drop policy if exists "users can update own session logs" on session_logs;

-- Rename user_id to created_by
alter table session_logs rename column user_id to created_by;

create policy "garden members can view session logs"
  on session_logs for select using (
    exists (
      select 1 from garden_members gm
      where gm.garden_id = session_logs.garden_id
        and gm.user_id = auth.uid()
    )
  );

create policy "edit members can insert session logs"
  on session_logs for insert with check (
    exists (
      select 1 from garden_members gm
      where gm.garden_id = session_logs.garden_id
        and gm.user_id = auth.uid()
        and gm.role in ('owner', 'edit')
    )
  );

create policy "edit members can update session logs"
  on session_logs for update using (
    exists (
      select 1 from garden_members gm
      where gm.garden_id = session_logs.garden_id
        and gm.user_id = auth.uid()
        and gm.role in ('owner', 'edit')
    )
  );
```

---

## API Changes

### Update all existing API routes

Every API route that currently filters by `user_id` must be updated to use garden membership instead. Key routes to audit and update:

- `app/api/gardens/route.ts` — `GET`: return gardens where user is a member (any role). `POST`: after inserting garden, also insert `owner` row into `garden_members` in the same transaction.
- `app/api/gardens/[id]/route.ts` — `PUT`/`DELETE`: verify requester is garden owner via `garden_members`.
- `app/api/crops/route.ts` — filter by garden membership, not `user_id`.
- `app/api/chat/route.ts` — verify user is an edit member before allowing new messages.
- `app/api/session-log/route.ts` — verify edit membership.
- `app/api/daily-log/route.ts` — verify edit membership; always use garden owner's Google token for sheet logging.

### New API routes to create

#### `POST /api/gardens/[id]/invite`
Send a garden invite.
- Body: `{ email: string, role: 'edit' | 'view' }`
- Verify requester is the garden owner.
- Check if a `garden_invites` row already exists for this `(garden_id, email)` — if so, resend.
- Check if the email already belongs to an existing Supabase user:
  - **Existing user**: insert `garden_invites` row, send invite email via Resend (see email template below).
  - **New user**: call `supabase.auth.admin.inviteUserByEmail(email, { data: { garden_invite_token: token } })` — Supabase sends the magic link. Also insert `garden_invites` row for tracking.
- Return `{ success: true }`.

#### `GET /api/invites/[token]`
Look up an invite by token (used when invited user lands on the app).
- No auth required — token is the credential.
- Return `{ garden_name, invited_by_name, role, expires_at, is_expired }`.

#### `POST /api/invites/[token]/accept`
Accept a pending invite.
- Requires auth (the accepting user must be logged in).
- Verify token is valid and not expired.
- Verify the logged-in user's email matches the invite email.
- Insert row into `garden_members`.
- Mark `garden_invites.accepted_at = now()`.
- Return `{ garden_id }` so the UI can redirect to the garden.

#### `DELETE /api/invites/[token]`
Cancel a pending invite (owner only).

#### `GET /api/gardens/[id]/members`
Return all members + pending invites for a garden.
- Requires owner role.
- Join `garden_members` with `profiles` for display names.
- Include pending `garden_invites` rows (where `accepted_at` is null and `expires_at` > now).

#### `PATCH /api/gardens/[id]/members/[userId]`
Change a member's role.
- Body: `{ role: 'edit' | 'view' }` (cannot change owner's role this way).
- Requires owner.

#### `DELETE /api/gardens/[id]/members/[userId]`
Revoke a member's access.
- Requires owner, or the user removing themselves.

#### `POST /api/gardens/[id]/transfer-ownership`
Transfer garden ownership.
- Body: `{ new_owner_user_id: string }`
- Updates the outgoing owner's `garden_members` role to `'edit'`, updates the new owner's role to `'owner'`.
- Requires current owner.

#### `POST /api/gardens/[id]/share-sheet`
Share the garden's Google Sheet with a member.
- Body: `{ email: string }` — the Google account email to grant editor access.
- Uses the garden owner's stored `user_google_tokens` refresh token.
- Calls Google Drive API `POST /drive/v3/files/{fileId}/permissions` with `role: 'writer'`, `type: 'user'`, `emailAddress`.
- Add this helper to `lib/google-sheets.ts`.

#### `GET/POST /api/me/profile`
Get or update the current user's display name.
- `GET`: return `{ display_name, avatar_url }` from `profiles`.
- `POST` body: `{ display_name: string }` — update `profiles` row.

#### `GET/POST /api/me/tooltip-progress`
- `GET`: return `{ dismissed: string[], first_seen_at }`.
- `POST` body: `{ tooltip_id: string }` — add to dismissed array.

---

## Invite Email Template

Create `supabase/email-templates/garden-invite.html` and use Resend to send it.

The email should include:
- Who invited them and to which garden
- A button linking to `/invites/[token]`
- Note that the link expires in 7 days
- If the recipient doesn't have a GrowLog account, the link will create one via Supabase magic link

---

## New Pages & UI

### `app/invites/[token]/page.tsx` — Invite Accept Page

This is the landing page for invited users.

**Flow — not logged in:**
1. Show garden name and who invited them.
2. Show "Create your account to join" (if new user, Supabase magic link flow) or "Sign in to join" (if existing user).
3. After auth, call `POST /api/invites/[token]/accept` and redirect to the garden.

**Flow — already logged in:**
1. Show garden name, role, inviter's name.
2. "Accept invitation" button → calls `POST /api/invites/[token]/accept` → redirect to garden.
3. "Decline" link → calls `DELETE /api/invites/[token]` → redirect to dashboard.

**Edge cases to handle:**
- Token not found → "This invite link is not valid."
- Token expired → "This invite link has expired. Ask [owner] to send a new one."
- Already a member → "You're already a member of this garden." with link to garden.
- Logged-in user's email doesn't match invite email → "This invite was sent to [email]. Please sign in with that account."

### `app/onboarding/page.tsx` — Updated Onboarding Entry Point

Before rendering the existing onboarding welcome step, check:

```typescript
// If user has a pending invite token in their session metadata (new user via invite),
// redirect to /invites/[token] to accept before showing onboarding.
// If user already has gardens (existing user who was invited), skip onboarding entirely
// and redirect to /dashboard — they'll see the garden invite banner there.
```

Add an invite acceptance banner to `app/dashboard/page.tsx`: if the logged-in user has any pending (unaccepted) invites in `garden_invites` matching their email, show a dismissible banner at the top: *"[Owner] invited you to join [Garden Name]. [Accept] [Decline]"*

### Update `app/settings/page.tsx` — Settings Overhaul

The settings page needs two new sections added after "Garden settings":

#### Section: Garden Members (visible only when selected garden is owned by current user)

- **Member list**: For each member in `garden_members`, show avatar (or initial), display name, email, role badge, and a "..." menu with: Change role / Revoke access / Share Google Sheet.
- **Pending invites**: Show pending invite rows with email, role, expiry, and a "Resend" or "Cancel" option.
- **Invite button**: Opens an inline form with email input and role selector (Edit / View-only). On submit, calls `POST /api/gardens/[id]/invite`.

#### Section: Account (expand existing)

Add a "Display name" field above the Sign out button:
- Show current display name from `profiles`.
- Editable inline — on save, calls `POST /api/me/profile`.
- Show avatar/initial based on display name.

#### Update Garden Delete flow

When deleting a garden that has other members, instead of immediately showing the confirm dialog, first show:

> "**[Garden Name]** has [N] other member(s). What would you like to do?"
> - **Transfer ownership** → dropdown of current members → confirm
> - **Delete for everyone** → confirm dialog noting this removes the garden for all members

---

## Attribution in Conversations

### Database change
The `conversations.created_by` column already stores the user's UUID. No schema change needed — just display it.

### UI change in `app/garden/[id]/page.tsx` (or wherever the chat UI renders)

When rendering conversation messages:
- Join each conversation row with `profiles` to get `display_name`.
- For `role = 'user'` messages, show attribution: small text above or beside the bubble — *"[Display Name]"* — in a muted style.
- For `role = 'assistant'` messages, show "GrowLog AI" or the existing assistant styling.
- This attribution is visible to all members.

### Session logs
In any session log list or garden diary view, show the `created_by` user's display name alongside each log entry.

---

## Google Sheets — Member Without Google Connected

When an edit member submits a chat session:
1. The API looks up the garden owner's token via `gardens.owner_id → user_google_tokens`.
2. If the garden owner has a token, log to the owner's sheet as normal (attribution is in the sheet row).
3. If the member themselves has no Google token and is viewing a settings prompt about Sheets, show:
   > *"Connect Google Sheets to keep a permanent diary of your garden activity. Without it, your session notes won't be saved for future reference."*
   with a "Connect Google Sheets →" link to `/onboarding/sheets`.

Note: Sheet logging always uses the garden owner's credentials, regardless of which member triggered the session. The session log's `created_by` field provides attribution in the spreadsheet rows (update the sheet-logger to include a "Logged by" column if not already present).

---

## Tooltip Walkthrough System

### Overview
A contextual tooltip system that activates for all users and shows tips for 30 days from account creation, or until all tips are dismissed. Tips are dismissible individually. Progress is stored in `user_tooltip_progress`.

### Tooltip IDs and trigger locations

| ID | Trigger location | Message |
|---|---|---|
| `create-garden` | Dashboard, first visit with no gardens | "Start by creating your first garden — give it a name and a location." |
| `create-crop` | Garden page, no crops yet | "Add your first crop. You can track its progress, chat with the AI, and log observations." |
| `voice-input` | Chat input area | "Tap the mic to speak your observation instead of typing." |
| `photo-input` | Chat input area | "Take or upload a photo and the AI will help you identify what it's seeing." |
| `garden-diary` | Session log / diary tab | "Your garden diary saves every session — searchable notes from every conversation." |
| `submit-chat` | Chat input area, first visit | "Describe what you're observing and tap Send. The AI will respond with advice." |
| `navigate-settings` | Bottom nav | "Settings lets you manage your garden, members, and Google Sheets connection." |
| `navigate-crops` | Bottom nav or crop list | "Switch between crops to track each plant individually." |
| `navigate-gardens` | Dashboard | "You can have multiple gardens. Each has its own crops and diary." |

### Entry paths

**New garden creator** (standard onboarding): show tooltips starting from `create-garden` in sequence.

**Invited new user** (no garden of their own): after accepting the invite and landing on the shared garden, start from `create-crop` — skip the garden creation tip since they already have a garden.

**Invited existing user** (already has their own gardens): tooltip system is already running. The invite acceptance just adds the new garden to their list — no special tooltip change.

### Implementation notes
- Create a `TooltipOverlay` component that accepts `tooltipId`, `message`, `targetRef`, and `onDismiss`.
- On mount, check `GET /api/me/tooltip-progress` — if the tip ID is in `dismissed` or `first_seen_at` is more than 30 days ago, do not render.
- On dismiss, call `POST /api/me/tooltip-progress` with the tip ID.
- Tips should be non-blocking (not modal) — a small popover with a dismiss "×" button.

---

## Account Deletion — Shared Garden Guard

Update the account deletion flow (wherever it exists, or add to settings):

Before allowing deletion, check if the user owns any gardens with other active members:

```
GET /api/me/owned-gardens-with-members
→ returns list of gardens where user is owner AND garden has other members
```

If any exist, block deletion with:
> "You own [N] shared garden(s) with other members. Before deleting your account, please transfer ownership or delete each garden."
> List gardens with links to their settings pages.

If no shared gardens, proceed with standard account deletion flow.

---

## Implementation Order

Build in this sequence to avoid breaking the live app:

### Phase 1 — Database foundation (no UI changes yet)
1. Write and run `002_shared_gardens.sql` migration.
2. Backfill existing garden owners into `garden_members`.
3. Backfill existing users into `profiles` (run once via SQL: `insert into profiles select id, coalesce(raw_user_meta_data->>'full_name', split_part(email,'@',1)), raw_user_meta_data->>'avatar_url' from auth.users on conflict do nothing`).
4. Verify existing functionality still works (RLS policies now check `garden_members` but every owner is in that table).

### Phase 2 — Update all existing API routes
Update each route to use membership-based queries instead of `user_id =` filters. Test each endpoint.

Key change pattern — replace:
```typescript
.eq('user_id', user.id)
```
with a join or subquery through `garden_members`.

Also update `POST /api/gardens` to insert the owner row into `garden_members` immediately after creating the garden.

### Phase 3 — Profiles & display names
1. Create `GET/POST /api/me/profile`.
2. Add display name field to Settings → Account section.
3. Update conversation and session log rendering to show display names.

### Phase 4 — Invite system
1. Create `garden_invites` API routes (invite, accept, cancel, list).
2. Create Resend invite email template.
3. Create `app/invites/[token]/page.tsx`.
4. Add invite acceptance banner to dashboard.
5. Update onboarding entry point to handle invited users.

### Phase 5 — Settings: Member Management UI
1. Add Garden Members section to `app/settings/page.tsx`.
2. Implement invite form, member list, role change, revoke.
3. Implement Google Sheet share button per member.

### Phase 6 — Garden deletion guard
Update the delete garden flow in settings to check for other members and offer transfer or delete-all.

### Phase 7 — Tooltip system
1. Create `user_tooltip_progress` API routes.
2. Build `TooltipOverlay` component.
3. Add tooltips at each trigger location.
4. Wire up entry-path logic for invited vs. new users.

---

## Out of Scope (v1)

- Member-to-member notifications (email or push) when someone logs a session
- Transferring ownership to a non-member (must be an existing member)
- Invite links that work without a specific email (open/link-based invites)
- Read receipts or "last seen" for conversations
- Garden-level activity feed / audit log

---

## Environment Variables

No new environment variables required. The invite system uses:
- Existing `RESEND_API_KEY` for invite emails
- Existing Supabase service role key (already in use for admin calls) for `inviteUserByEmail`
- Existing Google OAuth credentials for the Drive API share-sheet call

---

## Testing Checklist

Before shipping each phase, verify:

- [ ] Existing single-user gardens still work identically after migration
- [ ] Garden owner can see their garden; non-members cannot
- [ ] Edit member can add/edit crops; view-only member cannot
- [ ] View-only member can read all conversations but cannot submit a new chat
- [ ] Invite email is sent; new user lands on accept page; accept creates member row
- [ ] Existing user sees in-app banner for pending invites
- [ ] Owner can change role from edit → view and vice versa
- [ ] Owner can revoke access; revoked user immediately loses access
- [ ] Deleting a garden with members prompts transfer or delete-all
- [ ] Session logs always post to garden owner's Google Sheet regardless of who chatted
- [ ] Display names appear in conversation attribution
- [ ] Tooltips appear, are dismissible, and don't reappear after dismissal
- [ ] A member creating their own garden gets their own Sheet on their own Drive
- [ ] Circular membership (A in B's garden, B in A's garden) works without errors
