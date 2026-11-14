-- Phase 11: căn cứ 40×40 (BASE-07/13), tường thành (BASE-15), nhà máy luyện quân (BASE-04/16).
-- Lưới 30 → 40: bố cục dời +5 ô; bản đồ vật cản sinh lại → hoàn xu cho vật cản đã dọn.

alter type shop_category add value if not exists 'WALL';
alter type shop_category add value if not exists 'FACTORY';

-- ---------- lưới lớn hơn ----------
update base_layout set x = x + 5, z = z + 5 where coalesce(cfg_num('BASE_GRID_SIZE'), 30) = 30;
insert into game_config (key, value, unit, description) values
  ('BASE_GRID_SIZE', '40', 'ô', 'Cạnh lưới căn cứ 3D (mỗi ô 2 m). Nhà chính ở giữa.'),
  ('BASE_FREE_SIZE', '24', 'ô', 'Cạnh vùng trống ở giữa (không có vật cản) lúc bắt đầu'),
  ('OBSTACLE_DENSITY', '0.45', '%', 'Tỉ lệ ô vòng ngoài bị vật cản phủ khi sinh bản đồ')
on conflict (key) do update set value = excluded.value;
-- hoàn xu vật cản đã dọn (bản đồ vật cản mới do seed sinh lại)
do $$ declare r record; begin
  for r in select c.user_id, coalesce(sum(o.price), 0)::int as total from base_clear c join obstacles o on o.id = c.obstacle_id group by c.user_id loop
    if r.total > 0 then perform apply_coins(r.user_id, r.total, 'PURCHASE', 'refund:obstacles-grid40'); end if;
  end loop;
end $$;
delete from base_clear where true;
delete from obstacles where true;

-- ---------- tường thành (mỗi đoạn 1 hàng ở user_defenses, kind WALL) ----------
alter table user_defenses drop constraint user_defenses_kind_check;
alter table user_defenses add constraint user_defenses_kind_check check (kind in ('DEFENSE', 'TRAP', 'WALL'));
drop policy defenses_read on user_defenses;
create policy defenses_read on user_defenses for select to authenticated
  using (user_id = auth.uid() or (user_id = partner_of(auth.uid()) and kind <> 'TRAP'));

create function buy_walls(p_qty int) returns int language plpgsql security definer set search_path = public as $$
declare v uuid := auth.uid(); i shop_items%rowtype; v_lv int; v_max int; v_have int;
begin
  if v is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_qty is null or p_qty < 1 or p_qty > 50 then raise exception 'INVALID_QTY'; end if;
  select * into i from shop_items where code = 'wall';
  select level into v_lv from user_house where user_id = v;
  if v_lv is null then raise exception 'NO_HOUSE'; end if;
  v_max := coalesce((i.stats->'max_by_house'->>v_lv)::int, 20);
  select count(*) into v_have from user_defenses where user_id = v and kind = 'WALL';
  if v_have + p_qty > v_max then raise exception 'DEFENSE_LIMIT'; end if;
  perform apply_coins(v, -(i.price * p_qty), 'PURCHASE', 'wall x' || p_qty);
  insert into user_defenses (user_id, code, kind) select v, 'wall', 'WALL' from generate_series(1, p_qty);
  return v_have + p_qty;
end $$;
revoke all on function buy_walls from public, anon;
grant execute on function buy_walls to authenticated;

-- ---------- nhà máy luyện quân ----------
create table user_factories (
  user_id uuid not null references profiles(id) on delete cascade,
  code text not null references shop_items(code),
  built_at timestamptz not null default now(),
  primary key (user_id, code)
);
alter table user_factories enable row level security;
create policy factories_read on user_factories for select to authenticated using (user_id = auth.uid() or user_id = partner_of(auth.uid()));

create table training (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  unit_code text not null references shop_items(code),
  qty int not null check (qty > 0),
  cost int not null,
  started_at timestamptz not null,
  done_at timestamptz not null
);
create index on training (user_id, done_at);
alter table training enable row level security;
create policy training_read on training for select to authenticated using (user_id = auth.uid() or user_id = partner_of(auth.uid()));

create function buy_factory(p_code text) returns void language plpgsql security definer set search_path = public as $$
declare v uuid := auth.uid(); i shop_items%rowtype;
begin
  if v is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into i from shop_items where code = p_code and category::text = 'FACTORY';
  if i.code is null then raise exception 'ITEM_NOT_FOUND'; end if;
  if not _unlocked(i.unlock_level) then raise exception 'ITEM_LOCKED'; end if;
  if exists (select 1 from user_factories where user_id = v and code = p_code) then raise exception 'ALREADY_OWNED'; end if;
  perform apply_coins(v, -i.price, 'PURCHASE', p_code);
  insert into user_factories (user_id, code) values (v, p_code);
end $$;

-- lính luyện xong → vào quân (gọi khi mở căn cứ, đi đánh, cron)
create function _collect_training(p_user uuid) returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; r record;
begin
  for r in delete from training where user_id = p_user and done_at <= now() returning unit_code, qty loop
    insert into user_army (user_id, unit_code, quantity) values (p_user, r.unit_code, r.qty)
    on conflict (user_id, unit_code) do update set quantity = user_army.quantity + excluded.quantity;
    n := n + r.qty;
  end loop;
  return n;
end $$;
create function collect_training() returns int language sql security definer set search_path = public as $$
  select _collect_training(auth.uid()) where auth.uid() is not null
$$;

-- đặt luyện: cần nhà máy của đúng loại lính; xếp hàng nối tiếp đơn trước của nhà máy đó; tính cả lính đang luyện vào sức chứa
create function train_units(p_unit text, p_qty int) returns jsonb language plpgsql security definer set search_path = public as $$
declare v uuid := auth.uid(); i shop_items%rowtype; v_start timestamptz; v_done timestamptz; v_cost int; v_queued int;
begin
  if v is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_qty is null or p_qty < 1 or p_qty > 50 then raise exception 'INVALID_QTY'; end if;
  select * into i from shop_items where code = p_unit and category = 'UNIT';
  if i.code is null then raise exception 'ITEM_NOT_FOUND'; end if;
  if not exists (select 1 from user_factories where user_id = v and code = i.stats->>'factory') then raise exception 'NO_FACTORY'; end if;
  perform _collect_training(v);
  select coalesce(sum(t.qty * s.slots), 0) into v_queued from training t join shop_items s on s.code = t.unit_code where t.user_id = v;
  if army_used(v) + v_queued + p_qty * i.slots > army_capacity(v) then raise exception 'ARMY_FULL'; end if;
  v_cost := (i.stats->>'train_price')::int * p_qty;
  perform apply_coins(v, -v_cost, 'PURCHASE', 'train:' || p_unit);
  select greatest(now(), coalesce(max(done_at), now())) into v_start from training where user_id = v and unit_code = p_unit;
  v_done := v_start + make_interval(secs => (i.stats->>'train_sec')::numeric * p_qty);
  insert into training (user_id, unit_code, qty, cost, started_at, done_at) values (v, p_unit, p_qty, v_cost, v_start, v_done);
  return jsonb_build_object('done_at', v_done, 'cost', v_cost);
end $$;
revoke all on function buy_factory, collect_training, train_units from public, anon;
grant execute on function buy_factory, collect_training, train_units to authenticated;
revoke all on function _collect_training from public, anon, authenticated;
grant execute on function _collect_training to service_role;

-- lính không còn mua thẳng — phải luyện ở nhà máy
create or replace function buy_unit(p_code text, p_qty int) returns int language plpgsql security definer set search_path = public as $$
begin raise exception 'UNIT_RETIRED'; end $$;

-- ---------- bố cục: thêm WALL, FACTORY ----------
alter table base_layout drop constraint base_layout_kind_check;
alter table base_layout add constraint base_layout_kind_check check (kind in ('UNIT', 'PET', 'WEAPON', 'DECOR', 'DEFENSE', 'TRAP', 'WALL', 'FACTORY'));
create or replace function _layout_code(p_user uuid, p_kind text, p_ref text) returns text language sql stable security definer set search_path = public as $$
  select case p_kind
    when 'UNIT' then (select a.unit_code from user_army a where a.user_id = p_user and a.unit_code = p_ref and a.quantity > 0)
    when 'WEAPON' then (select w.weapon_code from user_weapons w where w.user_id = p_user and w.weapon_code = p_ref)
    when 'PET' then (select p.pet_code from user_pets p where p.user_id = p_user and p.id::text = p_ref)
    when 'DECOR' then (select d.code from user_decor d where d.user_id = p_user and d.id::text = p_ref)
    when 'DEFENSE' then (select d.code from user_defenses d where d.user_id = p_user and d.id::text = p_ref and d.kind = 'DEFENSE')
    when 'TRAP' then (select d.code from user_defenses d where d.user_id = p_user and d.id::text = p_ref and d.kind = 'TRAP')
    when 'WALL' then (select d.code from user_defenses d where d.user_id = p_user and d.id::text = p_ref and d.kind = 'WALL')
    when 'FACTORY' then (select f.code from user_factories f where f.user_id = p_user and f.code = p_ref)
  end
$$;

create or replace function save_base_layout(p_items jsonb) returns int language plpgsql security definer set search_path = public as $$
declare v uuid := auth.uid(); g int := base_grid_size(); hl int; hs int; h0 int; n int;
begin
  if v is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 600 then raise exception 'INVALID_LAYOUT'; end if;
  select level into hl from user_house where user_id = v;
  if hl is null then raise exception 'NO_HOUSE'; end if;
  hs := house_footprint(hl); h0 := (g - hs) / 2;

  create temp table _it on commit drop as
  select e->>'kind' as kind, e->>'ref' as ref, (e->>'x')::int as x, (e->>'z')::int as z, coalesce((e->>'rot')::int, 0) as rot,
    _layout_code(v, e->>'kind', e->>'ref') as code
  from jsonb_array_elements(p_items) e;
  alter table _it add column s int;
  update _it set s = coalesce((select (si.stats->>'size')::int from shop_items si where si.code = _it.code), case kind when 'UNIT' then 2 when 'DEFENSE' then 2 else 1 end) where true;

  if exists (select 1 from _it where kind is null or kind not in ('UNIT','PET','WEAPON','DECOR','DEFENSE','TRAP','WALL','FACTORY') or x is null or z is null or rot not between 0 and 3) then raise exception 'INVALID_LAYOUT'; end if;
  if exists (select 1 from _it where code is null) then raise exception 'ITEM_NOT_OWNED'; end if;
  if (select count(*) from _it) <> (select count(distinct (kind, ref)) from _it) then raise exception 'DUPLICATE_ITEM'; end if;
  if exists (select 1 from _it where x < 0 or z < 0 or x + s > g or z + s > g) then raise exception 'OUT_OF_BOUNDS'; end if;
  if exists (select 1 from _it where x < h0 + hs and x + s > h0 and z < h0 + hs and z + s > h0) then raise exception 'OVERLAP_HOUSE'; end if;
  if exists (select 1 from _it i join obstacles o on i.x < o.x + o.size and i.x + i.s > o.x and i.z < o.z + o.size and i.z + i.s > o.z
             where not exists (select 1 from base_clear c where c.user_id = v and c.obstacle_id = o.id)) then raise exception 'OVERLAP_OBSTACLE'; end if;
  if exists (select 1 from _it a join _it b on (a.kind, a.ref) < (b.kind, b.ref)
             where a.x < b.x + b.s and a.x + a.s > b.x and a.z < b.z + b.s and a.z + a.s > b.z) then raise exception 'OVERLAP'; end if;

  delete from base_layout where user_id = v;
  insert into base_layout (user_id, kind, ref, x, z, rot) select v, kind, ref, x, z, rot from _it;
  get diagnostics n = row_count;
  return n;
end $$;

-- cron_tick: thêm thu lính đã luyện xong cho mọi người
alter function cron_tick() rename to _cron_tick_v3;
revoke all on function _cron_tick_v3 from public, anon, authenticated;
create function cron_tick() returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  perform _cron_tick_v3();
  for r in select distinct user_id from training where done_at <= now() loop perform _collect_training(r.user_id); end loop;
end $$;
revoke all on function cron_tick from public, anon;
grant execute on function cron_tick to authenticated, service_role;

-- ---------- reset (dev + mùa giải) ----------
create or replace function dev_reset_game() returns void language plpgsql security definer set search_path = public as $$
declare t text;
begin
  foreach t in array array['attacks','shields','attempt_answers','level_attempts','user_weapons','user_pets','user_army',
    'typing_sessions','daily_counters','inventory','notifications','coin_transactions','word_progress','study_progress','admin_logs',
    'base_layout','user_decor','user_defenses','base_clear','user_styles','training','user_factories','push_subscriptions']
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

create or replace function admin_reset_season(p_confirm text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_confirm <> 'RESET' then raise exception 'CONFIRM_REQUIRED'; end if;
  delete from user_defenses where true; delete from base_clear where true; delete from user_styles where true;
  delete from training where true; delete from user_factories where true;
  update user_house set style = 'classic' where true;
  perform _admin_reset_season_v2(p_confirm);
end $$;
revoke all on function admin_reset_season from public, anon;
grant execute on function admin_reset_season to authenticated;
