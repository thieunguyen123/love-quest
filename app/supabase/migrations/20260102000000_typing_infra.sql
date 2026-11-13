-- Phase 3: mưa chữ + hạ tầng dùng chung (ngày VN, bộ đếm ngày, kho vật phẩm, thông báo, admin_logs)

create function vn_today() returns date language sql stable as $$
  select (now() at time zone 'Asia/Ho_Chi_Minh')::date
$$;

-- ---------- bộ đếm theo ngày (giờ VN) ----------
create table daily_counters (
  user_id uuid not null references profiles(id) on delete cascade,
  day date not null,
  attacks_used int not null default 0,
  typing_coins int not null default 0,
  shields_bought int not null default 0,
  primary key (user_id, day)
);
alter table daily_counters enable row level security;
create policy dc_read_own on daily_counters for select to authenticated using (user_id = auth.uid());

-- ---------- kho vật phẩm ----------
create type item_type as enum ('PET_UPGRADE', 'WEAPON_LICENSE', 'ARMY_UPGRADE', 'SHIELD_PAID');
create table inventory (
  user_id uuid not null references profiles(id) on delete cascade,
  item_type item_type not null,
  quantity int not null default 0 check (quantity >= 0),
  primary key (user_id, item_type)
);
alter table inventory enable row level security;
create policy inv_read_own on inventory for select to authenticated using (user_id = auth.uid());

create function grant_item(p_user uuid, p_type item_type, p_qty int) returns void
language sql security definer set search_path = public as $$
  insert into inventory (user_id, item_type, quantity) values (p_user, p_type, p_qty)
  on conflict (user_id, item_type) do update set quantity = inventory.quantity + p_qty;
$$;
create function spend_item(p_user uuid, p_type item_type, p_qty int) returns void
language plpgsql security definer set search_path = public as $$
begin
  update inventory set quantity = quantity - p_qty where user_id = p_user and item_type = p_type;
  if not found then raise exception 'NOT_ENOUGH_ITEM'; end if;
exception when check_violation then raise exception 'NOT_ENOUGH_ITEM';
end $$;
revoke all on function grant_item, spend_item from public, anon, authenticated;

-- ---------- thông báo ----------
create table notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null default '',
  data jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on notifications (user_id, created_at desc);
alter table notifications enable row level security;
create policy notif_read_own on notifications for select to authenticated using (user_id = auth.uid());
create policy notif_update_own on notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on notifications from authenticated;
grant update (read_at) on notifications to authenticated;
alter publication supabase_realtime add table notifications;

create function notify(p_user uuid, p_type text, p_title text, p_body text default '', p_data jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into notifications (user_id, type, title, body, data) values (p_user, p_type, p_title, p_body, p_data);
$$;
revoke all on function notify from public, anon, authenticated;

-- ---------- admin logs ----------
create table admin_logs (
  id bigint generated always as identity primary key,
  admin_id uuid references profiles(id),
  action text not null,
  entity text,
  entity_id text,
  diff jsonb,
  created_at timestamptz not null default now()
);
alter table admin_logs enable row level security;
create policy logs_admin_read on admin_logs for select to authenticated using (is_admin());

-- ---------- Mưa chữ ----------
create table typing_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  source_level_id uuid references levels(id),
  words_hit int not null,
  words_missed int not null,
  coins_earned int not null,
  duration_ms int not null,
  created_at timestamptz not null default now()
);
create index on typing_sessions (user_id, created_at desc);
alter table typing_sessions enable row level security;
create policy ts_read on typing_sessions for select to authenticated
  using (user_id = auth.uid() or user_id = partner_of(auth.uid()));

-- Chốt 1 ván: cộng xu theo mốc (áp trần ngày), ghi kỷ lục, cập nhật sổ từ (LRN-05, LRN-06)
create function claim_typing_session(
  p_source uuid, p_hit int, p_missed int, p_duration_ms int, p_hit_ids uuid[], p_missed_ids uuid[]
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v uuid := auth.uid(); v_today date := vn_today();
  v_every int := coalesce(cfg_num('TYPING_REWARD_EVERY'), 10)::int;
  v_reward int := coalesce(cfg_num('TYPING_REWARD_COINS'), 20)::int;
  v_cap int := coalesce(cfg_num('TYPING_DAILY_CAP'), 300)::int;
  v_used int; v_earn int; v_grant int; v_record int;
begin
  if v is null then raise exception 'NOT_AUTHENTICATED'; end if;
  -- chống gian lận thô: tối đa ~1 từ / 0.6s
  if p_hit < 0 or p_missed < 0 or p_duration_ms < 0 or p_hit > (p_duration_ms / 600) + 3 then
    raise exception 'INVALID_SESSION';
  end if;
  if p_source is not null and not exists (select 1 from levels where id = p_source and status <> 'LOCKED') then
    raise exception 'LEVEL_LOCKED';
  end if;

  insert into daily_counters (user_id, day) values (v, v_today) on conflict do nothing;
  select typing_coins into v_used from daily_counters where user_id = v and day = v_today for update;
  v_earn := (p_hit / v_every) * v_reward;
  v_grant := least(v_earn, greatest(0, v_cap - v_used));
  if v_grant > 0 then
    update daily_counters set typing_coins = typing_coins + v_grant where user_id = v and day = v_today;
    perform apply_coins(v, v_grant, 'TYPING', null);
  end if;

  insert into typing_sessions (user_id, source_level_id, words_hit, words_missed, coins_earned, duration_ms)
  values (v, p_source, p_hit, p_missed, v_grant, p_duration_ms);

  -- cập nhật sổ từ (chỉ từ của màn đã mở)
  insert into word_progress (user_id, word_id, status, correct_count, wrong_count)
  select v, w.id, 'LEARNING'::word_status, count(*), 0
  from unnest(coalesce(p_hit_ids, '{}')) x join words w on w.id = x
  join levels l on l.id = w.level_id and l.status <> 'LOCKED' group by w.id
  on conflict (user_id, word_id) do update set correct_count = word_progress.correct_count + excluded.correct_count, last_seen_at = now();
  insert into word_progress (user_id, word_id, status, correct_count, wrong_count)
  select v, w.id, 'LEARNING'::word_status, 0, count(*)
  from unnest(coalesce(p_missed_ids, '{}')) x join words w on w.id = x
  join levels l on l.id = w.level_id and l.status <> 'LOCKED' group by w.id
  on conflict (user_id, word_id) do update set wrong_count = word_progress.wrong_count + excluded.wrong_count, last_seen_at = now();

  select max(words_hit) into v_record from typing_sessions where user_id = v;
  return jsonb_build_object('coins_earned', v_grant, 'capped', v_earn > v_grant,
    'today_total', v_used + v_grant, 'daily_cap', v_cap, 'record', v_record);
end $$;
revoke all on function claim_typing_session from public, anon;
grant execute on function claim_typing_session to authenticated;
