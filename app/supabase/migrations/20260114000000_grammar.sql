-- Phase 14 (sheet 1 mục L): GRM-01..03 ngữ pháp TOEIC 0–600. Nội dung nạp bằng scripts/seed-grammar.ts (supabase/seed/grammar_b*.json).
-- Đáp án nằm ở grammar_questions — client KHÔNG đọc được bảng này; chấm ở server (nguyên tắc 2).

alter type coin_reason add value if not exists 'GRAMMAR';

insert into game_config (key, value, unit, description) values
  ('GRAMMAR_QUIZ_SIZE', '10', 'câu', 'Số câu mỗi bài kiểm tra ngữ pháp (GRM-03)'),
  ('GRAMMAR_PASS_PCT', '0.7', '%', 'Tỉ lệ đúng tối thiểu để đạt bài ngữ pháp'),
  ('GRAMMAR_PASS_COINS', '80', 'xu', 'Thưởng lần đầu đạt mỗi bài ngữ pháp')
on conflict (key) do nothing;

create table grammar_lessons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  order_no int not null unique,
  band int not null check (band between 1 and 3),
  emoji text not null default '📘',
  title_vi text not null,
  title_en text not null default '',
  summary_vi text not null default '',
  sections jsonb not null default '[]',
  tips jsonb not null default '[]',
  created_at timestamptz not null default now()
);
alter table grammar_lessons enable row level security;
create policy gl_read on grammar_lessons for select to authenticated using (true);
create policy gl_admin on grammar_lessons for all to authenticated using (is_admin()) with check (is_admin());

create table grammar_questions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references grammar_lessons(id) on delete cascade,
  idx int not null,
  q text not null,
  options text[] not null check (cardinality(options) between 2 and 6),
  answer int not null,
  explain_vi text not null default '',
  unique (lesson_id, idx),
  check (answer >= 0 and answer < cardinality(options))
);
alter table grammar_questions enable row level security;
-- KHÔNG có policy select cho người chơi (đáp án bí mật); admin đọc/sửa được
create policy gq_admin on grammar_questions for all to authenticated using (is_admin()) with check (is_admin());

create table grammar_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  lesson_id uuid not null references grammar_lessons(id) on delete cascade,
  question_ids uuid[] not null,
  answers int[] not null,          -- -1 = chưa trả lời
  correct int not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index on grammar_attempts (user_id, finished_at desc);
alter table grammar_attempts enable row level security;
create policy ga_read_own on grammar_attempts for select to authenticated using (user_id = auth.uid());

create table grammar_progress (
  user_id uuid not null references profiles(id) on delete cascade,
  lesson_id uuid not null references grammar_lessons(id) on delete cascade,
  best_correct int not null default 0,
  best_total int not null default 0,
  attempts int not null default 0,
  passed_at timestamptz,
  rewarded boolean not null default false,
  primary key (user_id, lesson_id)
);
alter table grammar_progress enable row level security;
create policy gp_read on grammar_progress for select to authenticated
  using (user_id = auth.uid() or user_id = partner_of(auth.uid()));

-- Bắt đầu bài kiểm tra: chọn ngẫu nhiên câu hỏi, trả về đề KHÔNG kèm đáp án
create function grammar_start(p_lesson uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare v uuid := auth.uid(); v_ids uuid[]; v_id uuid; v_n int := greatest(1, coalesce(cfg_num('GRAMMAR_QUIZ_SIZE'), 10)::int);
begin
  if v is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select array_agg(id order by random()) into v_ids from (select id from grammar_questions where lesson_id = p_lesson order by random() limit v_n) s;
  if v_ids is null then raise exception 'NO_QUESTIONS'; end if;
  insert into grammar_attempts (user_id, lesson_id, question_ids, answers)
  values (v, p_lesson, v_ids, array_fill(-1, array[cardinality(v_ids)])) returning id into v_id;
  return jsonb_build_object('attempt', v_id, 'questions',
    (select jsonb_agg(jsonb_build_object('q', q.q, 'options', to_jsonb(q.options)) order by t.ord)
       from unnest(v_ids) with ordinality t(id, ord) join grammar_questions q on q.id = t.id));
end $$;
revoke all on function grammar_start from public, anon;
grant execute on function grammar_start to authenticated;

-- Trả lời 1 câu (mỗi câu 1 lần) → đúng/sai + đáp án + giải thích
create function grammar_answer(p_attempt uuid, p_index int, p_choice int) returns jsonb language plpgsql security definer set search_path = public as $$
declare v uuid := auth.uid(); a grammar_attempts%rowtype; q grammar_questions%rowtype; ok boolean;
begin
  if v is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into a from grammar_attempts where id = p_attempt and user_id = v for update;
  if not found then raise exception 'ATTEMPT_NOT_FOUND'; end if;
  if a.finished_at is not null then raise exception 'ATTEMPT_FINISHED'; end if;
  if p_index < 0 or p_index >= cardinality(a.question_ids) then raise exception 'INVALID_INDEX'; end if;
  if a.answers[p_index + 1] <> -1 then raise exception 'ALREADY_ANSWERED'; end if;
  select * into q from grammar_questions where id = a.question_ids[p_index + 1];
  if p_choice is null or p_choice < 0 or p_choice >= cardinality(q.options) then raise exception 'INVALID_CHOICE'; end if;
  ok := p_choice = q.answer;
  update grammar_attempts set answers[p_index + 1] = p_choice, correct = correct + (case when ok then 1 else 0 end) where id = p_attempt;
  return jsonb_build_object('correct', ok, 'answer', q.answer, 'explain', q.explain_vi);
end $$;
revoke all on function grammar_answer from public, anon;
grant execute on function grammar_answer to authenticated;

-- Nộp bài: câu chưa trả lời tính sai; lần đầu đạt → +GRAMMAR_PASS_COINS
create function grammar_finish(p_attempt uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare v uuid := auth.uid(); a grammar_attempts%rowtype; v_total int; v_pass boolean; v_coins int := 0; v_rewarded boolean;
begin
  if v is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into a from grammar_attempts where id = p_attempt and user_id = v for update;
  if not found then raise exception 'ATTEMPT_NOT_FOUND'; end if;
  if a.finished_at is not null then raise exception 'ATTEMPT_FINISHED'; end if;
  v_total := cardinality(a.question_ids);
  v_pass := a.correct >= ceil(v_total * coalesce(cfg_num('GRAMMAR_PASS_PCT'), 0.7));
  update grammar_attempts set finished_at = now() where id = p_attempt;
  insert into grammar_progress (user_id, lesson_id) values (v, a.lesson_id) on conflict do nothing;
  select rewarded into v_rewarded from grammar_progress where user_id = v and lesson_id = a.lesson_id for update;
  update grammar_progress set attempts = attempts + 1,
    best_correct = case when a.correct * greatest(best_total, 1) >= best_correct * v_total then a.correct else best_correct end,
    best_total = case when a.correct * greatest(best_total, 1) >= best_correct * v_total then v_total else best_total end,
    passed_at = coalesce(passed_at, case when v_pass then now() end)
  where user_id = v and lesson_id = a.lesson_id;
  if v_pass and not v_rewarded then
    v_coins := coalesce(cfg_num('GRAMMAR_PASS_COINS'), 0)::int;
    update grammar_progress set rewarded = true where user_id = v and lesson_id = a.lesson_id;
    if v_coins > 0 then perform apply_coins(v, v_coins, 'GRAMMAR', a.lesson_id::text); end if;
  end if;
  return jsonb_build_object('correct', a.correct, 'total', v_total, 'passed', v_pass, 'coins', v_coins);
end $$;
revoke all on function grammar_finish from public, anon;
grant execute on function grammar_finish to authenticated;

-- ---------- nhiệm vụ ngày: Làm 1 bài ngữ pháp (DAY-02) ----------
alter table quests drop constraint quests_metric_check;
alter table quests add constraint quests_metric_check check (metric in ('STUDY_WORDS', 'TYPING_GAMES', 'TYPING_WORDS', 'LEVEL_SUBMITS', 'CORRECT_ANSWERS', 'ATTACKS', 'GRAMMAR_QUIZZES'));
insert into quests (code, emoji, title_vi, metric, target, reward_coins, optional, sort, href) values
  ('grammar1', '📘', 'Làm 1 bài kiểm tra ngữ pháp', 'GRAMMAR_QUIZZES', 1, 100, false, 2, '/grammar')
on conflict (code) do nothing;

create or replace function _quest_progress(p_user uuid, p_metric text, p_day date) returns int language plpgsql stable security definer set search_path = public as $$
declare t0 timestamptz := (p_day::timestamp at time zone 'Asia/Ho_Chi_Minh'); t1 timestamptz := t0 + interval '1 day'; n int;
begin
  case p_metric
    when 'STUDY_WORDS' then select count(*) into n from word_progress where user_id = p_user and last_seen_at >= t0 and last_seen_at < t1;
    when 'TYPING_GAMES' then select count(*) into n from typing_sessions where user_id = p_user and words_hit > 0 and created_at >= t0 and created_at < t1;
    when 'TYPING_WORDS' then select coalesce(sum(words_hit), 0) into n from typing_sessions where user_id = p_user and created_at >= t0 and created_at < t1;
    when 'LEVEL_SUBMITS' then select count(*) into n from level_attempts where user_id = p_user and status = 'SUBMITTED' and submitted_at >= t0 and submitted_at < t1;
    when 'CORRECT_ANSWERS' then select coalesce(sum(correct_count), 0) into n from level_attempts where user_id = p_user and status = 'SUBMITTED' and submitted_at >= t0 and submitted_at < t1;
    when 'ATTACKS' then select count(*) into n from attacks where attacker_id = p_user and status = 'DONE' and finished_at >= t0 and finished_at < t1;
    when 'GRAMMAR_QUIZZES' then select count(*) into n from grammar_attempts where user_id = p_user and finished_at >= t0 and finished_at < t1;
    else n := 0;
  end case;
  return coalesce(n, 0);
end $$;
revoke all on function _quest_progress from public, anon, authenticated;

-- dọn dữ liệu khi reset game (chỉ dùng cho test)
create or replace function dev_reset_game() returns void language plpgsql security definer set search_path = public as $$
declare t text;
begin
  foreach t in array array['attacks','shields','attempt_answers','level_attempts','user_weapons','user_pets','user_army',
    'typing_sessions','daily_counters','inventory','notifications','coin_transactions','word_progress','study_progress','admin_logs',
    'base_layout','user_decor','user_defenses','base_clear','user_styles','training','user_factories','push_subscriptions','daily_logins','quest_claims',
    'grammar_attempts','grammar_progress']
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
