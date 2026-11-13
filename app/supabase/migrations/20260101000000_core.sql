-- Phase 1-2: tài khoản, profile, cặp đôi, cấu hình, ví xu, màn & từ vựng
-- Quy tắc: xu/token/HP chỉ đổi qua RPC security definer + coin_transactions.

create type user_role as enum ('ADMIN', 'PLAYER');
create type level_status as enum ('LOCKED', 'OPEN', 'COUNTDOWN', 'CLOSED');
create type word_status as enum ('NEW', 'LEARNING', 'MASTERED');

-- ---------- profiles ----------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 20),
  bio text not null default '' check (char_length(bio) <= 150),
  birthday date,
  favorite_color text not null default '#ec4899',
  avatar_url text,
  role user_role not null default 'PLAYER',
  coins int not null default 0 check (coins >= 0),
  army_level int not null default 0 check (army_level between 0 and 10),
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table couples (
  id uuid primary key default gen_random_uuid(),
  player_a uuid not null references profiles(id),
  player_b uuid not null references profiles(id),
  started_at date not null default current_date,
  check (player_a <> player_b)
);

create function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'ADMIN' and deleted_at is null);
$$;

create function partner_of(uid uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select case when player_a = uid then player_b else player_a end
  from couples where player_a = uid or player_b = uid limit 1;
$$;

-- tạo profile tự động khi có user mới (Admin tạo user)
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, role, display_name)
  values (new.id,
          coalesce((new.raw_user_meta_data->>'role')::user_role, 'PLAYER'),
          coalesce(new.raw_user_meta_data->>'display_name', ''));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

alter table profiles enable row level security;
alter table couples enable row level security;

create policy profiles_read on profiles for select to authenticated
  using (id = auth.uid() or id = partner_of(auth.uid()) or is_admin());
create policy profiles_update_own on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- chỉ cho sửa các cột an toàn; coins/role/army_level chỉ đổi qua RPC
revoke update on profiles from authenticated, anon;
grant update (display_name, bio, birthday, favorite_color, avatar_url) on profiles to authenticated;

create policy couples_read on couples for select to authenticated
  using (player_a = auth.uid() or player_b = auth.uid() or is_admin());

-- ---------- game_config ----------
create table game_config (
  key text primary key,
  value jsonb not null,
  unit text,
  description text,
  updated_at timestamptz not null default now()
);
alter table game_config enable row level security;
create policy config_read on game_config for select to authenticated using (true);
create policy config_admin_write on game_config for all to authenticated
  using (is_admin()) with check (is_admin());

create function cfg_num(k text) returns numeric
language sql stable security definer set search_path = public as $$
  select (value #>> '{}')::numeric from game_config where key = k;
$$;

-- ---------- sổ cái xu ----------
create type coin_reason as enum
  ('START','LEVEL_WIN','LEVEL_LOSE','LEVEL_DRAW','TYPING','STUDY_BONUS','LOOT','PURCHASE','UPGRADE','REPAIR','SHIELD');

create table coin_transactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id),
  amount int not null,
  reason coin_reason not null,
  ref_id text,
  created_at timestamptz not null default now()
);
create index on coin_transactions (user_id, created_at desc);
alter table coin_transactions enable row level security;
create policy tx_read_own on coin_transactions for select to authenticated using (user_id = auth.uid());

-- Hàm dùng chung cho mọi RPC khác: đổi xu + ghi sổ cái, chặn số dư âm
create function apply_coins(p_user uuid, p_amount int, p_reason coin_reason, p_ref text default null)
returns int language plpgsql security definer set search_path = public as $$
declare v_new int;
begin
  update profiles set coins = coins + p_amount where id = p_user returning coins into v_new;
  if v_new is null then raise exception 'USER_NOT_FOUND'; end if;
  insert into coin_transactions (user_id, amount, reason, ref_id) values (p_user, p_amount, p_reason, p_ref);
  return v_new;
exception when check_violation then
  raise exception 'NOT_ENOUGH_COINS';
end $$;
revoke all on function apply_coins from public, anon, authenticated;

-- ---------- nhà (tạo ở onboarding) ----------
create table user_house (
  user_id uuid primary key references profiles(id) on delete cascade,
  level int not null default 0 check (level between 0 and 5),
  hp int not null default 200 check (hp >= 0),
  max_hp int not null default 200,
  updated_at timestamptz not null default now()
);
alter table user_house enable row level security;
create policy house_read on user_house for select to authenticated
  using (user_id = auth.uid() or user_id = partner_of(auth.uid()));

-- ---------- PRO-01: onboarding ----------
create function complete_onboarding(p_name text, p_color text, p_avatar_url text default null)
returns profiles language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_row profiles;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if char_length(trim(p_name)) not between 2 and 20 then raise exception 'INVALID_NAME'; end if;
  if p_color !~ '^#[0-9a-fA-F]{6}$' then raise exception 'INVALID_COLOR'; end if;
  if (select onboarded_at from profiles where id = v_uid) is not null then raise exception 'ALREADY_ONBOARDED'; end if;

  update profiles set display_name = trim(p_name), favorite_color = p_color,
    avatar_url = p_avatar_url, onboarded_at = now() where id = v_uid;
  insert into user_house (user_id) values (v_uid) on conflict do nothing;
  perform apply_coins(v_uid, coalesce(cfg_num('STARTING_COINS'), 500)::int, 'START', 'onboarding');
  select * into v_row from profiles where id = v_uid;
  return v_row;
end $$;
revoke all on function complete_onboarding from public, anon;
grant execute on function complete_onboarding to authenticated;

-- ---------- levels & words ----------
create table levels (
  id uuid primary key default gen_random_uuid(),
  order_no int not null unique,
  topic_en text not null,
  topic_vi text not null,
  cefr text not null,
  word_count int not null,
  question_count int not null,
  seconds_per_question int not null,
  question_types text[] not null,
  reward_multiplier numeric not null default 1,
  status level_status not null default 'LOCKED',
  seed int not null default (floor(random() * 2147483647))::int,
  opened_at timestamptz,
  first_finished_at timestamptz,
  deadline_at timestamptz,
  closed_at timestamptz,
  rewarded_at timestamptz,
  winner_id uuid references profiles(id),
  is_draw boolean not null default false
);
alter table levels enable row level security;
create policy levels_read on levels for select to authenticated using (true);
create policy levels_admin_write on levels for all to authenticated
  using (is_admin() and status = 'OPEN' or is_admin() and status = 'LOCKED')
  with check (is_admin());

create table words (
  id uuid primary key default gen_random_uuid(),
  level_id uuid not null references levels(id) on delete cascade,
  word text not null,
  ipa text,
  part_of_speech text,
  meanings_vi text[] not null check (array_length(meanings_vi, 1) >= 1),
  example_en text,
  example_vi text,
  image_url text,
  unique (level_id, word)
);
create index on words (level_id);
alter table words enable row level security;
-- Học được khi màn đã mở (không phải KHÓA); admin xem tất cả
create policy words_read on words for select to authenticated
  using (is_admin() or exists (select 1 from levels l where l.id = level_id and l.status <> 'LOCKED'));
create policy words_admin_write on words for all to authenticated
  using (is_admin() and exists (select 1 from levels l where l.id = level_id and l.status in ('OPEN','LOCKED')))
  with check (is_admin());

-- ---------- tiến độ học ----------
create table word_progress (
  user_id uuid not null references profiles(id) on delete cascade,
  word_id uuid not null references words(id) on delete cascade,
  status word_status not null default 'NEW',
  correct_count int not null default 0,
  wrong_count int not null default 0,
  last_seen_at timestamptz not null default now(),
  primary key (user_id, word_id)
);
alter table word_progress enable row level security;
create policy wp_own on word_progress for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create table study_progress (
  user_id uuid not null references profiles(id) on delete cascade,
  level_id uuid not null references levels(id) on delete cascade,
  flashcards_completed_at timestamptz,
  bonus_claimed boolean not null default false,
  primary key (user_id, level_id)
);
alter table study_progress enable row level security;
create policy sp_read_own on study_progress for select to authenticated using (user_id = auth.uid());

-- LRN-02/04: đánh dấu thẻ; lật hết thẻ lần đầu → +FIRST_STUDY_BONUS (1 lần/chủ đề)
create function mark_word(p_word uuid, p_known boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists (select 1 from words w join levels l on l.id = w.level_id
                 where w.id = p_word and l.status <> 'LOCKED') then raise exception 'LEVEL_LOCKED'; end if;
  insert into word_progress (user_id, word_id, status, correct_count, wrong_count)
  values (v_uid, p_word, (case when p_known then 'MASTERED' else 'LEARNING' end)::word_status,
          case when p_known then 1 else 0 end, case when p_known then 0 else 1 end)
  on conflict (user_id, word_id) do update set
    status = case when p_known then 'MASTERED'::word_status else 'LEARNING'::word_status end,
    correct_count = word_progress.correct_count + (case when p_known then 1 else 0 end),
    wrong_count = word_progress.wrong_count + (case when p_known then 0 else 1 end),
    last_seen_at = now();
end $$;

create function finish_flashcards(p_level uuid) returns int
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_bonus int := 0; v_claimed boolean;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists (select 1 from levels where id = p_level and status <> 'LOCKED') then raise exception 'LEVEL_LOCKED'; end if;
  -- phải đã đánh dấu mọi từ của chủ đề
  if exists (select 1 from words w where w.level_id = p_level
             and not exists (select 1 from word_progress p where p.user_id = v_uid and p.word_id = w.id))
     or not exists (select 1 from words where level_id = p_level) then
    raise exception 'NOT_ALL_CARDS_SEEN';
  end if;
  insert into study_progress (user_id, level_id, flashcards_completed_at)
  values (v_uid, p_level, now()) on conflict (user_id, level_id) do nothing;
  select bonus_claimed into v_claimed from study_progress where user_id = v_uid and level_id = p_level for update;
  if not v_claimed then
    v_bonus := coalesce(cfg_num('FIRST_STUDY_BONUS'), 30)::int;
    update study_progress set bonus_claimed = true where user_id = v_uid and level_id = p_level;
    perform apply_coins(v_uid, v_bonus, 'STUDY_BONUS', p_level::text);
  end if;
  return v_bonus;
end $$;
revoke all on function mark_word, finish_flashcards from public, anon;
grant execute on function mark_word, finish_flashcards to authenticated;

-- ---------- Storage: avatar ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/webp','image/png','image/jpeg'])
on conflict (id) do nothing;
create policy avatars_read on storage.objects for select using (bucket_id = 'avatars');
create policy avatars_write on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and name like auth.uid()::text || '%');
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and name like auth.uid()::text || '%');
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and name like auth.uid()::text || '%');
