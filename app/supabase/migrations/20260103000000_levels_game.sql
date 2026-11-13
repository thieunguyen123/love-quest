-- Phase 4: màn chơi thi đấu (LVL-01..12). Chấm điểm, thời gian, thắng/thua, thưởng đều ở server.

create type attempt_mode as enum ('RANKED', 'PRACTICE');
create type attempt_status as enum ('IN_PROGRESS', 'SUBMITTED');

create table level_attempts (
  id uuid primary key default gen_random_uuid(),
  level_id uuid not null references levels(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  mode attempt_mode not null,
  status attempt_status not null default 'IN_PROGRESS',
  seed int not null,
  question_count int not null,
  seconds_per_question int not null,
  started_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  submitted_at timestamptz,
  score int not null default 0,
  correct_count int not null default 0,
  total_time_ms bigint not null default 0,
  max_combo int not null default 0,
  combo int not null default 0,
  current_index int not null default 0
);
-- LVL-04: mỗi người chỉ 1 lượt TÍNH ĐIỂM / màn
create unique index level_attempts_ranked_once on level_attempts (level_id, user_id) where mode = 'RANKED';
create index on level_attempts (user_id, started_at desc);

create table attempt_answers (
  id bigint generated always as identity primary key,
  attempt_id uuid not null references level_attempts(id) on delete cascade,
  q_index int not null,
  q_type text not null,
  word_id uuid not null references words(id),
  served_at timestamptz not null default now(),
  answered_at timestamptz,
  answer text,
  is_correct boolean,
  time_ms int,
  points int not null default 0,
  unique (attempt_id, q_index)
);
alter table level_attempts enable row level security;
alter table attempt_answers enable row level security;
-- Chỉ đọc lượt của mình. Điểm người ấy chỉ lấy qua level_overview (LVL-06: ẩn điểm đối thủ)
create policy la_read_own on level_attempts for select to authenticated using (user_id = auth.uid());
create policy aa_read_own on attempt_answers for select to authenticated
  using (exists (select 1 from level_attempts a where a.id = attempt_id and a.user_id = auth.uid()));
alter publication supabase_realtime add table levels;

-- Hook buff xu (Phase 5 ghi đè để thêm buff Mèo mướp)
create function coin_bonus_pct(p_user uuid) returns numeric language sql stable as $$ select 0::numeric $$;

-- ---------- công thức thuần (có twin TypeScript + unit test) ----------
create function calc_points(p_correct boolean, p_t_ms int, p_limit_ms int, p_streak int,
  p_base int, p_speed_max int, p_step int, p_cap int) returns jsonb
language sql immutable as $$
  select case when not p_correct then jsonb_build_object('base', 0, 'speed', 0, 'combo', 0, 'total', 0) else (
    with x as (
      select p_base as b,
             round(p_speed_max * greatest(0, p_limit_ms - p_t_ms)::numeric / p_limit_ms)::int as s,
             case when p_streak >= 2 then least(p_step * (p_streak - 1), p_cap) else 0 end as c
    ) select jsonb_build_object('base', b, 'speed', s, 'combo', c, 'total', b + s + c) from x) end
$$;

create function level_win_coins(p_order int, p_mult numeric) returns int
language sql stable security definer set search_path = public as $$
  select round((cfg_num('WIN_BASE_COINS') + cfg_num('WIN_STEP_COINS') * (p_order - 1)) * p_mult)::int
$$;

-- ---------- sinh câu hỏi xác định theo seed (2 người cùng đề) ----------
-- Trả về jsonb: word_id, type, public (gửi client), accept (đáp án chấp nhận), display (đáp án hiển thị), map (MATCH)
create function _build_question(p_level uuid, p_seed int, p_idx int, p_types text[]) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  ids uuid[]; n int; wid uuid; w words%rowtype; t text; nt int := greatest(coalesce(array_length(p_types, 1), 0), 1);
  d_vi text[]; d_en text[]; opts jsonb; pub jsonb; accept jsonb; display text; letters jsonb;
  en_ids uuid[]; vi_ids uuid[]; map jsonb;
begin
  select array_agg(id order by md5(p_seed::text || id::text)) into ids from words where level_id = p_level;
  n := coalesce(array_length(ids, 1), 0);
  if n < 4 then raise exception 'NOT_ENOUGH_WORDS'; end if;
  wid := ids[(p_idx % n) + 1];
  select * into w from words where id = wid;
  t := coalesce(p_types[(p_idx % nt) + 1], 'MC_EN_VN');
  if t = 'FILL' and (w.example_en is null or position(lower(w.word) in lower(w.example_en)) = 0) then t := 'MC_EN_VN'; end if;
  if t = 'SPELL' and length(regexp_replace(w.word, '\s', '', 'g')) < 3 then t := 'MC_VN_EN'; end if;

  -- 3 đáp án nhiễu tiếng Anh / tiếng Việt (khác nghĩa, ổn định theo seed)
  select array_agg(m order by k) into d_vi from (
    select m, min(k) k from (
      select w2.meanings_vi[1] m, md5(p_seed::text || p_idx::text || w2.id::text) k
      from words w2 where w2.level_id = p_level and w2.id <> wid and not (w2.meanings_vi[1] = any (w.meanings_vi))) x
    group by m order by min(k) limit 3) y;
  select array_agg(word order by k) into d_en from (
    select w2.word, md5(p_seed::text || p_idx::text || w2.id::text) k
    from words w2 where w2.level_id = p_level and w2.id <> wid and lower(w2.word) <> lower(w.word)
    order by k limit 3) y;
  if coalesce(array_length(d_vi, 1), 0) < 3 or coalesce(array_length(d_en, 1), 0) < 3 then raise exception 'NOT_ENOUGH_DISTINCT_WORDS'; end if;

  if t = 'MC_EN_VN' then
    select jsonb_agg(o order by md5(p_seed::text || 'o' || p_idx::text || o)) into opts from unnest(d_vi || w.meanings_vi[1]) o;
    pub := jsonb_build_object('prompt', w.word, 'speak', w.word, 'options', opts);
    accept := to_jsonb(w.meanings_vi); display := w.meanings_vi[1];
  elsif t in ('MC_VN_EN', 'LISTEN', 'FILL') then
    select jsonb_agg(o order by md5(p_seed::text || 'o' || p_idx::text || o)) into opts from unnest(d_en || w.word) o;
    if t = 'MC_VN_EN' then pub := jsonb_build_object('prompt', w.meanings_vi[1], 'options', opts);
    elsif t = 'LISTEN' then pub := jsonb_build_object('speak', w.word, 'options', opts);
    else pub := jsonb_build_object('prompt', w.meanings_vi[1],
      'sentence', regexp_replace(w.example_en, w.word, '_____', 'i'), 'options', opts); end if;
    accept := jsonb_build_array(lower(w.word)); display := w.word;
  elsif t = 'SPELL' then
    select jsonb_agg(ch order by md5(p_seed::text || 's' || p_idx::text || pos::text)) into letters
    from (select substr(lower(regexp_replace(w.word, '\s', '', 'g')), g, 1) ch, g pos
          from generate_series(1, length(regexp_replace(w.word, '\s', '', 'g'))) g) z;
    pub := jsonb_build_object('prompt', w.meanings_vi[1], 'letters', letters);
    accept := jsonb_build_array(lower(regexp_replace(w.word, '\s', '', 'g'))); display := w.word;
  else -- MATCH
    select array_agg(id order by k) into en_ids from (
      select id, md5(p_seed::text || 'm' || p_idx::text || id::text) k from words where level_id = p_level and id <> wid order by k limit 3) q;
    en_ids := wid || en_ids;
    select array_agg(id order by md5(p_seed::text || 'v' || p_idx::text || id::text)) into vi_ids from unnest(en_ids) id;
    select jsonb_agg(array_position(vi_ids, e) - 1 order by ord) into map from unnest(en_ids) with ordinality u(e, ord);
    pub := jsonb_build_object('pairs_en', (select jsonb_agg(w3.word order by ord) from unnest(en_ids) with ordinality u(e, ord) join words w3 on w3.id = u.e),
                              'pairs_vi', (select jsonb_agg(w3.meanings_vi[1] order by ord) from unnest(vi_ids) with ordinality u(e, ord) join words w3 on w3.id = u.e));
    accept := map; display := 'MATCH';
  end if;
  return jsonb_build_object('word_id', wid, 'type', t, 'public', pub, 'accept', accept, 'display', display, 'map', map);
end $$;
revoke all on function _build_question from public, anon, authenticated;

-- ---------- vòng đời lượt chơi ----------
create function start_attempt(p_level uuid, p_mode attempt_mode default 'RANKED') returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid := auth.uid(); l levels%rowtype; a level_attempts%rowtype; v_id uuid; v_cnt int;
begin
  if v is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into l from levels where id = p_level;
  if l.id is null then raise exception 'LEVEL_NOT_FOUND'; end if;
  select count(*) into v_cnt from words where level_id = p_level;
  if v_cnt < 4 then raise exception 'NOT_ENOUGH_WORDS'; end if;

  if p_mode = 'RANKED' then
    if l.status = 'LOCKED' then raise exception 'LEVEL_LOCKED'; end if;
    if l.status = 'CLOSED' then raise exception 'LEVEL_CLOSED'; end if;
    if l.status = 'COUNTDOWN' and l.deadline_at <= now() then raise exception 'LEVEL_CLOSED'; end if;
    select * into a from level_attempts where level_id = p_level and user_id = v and mode = 'RANKED';
    if a.id is not null then
      if a.status = 'IN_PROGRESS' then return a.id; end if;  -- quay lại chơi tiếp (LVL-04)
      raise exception 'ALREADY_PLAYED';
    end if;
    insert into level_attempts (level_id, user_id, mode, seed, question_count, seconds_per_question)
    values (p_level, v, 'RANKED', l.seed, l.question_count, l.seconds_per_question) returning id into v_id;
  else
    if l.status = 'LOCKED' then raise exception 'LEVEL_LOCKED'; end if;
    insert into level_attempts (level_id, user_id, mode, seed, question_count, seconds_per_question)
    values (p_level, v, 'PRACTICE', (floor(random() * 2147483647))::int, least(10, l.question_count), l.seconds_per_question) returning id into v_id;
  end if;
  return v_id;
end $$;

-- Kết thúc lượt (nội bộ, dùng chung cho nộp bài / hết hạn): chuyển trạng thái màn
create function _submit(p_attempt uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a level_attempts%rowtype; l levels%rowtype; v_partner uuid; v_other level_attempts%rowtype;
begin
  select * into a from level_attempts where id = p_attempt for update;
  if a.status = 'SUBMITTED' then return; end if;
  update level_attempts set status = 'SUBMITTED', submitted_at = now() where id = p_attempt;
  if a.mode <> 'RANKED' then return; end if;

  select * into l from levels where id = a.level_id for update;
  v_partner := partner_of(a.user_id);
  select * into v_other from level_attempts where level_id = a.level_id and user_id = v_partner and mode = 'RANKED';
  if v_other.id is not null and v_other.status = 'SUBMITTED' then
    perform close_level(a.level_id);           -- người thứ 2 xong → đóng ngay
  elsif l.status = 'OPEN' then                  -- người đầu tiên → đếm ngược
    update levels set status = 'COUNTDOWN', first_finished_at = now(),
      deadline_at = now() + make_interval(hours => cfg_num('LEVEL_LOCK_HOURS')::int, mins => round((cfg_num('LEVEL_LOCK_HOURS') - floor(cfg_num('LEVEL_LOCK_HOURS'))) * 60)::int)
      where id = a.level_id;
    if v_partner is not null then
      perform notify(v_partner, 'PARTNER_FINISHED', 'Người ấy đã hoàn thành màn ' || l.order_no,
        'Bạn có 48 giờ để chơi màn "' || l.topic_vi || '" ⏳', jsonb_build_object('level', l.order_no));
    end if;
  end if;
end $$;
revoke all on function _submit from public, anon, authenticated;

create function submit_attempt(p_attempt uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a level_attempts%rowtype;
begin
  select * into a from level_attempts where id = p_attempt and user_id = auth.uid();
  if a.id is null then raise exception 'ATTEMPT_NOT_FOUND'; end if;
  perform _submit(p_attempt);
  select * into a from level_attempts where id = p_attempt;
  return jsonb_build_object('score', a.score, 'correct', a.correct_count, 'total', a.question_count, 'max_combo', a.max_combo, 'time_ms', a.total_time_ms);
end $$;

-- Phát câu hỏi kế tiếp (ghi served_at ở server). Xử lý hết giờ & quay lại sau khi đóng tab.
create function next_question(p_attempt uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  a level_attempts%rowtype; l levels%rowtype; r attempt_answers%rowtype; q jsonb; v_idx int; v_limit int;
  v_grace int := coalesce(cfg_num('NETWORK_GRACE_MS'), 1000)::int;
  v_resume int := coalesce(cfg_num('LEVEL_RESUME_MINUTES'), 10)::int;
begin
  select * into a from level_attempts where id = p_attempt and user_id = auth.uid() for update;
  if a.id is null then raise exception 'ATTEMPT_NOT_FOUND'; end if;
  if a.status = 'SUBMITTED' then return jsonb_build_object('finished', true); end if;
  if a.mode = 'RANKED' and now() - a.last_active_at > make_interval(mins => v_resume) then
    perform _submit(p_attempt);                 -- quá hạn quay lại → tự nộp với điểm hiện có
    return jsonb_build_object('finished', true, 'expired', true);
  end if;
  select * into l from levels where id = a.level_id;
  loop
    v_idx := a.current_index;
    if v_idx >= a.question_count then return jsonb_build_object('finished', true); end if;
    select * into r from attempt_answers where attempt_id = a.id and q_index = v_idx;
    q := _build_question(a.level_id, a.seed, v_idx, l.question_types);
    v_limit := a.seconds_per_question * 1000 * (case when q->>'type' = 'MATCH' then 2 else 1 end);
    if r.id is not null and r.answered_at is null
       and extract(epoch from (now() - r.served_at)) * 1000 > v_limit + v_grace then
      -- câu đang dở đã hết giờ: tính sai, combo về 0, sang câu sau
      update attempt_answers set answered_at = now(), is_correct = false, time_ms = v_limit, points = 0 where id = r.id;
      update level_attempts set current_index = current_index + 1, combo = 0, total_time_ms = total_time_ms + v_limit
        where id = a.id returning * into a;
      continue;
    end if;
    exit;
  end loop;
  if r.id is null then
    insert into attempt_answers (attempt_id, q_index, q_type, word_id) values (a.id, v_idx, q->>'type', (q->>'word_id')::uuid)
    returning * into r;
  end if;
  update level_attempts set last_active_at = now() where id = a.id;
  return jsonb_build_object('finished', false, 'index', v_idx, 'total', a.question_count, 'type', q->>'type',
    'seconds', v_limit / 1000, 'remaining_ms', greatest(0, v_limit - (extract(epoch from (now() - r.served_at)) * 1000)::int),
    'score', a.score, 'combo', a.combo, 'question', q->'public');
end $$;

create function answer_question(p_attempt uuid, p_index int, p_answer jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  a level_attempts%rowtype; l levels%rowtype; r attempt_answers%rowtype; q jsonb; v_limit int; v_t int;
  v_grace int := coalesce(cfg_num('NETWORK_GRACE_MS'), 1000)::int;
  v_correct boolean; v_pairs int := 0; v_streak int; pts jsonb; v_total int; v_ans text; v_elapsed int;
begin
  select * into a from level_attempts where id = p_attempt and user_id = auth.uid() for update;
  if a.id is null then raise exception 'ATTEMPT_NOT_FOUND'; end if;
  if a.status = 'SUBMITTED' then raise exception 'ATTEMPT_FINISHED'; end if;
  select * into r from attempt_answers where attempt_id = a.id and q_index = p_index for update;
  if r.id is null then raise exception 'NOT_SERVED'; end if;
  if r.answered_at is not null then raise exception 'ALREADY_ANSWERED'; end if;
  select * into l from levels where id = a.level_id;
  q := _build_question(a.level_id, a.seed, p_index, l.question_types);
  v_limit := a.seconds_per_question * 1000 * (case when q->>'type' = 'MATCH' then 2 else 1 end);
  v_elapsed := (extract(epoch from (now() - r.served_at)) * 1000)::int;
  v_t := greatest(0, v_elapsed - v_grace);

  if q->>'type' = 'MATCH' then
    select count(*) into v_pairs from jsonb_array_elements(q->'accept') with ordinality c(v, i)
      join jsonb_array_elements(case when jsonb_typeof(p_answer) = 'array' then p_answer else '[]'::jsonb end) with ordinality x(v, i) using (i)
      where c.v = x.v;
    v_correct := v_pairs = 4;
    v_ans := p_answer::text;
  else
    v_ans := lower(trim(p_answer #>> '{}'));
    if q->>'type' = 'SPELL' then v_ans := regexp_replace(v_ans, '\s', '', 'g'); end if;
    v_correct := v_ans in (select lower(jsonb_array_elements_text(q->'accept')));
  end if;
  if v_t > v_limit then v_correct := false; v_pairs := 0; end if;   -- hết giờ = sai

  v_streak := a.combo + 1;
  pts := calc_points(v_correct, v_t, v_limit, v_streak, cfg_num('POINTS_CORRECT')::int, cfg_num('SPEED_BONUS_MAX')::int,
                     cfg_num('COMBO_STEP')::int, cfg_num('COMBO_CAP')::int);
  v_total := (pts->>'total')::int;
  if q->>'type' = 'MATCH' and not v_correct and v_t <= v_limit then   -- nối đúng một phần: không thưởng tốc độ/combo
    v_total := round(cfg_num('POINTS_CORRECT') * v_pairs / 4.0)::int;
  end if;

  update attempt_answers set answered_at = now(), answer = v_ans, is_correct = v_correct, time_ms = least(v_t, v_limit), points = v_total where id = r.id;
  update level_attempts set
    score = score + v_total, correct_count = correct_count + (case when v_correct then 1 else 0 end),
    total_time_ms = total_time_ms + least(v_t, v_limit),
    combo = case when v_correct then v_streak else 0 end,
    max_combo = greatest(max_combo, case when v_correct then v_streak else 0 end),
    current_index = p_index + 1, last_active_at = now()
    where id = a.id returning * into a;

  -- cập nhật sổ từ (chỉ lượt tính điểm & luyện tập đều ghi)
  insert into word_progress (user_id, word_id, status, correct_count, wrong_count)
  values (a.user_id, r.word_id, 'LEARNING', (case when v_correct then 1 else 0 end), (case when v_correct then 0 else 1 end))
  on conflict (user_id, word_id) do update set
    correct_count = word_progress.correct_count + (case when v_correct then 1 else 0 end),
    wrong_count = word_progress.wrong_count + (case when v_correct then 0 else 1 end), last_seen_at = now();

  return jsonb_build_object('correct', v_correct, 'correct_answer', case when q->>'type' = 'MATCH' then q->'accept' else to_jsonb(q->>'display') end,
    'points', v_total, 'speed', coalesce((pts->>'speed')::int, 0), 'combo_bonus', coalesce((pts->>'combo')::int, 0),
    'pairs', v_pairs, 'combo', a.combo, 'score', a.score, 'finished', a.current_index >= a.question_count);
end $$;

-- ---------- thắng/thua + thưởng (idempotent) ----------
create function close_level(p_level uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  l levels%rowtype; ua uuid; ub uuid; aa level_attempts%rowtype; bb level_attempts%rowtype;
  v_win int; v_winner uuid; v_draw boolean := false; v_loser uuid; nxt levels%rowtype; p uuid; v_amt int;
begin
  select * into l from levels where id = p_level for update;
  if l.status = 'CLOSED' or l.rewarded_at is not null then return; end if;
  select user_id into ua from level_attempts where level_id = p_level and mode = 'RANKED' and status = 'SUBMITTED' order by submitted_at limit 1;
  if ua is null then return; end if;
  ub := partner_of(ua);
  select * into aa from level_attempts where level_id = p_level and user_id = ua and mode = 'RANKED';
  select * into bb from level_attempts where level_id = p_level and user_id = ub and mode = 'RANKED' and status = 'SUBMITTED';
  v_win := level_win_coins(l.order_no, l.reward_multiplier);

  if bb.id is null then v_winner := ua; v_loser := ub;                    -- người kia không chơi: thắng mặc định
  elsif aa.score > bb.score then v_winner := ua; v_loser := ub;
  elsif bb.score > aa.score then v_winner := ub; v_loser := ua;
  elsif aa.total_time_ms < bb.total_time_ms then v_winner := ua; v_loser := ub;
  elsif bb.total_time_ms < aa.total_time_ms then v_winner := ub; v_loser := ua;
  else v_draw := true; end if;

  if v_draw then
    foreach p in array array[ua, ub] loop
      v_amt := round(v_win * cfg_num('DRAW_RATIO') * (1 + coin_bonus_pct(p)))::int;
      perform apply_coins(p, v_amt, 'LEVEL_DRAW', l.order_no::text);
      perform grant_item(p, 'PET_UPGRADE', 1);
      perform notify(p, 'LEVEL_RESULT', 'Màn ' || l.order_no || ': HÒA 🤝', 'Mỗi người nhận ' || v_amt || ' xu + 1 Nâng cấp thú cưng', jsonb_build_object('level', l.order_no, 'result', 'DRAW'));
    end loop;
  else
    v_amt := round(v_win * (1 + coin_bonus_pct(v_winner)))::int;
    perform apply_coins(v_winner, v_amt, 'LEVEL_WIN', l.order_no::text);
    perform grant_item(v_winner, 'PET_UPGRADE', 1);
    perform grant_item(v_winner, 'WEAPON_LICENSE', 1);
    perform grant_item(v_winner, 'ARMY_UPGRADE', 1);
    perform notify(v_winner, 'LEVEL_RESULT', 'Màn ' || l.order_no || ': BẠN THẮNG 🏆',
      '+' || v_amt || ' xu, 1 Nâng cấp thú cưng, 1 Quyền mua vũ khí, 1 Nâng cấp quân đội', jsonb_build_object('level', l.order_no, 'result', 'WIN'));
    if exists (select 1 from level_attempts where level_id = p_level and user_id = v_loser and mode = 'RANKED' and status = 'SUBMITTED') then
      v_amt := round(v_win * cfg_num('LOSE_RATIO') * (1 + coin_bonus_pct(v_loser)))::int;
      perform apply_coins(v_loser, v_amt, 'LEVEL_LOSE', l.order_no::text);
      perform notify(v_loser, 'LEVEL_RESULT', 'Màn ' || l.order_no || ': thua rồi 😢', 'Nhận ' || v_amt || ' xu an ủi. Màn sau gỡ lại nhé!', jsonb_build_object('level', l.order_no, 'result', 'LOSE'));
    else
      perform notify(v_loser, 'LEVEL_RESULT', 'Màn ' || l.order_no || ': hết hạn ⌛', 'Bạn không chơi kịp nên người ấy thắng mặc định.', jsonb_build_object('level', l.order_no, 'result', 'LOSE'));
    end if;
  end if;

  update levels set status = 'CLOSED', closed_at = now(), winner_id = v_winner, is_draw = v_draw, rewarded_at = now() where id = p_level;
  update levels set status = 'OPEN', opened_at = now() where order_no = l.order_no + 1 and status = 'LOCKED' returning * into nxt;
  if nxt.id is not null then
    perform notify(ua, 'LEVEL_OPENED', 'Màn ' || nxt.order_no || ' đã mở 🎉', nxt.topic_vi, jsonb_build_object('level', nxt.order_no));
    perform notify(ub, 'LEVEL_OPENED', 'Màn ' || nxt.order_no || ' đã mở 🎉', nxt.topic_vi, jsonb_build_object('level', nxt.order_no));
  end if;
end $$;
revoke all on function close_level from public, anon, authenticated;

-- Tick định kỳ: tự nộp lượt bỏ dở, đóng màn hết hạn, nhắc 6h / 1h. Idempotent (SYS-02).
create function cron_tick() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_resume int := coalesce(cfg_num('LEVEL_RESUME_MINUTES'), 10)::int; r record; hrs int; typ text;
begin
  for r in select id from level_attempts where mode = 'RANKED' and status = 'IN_PROGRESS'
           and last_active_at < now() - make_interval(mins => v_resume) loop
    perform _submit(r.id);
  end loop;
  for r in select l.id from levels l where l.status = 'COUNTDOWN' and l.deadline_at <= now()
           and not exists (select 1 from level_attempts a where a.level_id = l.id and a.mode = 'RANKED' and a.status = 'IN_PROGRESS') loop
    perform close_level(r.id);
  end loop;
  foreach hrs in array array[6, 1] loop
    typ := 'LEVEL_REMINDER_' || hrs || 'H';
    for r in select l.order_no, l.topic_vi, p.id uid from levels l join profiles p on p.deleted_at is null
             where l.status = 'COUNTDOWN' and l.deadline_at <= now() + make_interval(hours => hrs) and l.deadline_at > now()
               and not exists (select 1 from level_attempts a where a.level_id = l.id and a.user_id = p.id and a.mode = 'RANKED' and a.status = 'SUBMITTED')
               and exists (select 1 from level_attempts a where a.level_id = l.id and a.user_id = partner_of(p.id) and a.status = 'SUBMITTED')
               and not exists (select 1 from notifications n where n.user_id = p.id and n.type = typ and (n.data->>'level')::int = l.order_no) loop
      perform notify(r.uid, typ, 'Màn ' || r.order_no || ' sắp đóng ⏰', 'Còn chưa đến ' || hrs || ' giờ để chơi "' || r.topic_vi || '"', jsonb_build_object('level', r.order_no));
    end loop;
  end loop;
end $$;
revoke all on function cron_tick from public, anon;
grant execute on function cron_tick to authenticated, service_role;

-- Tổng quan 1 màn cho người đang đăng nhập (ẩn điểm người ấy cho tới khi mình nộp bài / màn đóng)
create function level_overview(p_order int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v uuid := auth.uid(); l levels%rowtype; me level_attempts%rowtype; pa level_attempts%rowtype; pid uuid;
  v_reveal boolean; v_win int;
begin
  select * into l from levels where order_no = p_order;
  if l.id is null then return null; end if;
  pid := partner_of(v);
  select * into me from level_attempts where level_id = l.id and user_id = v and mode = 'RANKED';
  select * into pa from level_attempts where level_id = l.id and user_id = pid and mode = 'RANKED';
  v_reveal := l.status = 'CLOSED' or me.status = 'SUBMITTED';
  v_win := level_win_coins(l.order_no, l.reward_multiplier);
  return jsonb_build_object(
    'level', to_jsonb(l) - 'seed',
    'words', (select count(*) from words where level_id = l.id),
    'reward', jsonb_build_object('win', v_win, 'lose', round(v_win * cfg_num('LOSE_RATIO'))::int, 'draw', round(v_win * cfg_num('DRAW_RATIO'))::int),
    'me', case when me.id is null then null else jsonb_build_object('attempt_id', me.id, 'status', me.status, 'score', me.score,
        'correct', me.correct_count, 'total', me.question_count, 'max_combo', me.max_combo, 'time_ms', me.total_time_ms) end,
    'partner_finished', coalesce(pa.status = 'SUBMITTED', false),
    'partner', case when v_reveal and pa.id is not null and pa.status = 'SUBMITTED' then jsonb_build_object('score', pa.score,
        'correct', pa.correct_count, 'total', pa.question_count, 'max_combo', pa.max_combo, 'time_ms', pa.total_time_ms) else null end);
end $$;

-- Danh sách sai của 1 lượt (LRN-07)
create function attempt_review(p_attempt uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('word_id', w.id, 'word', w.word, 'meanings', w.meanings_vi, 'is_correct', aa.is_correct) order by aa.q_index), '[]')
  from attempt_answers aa join level_attempts la on la.id = aa.attempt_id join words w on w.id = aa.word_id
  where aa.attempt_id = p_attempt and la.user_id = auth.uid() and la.status = 'SUBMITTED'
$$;

revoke all on function start_attempt, submit_attempt, next_question, answer_question, level_overview, attempt_review from public, anon;
grant execute on function start_attempt, submit_attempt, next_question, answer_question, level_overview, attempt_review to authenticated;
revoke all on function calc_points, level_win_coins from public, anon, authenticated;
grant execute on function calc_points, level_win_coins to service_role;

-- Lịch pg_cron mỗi 5 phút (nếu extension có sẵn). Nếu không, app gọi cron_tick() khi tải trang.
do $$ begin
  create extension if not exists pg_cron;
  perform cron.schedule('love-quest-tick', '*/5 * * * *', 'select public.cron_tick()');
exception when others then raise notice 'pg_cron không khả dụng (%), dùng cron_tick() lazy', sqlerrm;
end $$;
