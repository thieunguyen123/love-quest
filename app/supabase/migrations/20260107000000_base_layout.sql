-- Căn cứ 3D kiểu Clash of Clans (BASE-07..09): đồ trang trí + bố cục đặt quân/thú cưng/vũ khí/trang trí trên lưới.
-- Bố cục chỉ là trình bày (không đổi ATK/DEF). Kích thước (số ô) của từng vật nằm ở shop_items.stats.size.

alter type shop_category add value if not exists 'DECOR';

-- ---------- đồ trang trí: mỗi món là 1 hàng (đặt riêng từng món) ----------
create table user_decor (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  code text not null references shop_items(code),
  created_at timestamptz not null default now()
);
create index on user_decor (user_id);
alter table user_decor enable row level security;
create policy decor_read on user_decor for select to authenticated using (user_id = auth.uid() or user_id = partner_of(auth.uid()));

create function buy_decor(p_code text) returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid := auth.uid(); i shop_items%rowtype; v_id uuid; v_max int;
begin
  if v is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into i from shop_items where code = p_code and category::text = 'DECOR';
  if i.code is null then raise exception 'ITEM_NOT_FOUND'; end if;
  if not _unlocked(i.unlock_level) then raise exception 'ITEM_LOCKED'; end if;
  v_max := coalesce((i.stats->>'max')::int, 20);
  if (select count(*) from user_decor where user_id = v and code = p_code) >= v_max then raise exception 'DECOR_LIMIT'; end if;
  perform apply_coins(v, -i.price, 'PURCHASE', p_code);
  insert into user_decor (user_id, code) values (v, p_code) returning id into v_id;
  return v_id;
end $$;
revoke all on function buy_decor from public, anon;
grant execute on function buy_decor to authenticated;

-- ---------- bố cục căn cứ ----------
create table base_layout (
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('UNIT', 'PET', 'WEAPON', 'DECOR')),
  ref text not null,          -- UNIT: unit_code · PET: user_pets.id · WEAPON: weapon_code · DECOR: user_decor.id
  x int not null,
  z int not null,
  rot int not null default 0 check (rot between 0 and 3),
  primary key (user_id, kind, ref)
);
alter table base_layout enable row level security;
create policy layout_read on base_layout for select to authenticated using (user_id = auth.uid() or user_id = partner_of(auth.uid()));

-- Kích thước lưới & nhà (twin TS: src/lib/game/layout.ts)
create function base_grid_size() returns int language sql stable as $$ select coalesce(cfg_num('BASE_GRID_SIZE'), 20)::int $$;
create function house_footprint(p_level int) returns int language sql stable security definer set search_path = public as $$
  select coalesce((select (stats->>'size')::int from shop_items where code = 'house_' || p_level), 2 + p_level)
$$;

-- Lưu cả bố cục 1 lần (thay toàn bộ). Kiểm tra: sở hữu, không trùng, trong lưới, không đè nhà, không đè nhau.
create function save_base_layout(p_items jsonb) returns int language plpgsql security definer set search_path = public as $$
declare v uuid := auth.uid(); g int := base_grid_size(); hl int; hs int; h0 int; n int; bad text;
begin
  if v is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 300 then raise exception 'INVALID_LAYOUT'; end if;
  select level into hl from user_house where user_id = v;
  if hl is null then raise exception 'NO_HOUSE'; end if;
  hs := house_footprint(hl); h0 := (g - hs) / 2;

  create temp table _it on commit drop as
  select e->>'kind' as kind, e->>'ref' as ref, (e->>'x')::int as x, (e->>'z')::int as z, coalesce((e->>'rot')::int, 0) as rot,
    case e->>'kind'
      when 'UNIT' then (select a.unit_code from user_army a where a.user_id = v and a.unit_code = e->>'ref' and a.quantity > 0)
      when 'WEAPON' then (select w.weapon_code from user_weapons w where w.user_id = v and w.weapon_code = e->>'ref')
      when 'PET' then (select p.pet_code from user_pets p where p.user_id = v and p.id::text = e->>'ref')
      when 'DECOR' then (select d.code from user_decor d where d.user_id = v and d.id::text = e->>'ref')
    end as code
  from jsonb_array_elements(p_items) e;
  alter table _it add column s int;
  update _it set s = coalesce((select (si.stats->>'size')::int from shop_items si where si.code = _it.code), case kind when 'UNIT' then 2 else 1 end) where true;

  if exists (select 1 from _it where kind is null or kind not in ('UNIT','PET','WEAPON','DECOR') or x is null or z is null or rot not between 0 and 3) then raise exception 'INVALID_LAYOUT'; end if;
  if exists (select 1 from _it where code is null) then raise exception 'ITEM_NOT_OWNED'; end if;
  if (select count(*) from _it) <> (select count(distinct (kind, ref)) from _it) then raise exception 'DUPLICATE_ITEM'; end if;
  if exists (select 1 from _it where x < 0 or z < 0 or x + s > g or z + s > g) then raise exception 'OUT_OF_BOUNDS'; end if;
  if exists (select 1 from _it where x < h0 + hs and x + s > h0 and z < h0 + hs and z + s > h0) then raise exception 'OVERLAP_HOUSE'; end if;
  if exists (select 1 from _it a join _it b on (a.kind, a.ref) < (b.kind, b.ref)
             where a.x < b.x + b.s and a.x + a.s > b.x and a.z < b.z + b.s and a.z + a.s > b.z) then raise exception 'OVERLAP'; end if;

  delete from base_layout where user_id = v;
  insert into base_layout (user_id, kind, ref, x, z, rot) select v, kind, ref, x, z, rot from _it;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function save_base_layout from public, anon;
grant execute on function save_base_layout to authenticated;

-- Nhà lên cấp to ra → bỏ các vật bị nhà mới đè lên (chúng về kho, người chơi đặt lại)
create function _clear_layout_under_house() returns trigger language plpgsql security definer set search_path = public as $$
declare g int := base_grid_size(); hs int := house_footprint(new.level); h0 int := (g - hs) / 2;
begin
  if new.level is distinct from old.level then
    delete from base_layout l using (
      select l2.kind, l2.ref, coalesce((select (si.stats->>'size')::int from shop_items si where si.code = case l2.kind
        when 'UNIT' then l2.ref when 'WEAPON' then l2.ref
        when 'PET' then (select pet_code from user_pets where id::text = l2.ref)
        when 'DECOR' then (select code from user_decor where id::text = l2.ref) end), case l2.kind when 'UNIT' then 2 else 1 end) as s
      from base_layout l2 where l2.user_id = new.user_id) sz
    where l.user_id = new.user_id and l.kind = sz.kind and l.ref = sz.ref
      and l.x < h0 + hs and l.x + sz.s > h0 and l.z < h0 + hs and l.z + sz.s > h0;
  end if;
  return new;
end $$;
create trigger house_level_layout after update of level on user_house for each row execute function _clear_layout_under_house();

-- Dọn dữ liệu mới khi reset (dev + mùa giải)
create or replace function dev_reset_game() returns void language plpgsql security definer set search_path = public as $$
declare t text;
begin
  foreach t in array array['attacks','shields','attempt_answers','level_attempts','user_weapons','user_pets','user_army',
    'typing_sessions','daily_counters','inventory','notifications','coin_transactions','word_progress','study_progress','admin_logs',
    'base_layout','user_decor','push_subscriptions']
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

-- ADM-04: reset mùa giải cũng xoá bố cục + đồ trang trí
create or replace function admin_reset_season(p_confirm text) returns void
language plpgsql security definer set search_path = public as $$
declare r record; v_start int := coalesce(cfg_num('STARTING_COINS'), 500)::int;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_confirm <> 'RESET' then raise exception 'CONFIRM_REQUIRED'; end if;
  delete from base_layout where true; delete from user_decor where true;
  delete from attacks where true; delete from shields where true;
  delete from attempt_answers where true; delete from level_attempts where true;
  delete from user_weapons where true; delete from user_pets where true; delete from user_army where true;
  delete from typing_sessions where true; delete from daily_counters where true; delete from inventory where true;
  delete from notifications where true; delete from coin_transactions where true;
  update user_house set level = 0, hp = 200, max_hp = 200, updated_at = now() where true;
  update profiles set coins = 0, army_level = 0 where onboarded_at is not null;
  for r in select id from profiles where onboarded_at is not null loop
    perform apply_coins(r.id, v_start, 'START', 'season-reset');
  end loop;
  update levels set status = case when order_no = 1 then 'OPEN'::level_status else 'LOCKED'::level_status end,
    opened_at = case when order_no = 1 then now() else null end, first_finished_at = null, deadline_at = null,
    closed_at = null, rewarded_at = null, winner_id = null, is_draw = false, seed = (floor(random() * 2147483647))::int where true;
  insert into admin_logs (admin_id, action, entity) values (auth.uid(), 'SEASON_RESET', 'game');
end $$;
