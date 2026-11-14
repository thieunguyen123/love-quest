-- Phase 9: công trình phòng thủ, bẫy (BASE-10, BASE-11) + trận đánh rải quân kiểu Clash of Clans (BTL-07, BTL-08).
-- Mô phỏng trận chạy ở server Next.js (src/lib/game/sim.ts) rồi ghi kết quả qua _attack_begin / _attack_finish (chỉ service_role).

alter type shop_category add value if not exists 'DEFENSE';
alter type shop_category add value if not exists 'TRAP';

-- ---------- công trình phòng thủ & bẫy: mỗi cái 1 hàng ----------
create table user_defenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  code text not null references shop_items(code),
  kind text not null check (kind in ('DEFENSE', 'TRAP')),
  created_at timestamptz not null default now()
);
create index on user_defenses (user_id);
alter table user_defenses enable row level security;
-- người ấy thấy tháp/pháo của mình (để do thám) nhưng KHÔNG thấy bẫy
create policy defenses_read on user_defenses for select to authenticated
  using (user_id = auth.uid() or (user_id = partner_of(auth.uid()) and kind = 'DEFENSE'));

create function buy_defense(p_code text) returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid := auth.uid(); i shop_items%rowtype; v_id uuid; v_lv int; v_max int;
begin
  if v is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into i from shop_items where code = p_code and category::text in ('DEFENSE', 'TRAP');
  if i.code is null then raise exception 'ITEM_NOT_FOUND'; end if;
  if not _unlocked(i.unlock_level) then raise exception 'ITEM_LOCKED'; end if;
  select level into v_lv from user_house where user_id = v;
  if v_lv is null then raise exception 'NO_HOUSE'; end if;
  v_max := coalesce((i.stats->'max_by_house'->>v_lv)::int, 1);
  if (select count(*) from user_defenses where user_id = v and code = p_code) >= v_max then raise exception 'DEFENSE_LIMIT'; end if;
  perform apply_coins(v, -i.price, 'PURCHASE', p_code);
  insert into user_defenses (user_id, code, kind) values (v, p_code, i.category::text) returning id into v_id;
  return v_id;
end $$;
revoke all on function buy_defense from public, anon;
grant execute on function buy_defense to authenticated;

-- ---------- bố cục: thêm 2 loại vật, ẩn bẫy với người ấy ----------
alter table base_layout drop constraint base_layout_kind_check;
alter table base_layout add constraint base_layout_kind_check check (kind in ('UNIT', 'PET', 'WEAPON', 'DECOR', 'DEFENSE', 'TRAP'));
drop policy layout_read on base_layout;
create policy layout_read on base_layout for select to authenticated
  using (user_id = auth.uid() or (user_id = partner_of(auth.uid()) and kind <> 'TRAP'));

-- mã shop của 1 vật trong bố cục (null = không sở hữu)
create function _layout_code(p_user uuid, p_kind text, p_ref text) returns text language sql stable security definer set search_path = public as $$
  select case p_kind
    when 'UNIT' then (select a.unit_code from user_army a where a.user_id = p_user and a.unit_code = p_ref and a.quantity > 0)
    when 'WEAPON' then (select w.weapon_code from user_weapons w where w.user_id = p_user and w.weapon_code = p_ref)
    when 'PET' then (select p.pet_code from user_pets p where p.user_id = p_user and p.id::text = p_ref)
    when 'DECOR' then (select d.code from user_decor d where d.user_id = p_user and d.id::text = p_ref)
    when 'DEFENSE' then (select d.code from user_defenses d where d.user_id = p_user and d.id::text = p_ref and d.kind = 'DEFENSE')
    when 'TRAP' then (select d.code from user_defenses d where d.user_id = p_user and d.id::text = p_ref and d.kind = 'TRAP')
  end
$$;
revoke all on function _layout_code from public, anon, authenticated;

create or replace function save_base_layout(p_items jsonb) returns int language plpgsql security definer set search_path = public as $$
declare v uuid := auth.uid(); g int := base_grid_size(); hl int; hs int; h0 int; n int;
begin
  if v is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 300 then raise exception 'INVALID_LAYOUT'; end if;
  select level into hl from user_house where user_id = v;
  if hl is null then raise exception 'NO_HOUSE'; end if;
  hs := house_footprint(hl); h0 := (g - hs) / 2;

  create temp table _it on commit drop as
  select e->>'kind' as kind, e->>'ref' as ref, (e->>'x')::int as x, (e->>'z')::int as z, coalesce((e->>'rot')::int, 0) as rot,
    _layout_code(v, e->>'kind', e->>'ref') as code
  from jsonb_array_elements(p_items) e;
  alter table _it add column s int;
  update _it set s = coalesce((select (si.stats->>'size')::int from shop_items si where si.code = _it.code), case kind when 'UNIT' then 2 when 'DEFENSE' then 2 else 1 end) where true;

  if exists (select 1 from _it where kind is null or kind not in ('UNIT','PET','WEAPON','DECOR','DEFENSE','TRAP') or x is null or z is null or rot not between 0 and 3) then raise exception 'INVALID_LAYOUT'; end if;
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

create or replace function _clear_layout_under_house() returns trigger language plpgsql security definer set search_path = public as $$
declare g int := base_grid_size(); hs int := house_footprint(new.level); h0 int := (g - hs) / 2;
begin
  if new.level is distinct from old.level then
    delete from base_layout l using (
      select l2.kind, l2.ref, coalesce((select (si.stats->>'size')::int from shop_items si where si.code = _layout_code(new.user_id, l2.kind, l2.ref)),
        case l2.kind when 'UNIT' then 2 when 'DEFENSE' then 2 else 1 end) as s
      from base_layout l2 where l2.user_id = new.user_id) sz
    where l.user_id = new.user_id and l.kind = sz.kind and l.ref = sz.ref
      and l.x < h0 + hs and l.x + sz.s > h0 and l.z < h0 + hs and l.z + sz.s > h0;
  end if;
  return new;
end $$;

-- ---------- trận đánh: ảnh chụp + nhật ký rải quân ----------
alter table attacks
  add column status text not null default 'DONE' check (status in ('PENDING', 'DONE', 'EXPIRED')),
  add column hp_before int,
  add column snapshot jsonb,
  add column deploys jsonb,
  add column stats jsonb,
  add column finished_at timestamptz;

-- Trận bỏ dở quá ATTACK_PENDING_MINUTES → kết thúc với 0 sát thương (lượt đã trừ lúc bắt đầu)
create function _expire_attacks() returns void language sql security definer set search_path = public as $$
  update attacks set status = 'EXPIRED', finished_at = now()
  where status = 'PENDING' and created_at < now() - make_interval(mins => coalesce(cfg_num('ATTACK_PENDING_MINUTES'), 10)::int)
$$;

-- Bắt đầu trận: kiểm tra điều kiện (BTL-01), trừ lượt, vỡ khiên của người đánh, lưu ảnh chụp. Chỉ server (service_role) gọi.
create function _attack_begin(p_attacker uuid, p_defender uuid, p_snapshot jsonb, p_atk numeric, p_def numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare h user_house%rowtype; v_used int; v_army int; v_id uuid; v_broke boolean := false; v_snap jsonb;
begin
  if partner_of(p_attacker) is distinct from p_defender then raise exception 'INVALID_TARGET'; end if;
  perform _expire_attacks();
  update attacks set status = 'EXPIRED', finished_at = now() where attacker_id = p_attacker and status = 'PENDING';   -- trận trước bỏ dở
  perform _ensure_daily(p_attacker);
  insert into daily_counters (user_id, day) values (p_attacker, vn_today()) on conflict do nothing;
  select attacks_used into v_used from daily_counters where user_id = p_attacker and day = vn_today() for update;
  if v_used >= cfg_num('ATTACKS_PER_DAY') then raise exception 'ATTACK_LIMIT'; end if;
  select coalesce(sum(quantity), 0) into v_army from user_army where user_id = p_attacker;
  if v_army < 1 then raise exception 'NO_ARMY'; end if;
  select * into h from user_house where user_id = p_defender for update;
  if h.user_id is null then raise exception 'NO_HOUSE'; end if;
  if h.hp <= 0 then raise exception 'TARGET_RUINED'; end if;
  if has_active_shield(p_defender) then raise exception 'TARGET_SHIELDED'; end if;
  if exists (select 1 from attacks where defender_id = p_defender and created_at > now() - make_interval(hours => cfg_num('POST_ATTACK_PROTECT_HOURS')::int)) then
    raise exception 'TARGET_PROTECTED'; end if;
  if has_active_shield(p_attacker) then
    update shields set broken_at = now() where user_id = p_attacker and activated_at is not null and broken_at is null and expires_at > now();
    v_broke := true;
  end if;
  update daily_counters set attacks_used = attacks_used + 1 where user_id = p_attacker and day = vn_today();
  -- HP nhà trong ảnh chụp = HP thật lúc khoá hàng
  v_snap := jsonb_set(jsonb_set(p_snapshot, '{house,hp}', to_jsonb(h.hp)), '{house,maxHp}', to_jsonb(h.max_hp));
  insert into attacks (attacker_id, defender_id, atk, def, damage, loot, defender_hp_after, shield_broken, status, hp_before, snapshot)
  values (p_attacker, p_defender, p_atk, p_def, 0, 0, h.hp, v_broke, 'PENDING', h.hp, v_snap) returning id into v_id;
  return jsonb_build_object('id', v_id, 'snapshot', v_snap, 'shield_broken', v_broke);
end $$;

-- Kết thúc trận: p_damage do server mô phỏng ra. Trừ HP (không vượt HP hiện tại), cộng loot, thông báo. Idempotent theo status.
create function _attack_finish(p_id uuid, p_attacker uuid, p_damage int, p_deploys jsonb, p_stats jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a attacks%rowtype; h user_house%rowtype; v_dmg int; v_loot int; v_after int; a_name text;
begin
  select * into a from attacks where id = p_id and attacker_id = p_attacker for update;
  if a.id is null then raise exception 'ATTACK_NOT_FOUND'; end if;
  if a.status <> 'PENDING' then raise exception 'ATTACK_NOT_PENDING'; end if;
  if a.created_at < now() - make_interval(mins => coalesce(cfg_num('ATTACK_PENDING_MINUTES'), 10)::int) then
    update attacks set status = 'EXPIRED', finished_at = now() where id = p_id;
    return jsonb_build_object('id', p_id, 'expired', true, 'damage', 0, 'loot', 0, 'hp_after', a.defender_hp_after, 'ruined', false, 'shield_broken', a.shield_broken);
  end if;
  select * into h from user_house where user_id = a.defender_id for update;
  v_dmg := greatest(0, least(h.hp, a.hp_before, coalesce(p_damage, 0)));
  v_after := h.hp - v_dmg;
  v_loot := round(v_dmg * cfg_num('LOOT_COIN_PER_DAMAGE'))::int;
  update user_house set hp = v_after, updated_at = now() where user_id = a.defender_id;
  if v_loot > 0 then perform apply_coins(p_attacker, v_loot, 'LOOT', p_id::text); end if;   -- hệ thống tạo xu, không trừ của người bị đánh
  update attacks set status = 'DONE', damage = v_dmg, loot = v_loot, defender_hp_after = v_after, deploys = p_deploys, stats = p_stats, finished_at = now() where id = p_id;
  select display_name into a_name from profiles where id = p_attacker;
  perform notify(a.defender_id, 'ATTACKED', coalesce(nullif(a_name, ''), 'Người ấy') || ' vừa tấn công nhà bạn! ⚔️',
    'Mất ' || v_dmg || ' HP, bị lấy ' || v_loot || ' xu chiến lợi phẩm' || case when v_after = 0 and v_dmg > 0 then ' — NHÀ ĐỔ NÁT 💥' else '' end,
    jsonb_build_object('attack', p_id, 'damage', v_dmg));
  return jsonb_build_object('id', p_id, 'expired', false, 'damage', v_dmg, 'loot', v_loot, 'hp_after', v_after, 'ruined', v_after = 0 and v_dmg > 0, 'shield_broken', a.shield_broken);
end $$;

revoke all on function _expire_attacks, _attack_begin, _attack_finish from public, anon, authenticated;
grant execute on function _expire_attacks, _attack_begin, _attack_finish to service_role;
-- RPC tấn công bản cũ (công thức ATK − DEF) không còn cho client gọi: nếu không sẽ né được tháp/bẫy
revoke execute on function attack from authenticated;

-- cron_tick: thêm việc đóng trận bỏ dở
alter function cron_tick() rename to _cron_tick_v2;
revoke all on function _cron_tick_v2 from public, anon, authenticated;
create function cron_tick() returns void language plpgsql security definer set search_path = public as $$
begin
  perform _cron_tick_v2();
  perform _expire_attacks();
end $$;
revoke all on function cron_tick from public, anon;
grant execute on function cron_tick to authenticated, service_role;

-- ---------- reset (dev + mùa giải) cũng xoá công trình phòng thủ ----------
create or replace function dev_reset_game() returns void language plpgsql security definer set search_path = public as $$
declare t text;
begin
  foreach t in array array['attacks','shields','attempt_answers','level_attempts','user_weapons','user_pets','user_army',
    'typing_sessions','daily_counters','inventory','notifications','coin_transactions','word_progress','study_progress','admin_logs',
    'base_layout','user_decor','user_defenses','push_subscriptions']
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

alter function admin_reset_season(text) rename to _admin_reset_season_v2;
revoke all on function _admin_reset_season_v2 from public, anon, authenticated;
create function admin_reset_season(p_confirm text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_confirm <> 'RESET' then raise exception 'CONFIRM_REQUIRED'; end if;
  delete from user_defenses where true;
  perform _admin_reset_season_v2(p_confirm);
end $$;
revoke all on function admin_reset_season from public, anon;
grant execute on function admin_reset_season to authenticated;
