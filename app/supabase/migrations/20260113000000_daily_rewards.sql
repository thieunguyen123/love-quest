-- Phase 13 (sheet 1 mục K): DAY-01 điểm danh 7 ngày · DAY-02 nhiệm vụ ngày · DAY-03 rương chăm chỉ & thưởng đôi.
-- Mọi xu đi qua apply_coins (ghi coin_transactions); tiến độ nhiệm vụ tính ở server từ dữ liệu trong ngày (giờ VN).

alter type coin_reason add value if not exists 'DAILY_LOGIN';
alter type coin_reason add value if not exists 'QUEST';

insert into game_config (key, value, unit, description) values
  ('LOGIN_BASE_COINS', '250', 'xu', 'Điểm danh ngày 1 của chuỗi (DAY-01)'),
  ('LOGIN_STEP_COINS', '50', 'xu', 'Mỗi ngày điểm danh liên tiếp cộng thêm (ngày n = BASE + STEP×(n−1))'),
  ('LOGIN_STREAK_DAYS', '7', 'ngày', 'Độ dài chuỗi; sau ngày cuối quay về ngày 1'),
  ('LOGIN_DAY7_PET_TOKENS', '1', '🐾', 'Ngày cuối chuỗi tặng thêm Nâng cấp thú cưng'),
  ('QUEST_ALL_BONUS_COINS', '200', 'xu', 'Rương chăm chỉ: nhận hết nhiệm vụ trong ngày (DAY-03)'),
  ('QUEST_ALL_PET_TOKENS', '1', '🐾', 'Rương chăm chỉ tặng thêm Nâng cấp thú cưng'),
  ('COUPLE_QUEST_BONUS_COINS', '150', 'xu', 'Thưởng đôi: cả hai cùng mở rương trong ngày')
on conflict (key) do nothing;

-- ---------- DAY-01 ----------
create table daily_logins (
  user_id uuid not null references profiles(id) on delete cascade,
  day date not null,
  streak int not null,          -- ngày thứ mấy của chuỗi (1..LOGIN_STREAK_DAYS)
  coins int not null,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table daily_logins enable row level security;
create policy dl_read_own on daily_logins for select to authenticated using (user_id = auth.uid());

-- ngày chuỗi sẽ nhận nếu điểm danh hôm nay (hoặc đã nhận hôm nay)
create function _login_streak_today(p_user uuid) returns int language sql stable security definer set search_path = public as $$
  select coalesce(
    (select streak from daily_logins where user_id = p_user and day = vn_today()),
    (select case when streak < greatest(1, coalesce(cfg_num('LOGIN_STREAK_DAYS'), 7)::int) then streak + 1 else 1 end
       from daily_logins where user_id = p_user and day = vn_today() - 1),
    1)
$$;
revoke all on function _login_streak_today from public, anon, authenticated;

create function _login_coins(p_streak int) returns int language sql stable set search_path = public as $$
  select (coalesce(cfg_num('LOGIN_BASE_COINS'), 250) + coalesce(cfg_num('LOGIN_STEP_COINS'), 50) * (p_streak - 1))::int
$$;

create function claim_daily_login() returns jsonb language plpgsql security definer set search_path = public as $$
declare v uuid := auth.uid(); v_streak int; v_coins int; v_tok int := 0; v_len int;
begin
  if v is null then raise exception 'NOT_AUTHENTICATED'; end if;
  perform 1 from profiles where id = v for update;   -- khoá: 2 tab bấm cùng lúc
  if exists (select 1 from daily_logins where user_id = v and day = vn_today()) then raise exception 'ALREADY_CLAIMED'; end if;
  v_streak := _login_streak_today(v);
  v_coins := _login_coins(v_streak);
  v_len := greatest(1, coalesce(cfg_num('LOGIN_STREAK_DAYS'), 7)::int);
  insert into daily_logins (user_id, day, streak, coins) values (v, vn_today(), v_streak, v_coins);
  perform apply_coins(v, v_coins, 'DAILY_LOGIN', 'day' || v_streak);
  if v_streak = v_len then
    v_tok := coalesce(cfg_num('LOGIN_DAY7_PET_TOKENS'), 0)::int;
    if v_tok > 0 then perform grant_item(v, 'PET_UPGRADE', v_tok); end if;
  end if;
  return jsonb_build_object('streak', v_streak, 'coins', v_coins, 'pet_tokens', v_tok);
end $$;
revoke all on function claim_daily_login from public, anon;
grant execute on function claim_daily_login to authenticated;

-- ---------- DAY-02 ----------
create table quests (
  code text primary key,
  emoji text not null default '⭐',
  title_vi text not null,
  metric text not null check (metric in ('STUDY_WORDS', 'TYPING_GAMES', 'TYPING_WORDS', 'LEVEL_SUBMITS', 'CORRECT_ANSWERS', 'ATTACKS')),
  target int not null check (target > 0),
  reward_coins int not null check (reward_coins >= 0),
  optional boolean not null default false,     -- không bắt buộc để mở rương (vd tấn công: có thể bị khiên chặn)
  active boolean not null default true,
  sort int not null default 0,
  href text                                     -- trang để làm nhiệm vụ
);
alter table quests enable row level security;
create policy quests_read on quests for select to authenticated using (true);
create policy quests_admin on quests for all to authenticated using (is_admin()) with check (is_admin());

insert into quests (code, emoji, title_vi, metric, target, reward_coins, optional, sort, href) values
  ('study10',   '📖', 'Ôn 10 từ vựng (thẻ học)',            'STUDY_WORDS',     10, 100, false, 1, '/learn'),
  ('typing2',   '🌧️', 'Chơi 2 ván Mưa chữ',                 'TYPING_GAMES',     2, 100, false, 2, '/learn/typing'),
  ('typing40',  '🎯', 'Bắn trúng 40 chữ trong Mưa chữ',      'TYPING_WORDS',    40, 120, false, 3, '/learn/typing'),
  ('level1',    '🏆', 'Nộp 1 lượt thi đấu hoặc luyện tập',   'LEVEL_SUBMITS',    1, 100, false, 4, '/levels'),
  ('correct15', '✅', 'Trả lời đúng 15 câu hỏi',              'CORRECT_ANSWERS', 15, 120, false, 5, '/levels'),
  ('attack1',   '⚔️', 'Tấn công nhà người ấy 1 lần',         'ATTACKS',          1,  80, true,  6, '/base/partner')
on conflict (code) do nothing;

create table quest_claims (
  user_id uuid not null references profiles(id) on delete cascade,
  day date not null,
  code text not null,          -- mã nhiệm vụ, hoặc '_ALL' (rương), '_COUPLE' (thưởng đôi)
  coins int not null,
  created_at timestamptz not null default now(),
  primary key (user_id, day, code)
);
alter table quest_claims enable row level security;
create policy qc_read_own on quest_claims for select to authenticated using (user_id = auth.uid());

-- tiến độ 1 chỉ số trong ngày VN
create function _quest_progress(p_user uuid, p_metric text, p_day date) returns int language plpgsql stable security definer set search_path = public as $$
declare t0 timestamptz := (p_day::timestamp at time zone 'Asia/Ho_Chi_Minh'); t1 timestamptz := t0 + interval '1 day'; n int;
begin
  case p_metric
    when 'STUDY_WORDS' then select count(*) into n from word_progress where user_id = p_user and last_seen_at >= t0 and last_seen_at < t1;
    when 'TYPING_GAMES' then select count(*) into n from typing_sessions where user_id = p_user and words_hit > 0 and created_at >= t0 and created_at < t1;
    when 'TYPING_WORDS' then select coalesce(sum(words_hit), 0) into n from typing_sessions where user_id = p_user and created_at >= t0 and created_at < t1;
    when 'LEVEL_SUBMITS' then select count(*) into n from level_attempts where user_id = p_user and status = 'SUBMITTED' and submitted_at >= t0 and submitted_at < t1;
    when 'CORRECT_ANSWERS' then select coalesce(sum(correct_count), 0) into n from level_attempts where user_id = p_user and status = 'SUBMITTED' and submitted_at >= t0 and submitted_at < t1;
    when 'ATTACKS' then select count(*) into n from attacks where attacker_id = p_user and status = 'DONE' and finished_at >= t0 and finished_at < t1;
    else n := 0;
  end case;
  return coalesce(n, 0);
end $$;
revoke all on function _quest_progress from public, anon, authenticated;

-- đã nhận hết nhiệm vụ bắt buộc hôm nay?
create function _quests_all_claimed(p_user uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from quests where active and not optional)
     and not exists (select 1 from quests q where q.active and not q.optional
                     and not exists (select 1 from quest_claims c where c.user_id = p_user and c.day = vn_today() and c.code = q.code))
$$;
revoke all on function _quests_all_claimed from public, anon, authenticated;

create function claim_quest(p_code text) returns jsonb language plpgsql security definer set search_path = public as $$
declare v uuid := auth.uid(); q quests%rowtype; v_coins int; v_tok int := 0; v_partner uuid;
begin
  if v is null then raise exception 'NOT_AUTHENTICATED'; end if;
  perform 1 from profiles where id = v for update;
  if exists (select 1 from quest_claims where user_id = v and day = vn_today() and code = p_code) then raise exception 'ALREADY_CLAIMED'; end if;
  if p_code = '_ALL' then
    if not _quests_all_claimed(v) then raise exception 'QUEST_NOT_DONE'; end if;
    v_coins := coalesce(cfg_num('QUEST_ALL_BONUS_COINS'), 0)::int;
    v_tok := coalesce(cfg_num('QUEST_ALL_PET_TOKENS'), 0)::int;
  elsif p_code = '_COUPLE' then
    v_partner := partner_of(v);
    if v_partner is null then raise exception 'NO_PARTNER'; end if;
    if not exists (select 1 from quest_claims where user_id = v and day = vn_today() and code = '_ALL')
       or not exists (select 1 from quest_claims where user_id = v_partner and day = vn_today() and code = '_ALL') then
      raise exception 'QUEST_NOT_DONE';
    end if;
    v_coins := coalesce(cfg_num('COUPLE_QUEST_BONUS_COINS'), 0)::int;
  else
    select * into q from quests where code = p_code and active;
    if not found then raise exception 'QUEST_NOT_FOUND'; end if;
    if _quest_progress(v, q.metric, vn_today()) < q.target then raise exception 'QUEST_NOT_DONE'; end if;
    v_coins := q.reward_coins;
  end if;
  insert into quest_claims (user_id, day, code, coins) values (v, vn_today(), p_code, v_coins);
  if v_coins > 0 then perform apply_coins(v, v_coins, 'QUEST', p_code); end if;
  if v_tok > 0 then perform grant_item(v, 'PET_UPGRADE', v_tok); end if;
  if p_code = '_ALL' then
    v_partner := partner_of(v);
    if v_partner is not null then
      perform notify(v_partner, 'QUEST', '🧰 Người ấy đã mở Rương chăm chỉ hôm nay',
        case when exists (select 1 from quest_claims where user_id = v_partner and day = vn_today() and code = '_ALL')
             then 'Cả hai đã xong — vào 🎁 nhận 💞 Thưởng đôi!' else 'Làm xong nhiệm vụ để cả hai cùng nhận 💞 Thưởng đôi' end);
    end if;
  end if;
  return jsonb_build_object('coins', v_coins, 'pet_tokens', v_tok);
end $$;
revoke all on function claim_quest from public, anon;
grant execute on function claim_quest to authenticated;

-- Toàn bộ trạng thái bảng 🎁 (điểm danh + nhiệm vụ + rương + thưởng đôi)
create function daily_rewards_status() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v uuid := auth.uid(); v_len int := greatest(1, coalesce(cfg_num('LOGIN_STREAK_DAYS'), 7)::int);
  v_streak int; v_claimed boolean; v_partner uuid; v_quests jsonb;
begin
  if v is null then raise exception 'NOT_AUTHENTICATED'; end if;
  v_streak := _login_streak_today(v);
  v_claimed := exists (select 1 from daily_logins where user_id = v and day = vn_today());
  v_partner := partner_of(v);
  select coalesce(jsonb_agg(jsonb_build_object(
      'code', q.code, 'emoji', q.emoji, 'title', q.title_vi, 'target', q.target, 'reward', q.reward_coins, 'optional', q.optional, 'href', q.href,
      'progress', least(q.target, _quest_progress(v, q.metric, vn_today())),
      'claimed', exists (select 1 from quest_claims c where c.user_id = v and c.day = vn_today() and c.code = q.code)
    ) order by q.sort, q.code), '[]'::jsonb)
  into v_quests from quests q where q.active;
  return jsonb_build_object(
    'day', vn_today(),
    'login', jsonb_build_object('claimed', v_claimed, 'streak', v_streak, 'length', v_len,
      'rewards', (select jsonb_agg(_login_coins(i) order by i) from generate_series(1, v_len) i),
      'last_tokens', coalesce(cfg_num('LOGIN_DAY7_PET_TOKENS'), 0)),
    'quests', v_quests,
    'chest', jsonb_build_object('ready', _quests_all_claimed(v),
      'claimed', exists (select 1 from quest_claims where user_id = v and day = vn_today() and code = '_ALL'),
      'coins', coalesce(cfg_num('QUEST_ALL_BONUS_COINS'), 0), 'pet_tokens', coalesce(cfg_num('QUEST_ALL_PET_TOKENS'), 0)),
    'couple', jsonb_build_object('has_partner', v_partner is not null,
      'partner_done', v_partner is not null and exists (select 1 from quest_claims where user_id = v_partner and day = vn_today() and code = '_ALL'),
      'claimed', exists (select 1 from quest_claims where user_id = v and day = vn_today() and code = '_COUPLE'),
      'coins', coalesce(cfg_num('COUPLE_QUEST_BONUS_COINS'), 0))
  );
end $$;
revoke all on function daily_rewards_status from public, anon;
grant execute on function daily_rewards_status to authenticated;

-- dọn dữ liệu thưởng ngày khi reset game (chỉ dùng cho test)
create or replace function dev_reset_game() returns void language plpgsql security definer set search_path = public as $$
declare t text;
begin
  foreach t in array array['attacks','shields','attempt_answers','level_attempts','user_weapons','user_pets','user_army',
    'typing_sessions','daily_counters','inventory','notifications','coin_transactions','word_progress','study_progress','admin_logs',
    'base_layout','user_decor','user_defenses','base_clear','user_styles','training','user_factories','push_subscriptions','daily_logins','quest_claims']
  loop
    if to_regclass('public.' || t) is not null then execute format('delete from %I where true', t); end if;
  end loop;
  update profiles set coins = 0, army_level = 0, onboarded_at = null, display_name = '' where id is not null;
  delete from user_house where true;
  update levels set status = case when order_no = 1 then 'OPEN'::level_status else 'LOCKED'::level_status end,
    opened_at = case when order_no = 1 then now() else null end,
    first_finished_at = null, deadline_at = null, closed_at = null, rewarded_at = null, winner_id = null, is_draw = false,
    seed = (floor(random() * 2147483647))::int where true;
end $$;
revoke all on function dev_reset_game from public, anon, authenticated;
grant execute on function dev_reset_game to service_role;

