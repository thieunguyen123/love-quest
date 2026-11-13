-- Phase 5: kinh tế, shop, căn cứ (ECO-01..03, BASE-01..06)
create type shop_category as enum ('HOUSE', 'PET', 'UNIT', 'WEAPON');

create table shop_items (
  code text primary key,
  category shop_category not null,
  name_vi text not null,
  price int not null check (price >= 0),
  stats jsonb not null default '{}',
  unlock_level int,         -- mở khi màn có order_no này ĐÃ ĐÓNG
  slots int not null default 0,
  sort int not null default 0,
  emoji text
);
alter table shop_items enable row level security;
create policy shop_read on shop_items for select to authenticated using (true);
create policy shop_admin on shop_items for all to authenticated using (is_admin()) with check (is_admin());

create table user_pets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  pet_code text not null references shop_items(code),
  nickname text not null,
  level int not null default 1 check (level between 1 and 5),
  acquired_at timestamptz not null default now(),
  unique (user_id, pet_code)
);
create table user_army (
  user_id uuid not null references profiles(id) on delete cascade,
  unit_code text not null references shop_items(code),
  quantity int not null default 0 check (quantity >= 0),
  primary key (user_id, unit_code)
);
create table user_weapons (
  user_id uuid not null references profiles(id) on delete cascade,
  weapon_code text not null references shop_items(code),
  acquired_at timestamptz not null default now(),
  primary key (user_id, weapon_code)
);
alter table user_pets enable row level security;
alter table user_army enable row level security;
alter table user_weapons enable row level security;
-- căn cứ của cặp: xem được của mình và người ấy (để tấn công / so sánh)
create policy pets_read on user_pets for select to authenticated using (user_id = auth.uid() or user_id = partner_of(auth.uid()));
create policy army_read on user_army for select to authenticated using (user_id = auth.uid() or user_id = partner_of(auth.uid()));
create policy weapons_read on user_weapons for select to authenticated using (user_id = auth.uid() or user_id = partner_of(auth.uid()));

-- mở khóa theo màn đã đóng
create function _unlocked(p_unlock int) returns boolean language sql stable security definer set search_path = public as $$
  select p_unlock is null or exists (select 1 from levels where order_no = p_unlock and status = 'CLOSED')
$$;

create function army_capacity(p_user uuid) returns int language sql stable security definer set search_path = public as $$
  select (cfg_num('ARMY_CAP_BASE') + cfg_num('ARMY_CAP_PER_HOUSE_LEVEL') * coalesce((select level from user_house where user_id = p_user), 0))::int
$$;
create function army_used(p_user uuid) returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(a.quantity * s.slots), 0)::int from user_army a join shop_items s on s.code = a.unit_code where a.user_id = p_user
$$;

-- Buff Mèo mướp: +3% xu màn / cấp (mất khi nhà đổ nát, BASE-03)
create or replace function coin_bonus_pct(p_user uuid) returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((select p.level * (s.stats->>'coin_pct_per_level')::numeric from user_pets p join shop_items s on s.code = p.pet_code
          where p.user_id = p_user and p.pet_code = 'cat'
            and coalesce((select hp from user_house where user_id = p_user), 1) > 0), 0)
$$;

create function buy_pet(p_code text) returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid := auth.uid(); i shop_items%rowtype; v_id uuid;
begin
  select * into i from shop_items where code = p_code and category = 'PET';
  if i.code is null then raise exception 'ITEM_NOT_FOUND'; end if;
  if not _unlocked(i.unlock_level) then raise exception 'ITEM_LOCKED'; end if;
  if exists (select 1 from user_pets where user_id = v and pet_code = p_code) then raise exception 'ALREADY_OWNED'; end if;
  perform apply_coins(v, -i.price, 'PURCHASE', p_code);
  insert into user_pets (user_id, pet_code, nickname) values (v, p_code, i.name_vi) returning id into v_id;
  return v_id;
end $$;

create function rename_pet(p_id uuid, p_name text) returns void language plpgsql security definer set search_path = public as $$
begin
  if char_length(trim(p_name)) not between 1 and 20 then raise exception 'INVALID_NAME'; end if;
  update user_pets set nickname = trim(p_name) where id = p_id and user_id = auth.uid();
  if not found then raise exception 'PET_NOT_FOUND'; end if;
end $$;

create function upgrade_pet(p_id uuid) returns int language plpgsql security definer set search_path = public as $$
declare v uuid := auth.uid(); p user_pets%rowtype; v_cost int;
begin
  select * into p from user_pets where id = p_id and user_id = v for update;
  if p.id is null then raise exception 'PET_NOT_FOUND'; end if;
  if p.level >= cfg_num('PET_MAX_LEVEL') then raise exception 'MAX_LEVEL'; end if;
  v_cost := (cfg_num('PET_UPGRADE_COST_STEP') * p.level)::int;
  perform spend_item(v, 'PET_UPGRADE', 1);
  perform apply_coins(v, -v_cost, 'UPGRADE', 'pet:' || p.pet_code);
  update user_pets set level = level + 1 where id = p.id;
  return p.level + 1;
end $$;

create function buy_unit(p_code text, p_qty int) returns int language plpgsql security definer set search_path = public as $$
declare v uuid := auth.uid(); i shop_items%rowtype;
begin
  if p_qty < 1 or p_qty > 100 then raise exception 'INVALID_QTY'; end if;
  select * into i from shop_items where code = p_code and category = 'UNIT';
  if i.code is null then raise exception 'ITEM_NOT_FOUND'; end if;
  if not _unlocked(i.unlock_level) then raise exception 'ITEM_LOCKED'; end if;
  if army_used(v) + i.slots * p_qty > army_capacity(v) then raise exception 'ARMY_FULL'; end if;
  perform apply_coins(v, -(i.price * p_qty), 'PURCHASE', p_code || 'x' || p_qty);
  insert into user_army (user_id, unit_code, quantity) values (v, p_code, p_qty)
  on conflict (user_id, unit_code) do update set quantity = user_army.quantity + p_qty;
  return army_used(v);
end $$;

create function upgrade_army() returns int language plpgsql security definer set search_path = public as $$
declare v uuid := auth.uid(); lv int;
begin
  select army_level into lv from profiles where id = v for update;
  if lv >= cfg_num('ARMY_MAX_LEVEL') then raise exception 'MAX_LEVEL'; end if;
  perform spend_item(v, 'ARMY_UPGRADE', 1);
  perform apply_coins(v, -(cfg_num('ARMY_UPGRADE_COST_STEP') * (lv + 1))::int, 'UPGRADE', 'army');
  update profiles set army_level = lv + 1 where id = v;
  return lv + 1;
end $$;

create function buy_weapon(p_code text) returns void language plpgsql security definer set search_path = public as $$
declare v uuid := auth.uid(); i shop_items%rowtype;
begin
  select * into i from shop_items where code = p_code and category = 'WEAPON';
  if i.code is null then raise exception 'ITEM_NOT_FOUND'; end if;
  if not _unlocked(i.unlock_level) then raise exception 'ITEM_LOCKED'; end if;
  if exists (select 1 from user_weapons where user_id = v and weapon_code = p_code) then raise exception 'ALREADY_OWNED'; end if;
  perform spend_item(v, 'WEAPON_LICENSE', 1);
  perform apply_coins(v, -i.price, 'PURCHASE', p_code);
  insert into user_weapons (user_id, weapon_code) values (v, p_code);
end $$;

create function upgrade_house() returns int language plpgsql security definer set search_path = public as $$
declare v uuid := auth.uid(); h user_house%rowtype; nx shop_items%rowtype;
begin
  select * into h from user_house where user_id = v for update;
  if h.user_id is null then raise exception 'NO_HOUSE'; end if;
  select * into nx from shop_items where code = 'house_' || (h.level + 1);
  if nx.code is null then raise exception 'MAX_LEVEL'; end if;
  if h.hp < h.max_hp then raise exception 'HOUSE_DAMAGED'; end if;   -- BASE-02: chỉ nâng cấp khi đầy HP
  perform apply_coins(v, -nx.price, 'UPGRADE', nx.code);
  update user_house set level = h.level + 1, max_hp = (nx.stats->>'max_hp')::int, hp = (nx.stats->>'max_hp')::int, updated_at = now() where user_id = v;
  return h.level + 1;
end $$;

create function repair_house(p_hp int) returns int language plpgsql security definer set search_path = public as $$
declare v uuid := auth.uid(); h user_house%rowtype;
begin
  select * into h from user_house where user_id = v for update;
  if p_hp < 1 or p_hp > h.max_hp - h.hp then raise exception 'INVALID_HP'; end if;
  perform apply_coins(v, -(p_hp * cfg_num('REPAIR_COST_PER_HP'))::int, 'REPAIR', p_hp::text);
  update user_house set hp = hp + p_hp, updated_at = now() where user_id = v;
  return h.hp + p_hp;
end $$;

revoke all on function buy_pet, rename_pet, upgrade_pet, buy_unit, upgrade_army, buy_weapon, upgrade_house, repair_house from public, anon;
grant execute on function buy_pet, rename_pet, upgrade_pet, buy_unit, upgrade_army, buy_weapon, upgrade_house, repair_house to authenticated;
revoke all on function _unlocked, army_capacity, army_used from public, anon;
grant execute on function _unlocked, army_capacity, army_used to authenticated;
