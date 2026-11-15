-- BTL-01/BTL-04 (sửa luật): người đánh CHỌN quân mang đi; quân mang đi rời căn cứ; khiên là bí mật —
-- xuất quân vào nhà đang có khiên thì mất toàn bộ quân đã chọn; hết trận lính sống trở về; bỏ dở thì về đủ.

insert into game_config (key, value, unit, description) values
  ('SHIELD_AUTO_NEXT', '1', '', 'Khiên đang bật chặn 1 đợt tấn công rồi mất; 1 = khiên kế tiếp trong kho tự bật (hết khiên → bị tấn công được), 0 = phải tự bật lại')
on conflict (key) do nothing;

-- khiên chặn 1 đợt tấn công rồi MẤT; còn khiên trong kho thì khiên kế tiếp tự bật (SHIELD_AUTO_NEXT). Trả về số khiên còn lại (đang bật + trong kho)
create function _shield_absorb(p_user uuid) returns int language plpgsql security definer set search_path = public as $$
declare s shields%rowtype; n int;
begin
  update shields set broken_at = now() where id = (select id from shields where user_id = p_user and activated_at is not null and broken_at is null and expires_at > now() order by expires_at limit 1);
  if coalesce(cfg_num('SHIELD_AUTO_NEXT'), 1) > 0 then
    select * into s from shields where user_id = p_user and activated_at is null and (source = 'PAID' or granted_date = vn_today())
      order by (source = 'FREE') desc, created_at limit 1 for update;
    if s.id is not null then
      update shields set activated_at = now(), expires_at = now() + make_interval(hours => cfg_num('SHIELD_DURATION_HOURS')::int) where id = s.id;
    end if;
  end if;
  select count(*) into n from shields where user_id = p_user and broken_at is null
    and ((activated_at is not null and expires_at > now()) or (activated_at is null and (source = 'PAID' or granted_date = vn_today())));
  return n;
end $$;
revoke all on function _shield_absorb from public, anon, authenticated;

-- ---------- khiên bí mật: chỉ chủ khiên đọc được ----------
drop policy if exists shields_read on shields;
create policy shields_read_own on shields for select to authenticated using (user_id = auth.uid());
revoke execute on function has_active_shield(uuid) from authenticated;   -- không cho dò khiên của người ấy qua RPC

-- ---------- trận: quân đã chọn ----------
alter table attacks drop constraint if exists attacks_status_check;
alter table attacks add constraint attacks_status_check check (status in ('PENDING', 'DONE', 'EXPIRED', 'BLOCKED'));
alter table attacks
  add column if not exists army jsonb,                          -- {mã lính: số mang đi}
  add column if not exists army_returned boolean not null default false;

-- lính đang đi đánh vẫn chiếm chỗ trong nhà (không luyện vượt sức chứa rồi quân về bị tràn)
create or replace function army_used(p_user uuid) returns int language sql stable security definer set search_path = public as $$
  select (coalesce((select sum(a.quantity * s.slots) from user_army a join shop_items s on s.code = a.unit_code where a.user_id = p_user), 0)
        + coalesce((select sum((e.value #>> '{}')::int * s.slots) from attacks t cross join lateral jsonb_each(t.army) e join shop_items s on s.code = e.key
                    where t.attacker_id = p_user and t.status = 'PENDING' and not t.army_returned), 0))::int
$$;

-- cộng lính về quân (dùng khi trở về)
create function _army_add(p_user uuid, p_units jsonb) returns void language plpgsql security definer set search_path = public as $$
declare k text; v jsonb; n int;
begin
  if p_units is null or jsonb_typeof(p_units) <> 'object' then return; end if;
  for k, v in select * from jsonb_each(p_units) loop
    n := coalesce((v #>> '{}')::int, 0);
    if n <= 0 then continue; end if;
    insert into user_army (user_id, unit_code, quantity) values (p_user, k, n)
    on conflict (user_id, unit_code) do update set quantity = user_army.quantity + n;
  end loop;
end $$;
revoke all on function _army_add from public, anon, authenticated;

-- trận bỏ dở / hết hạn: quân trở về đủ
create function _attack_expire(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
declare a attacks%rowtype;
begin
  select * into a from attacks where id = p_id for update;
  if a.id is null or a.status <> 'PENDING' then return; end if;
  if not a.army_returned then perform _army_add(a.attacker_id, a.army); end if;
  update attacks set status = 'EXPIRED', finished_at = now(), army_returned = true where id = p_id;
end $$;
revoke all on function _attack_expire from public, anon, authenticated;

create or replace function _expire_attacks() returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from attacks where status = 'PENDING' and created_at < now() - make_interval(mins => coalesce(cfg_num('ATTACK_PENDING_MINUTES'), 10)::int) loop
    perform _attack_expire(r.id);
  end loop;
end $$;

-- ---------- bắt đầu trận (service_role) ----------
drop function if exists _attack_begin(uuid, uuid, jsonb, numeric, numeric);
create function _attack_begin(p_attacker uuid, p_defender uuid, p_snapshot jsonb, p_atk numeric, p_def numeric, p_army jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare h user_house%rowtype; v_used int; v_id uuid; v_broke boolean := false; v_snap jsonb; k text; v jsonb; n int; have int; v_total int := 0;
  r record; a_name text; v_left int;
begin
  if partner_of(p_attacker) is distinct from p_defender then raise exception 'INVALID_TARGET'; end if;
  perform _expire_attacks();
  for r in select id from attacks where attacker_id = p_attacker and status = 'PENDING' loop perform _attack_expire(r.id); end loop;   -- trận trước bỏ dở → quân về
  perform _ensure_daily(p_attacker);
  insert into daily_counters (user_id, day) values (p_attacker, vn_today()) on conflict do nothing;
  select attacks_used into v_used from daily_counters where user_id = p_attacker and day = vn_today() for update;
  if coalesce(cfg_num('ATTACKS_PER_DAY'), 0) > 0 and v_used >= cfg_num('ATTACKS_PER_DAY') then raise exception 'ATTACK_LIMIT'; end if;
  select * into h from user_house where user_id = p_defender for update;
  if h.user_id is null then raise exception 'NO_HOUSE'; end if;
  if h.hp <= 0 then raise exception 'TARGET_RUINED'; end if;
  if exists (select 1 from attacks where defender_id = p_defender and status <> 'BLOCKED'
             and created_at > now() - make_interval(hours => cfg_num('POST_ATTACK_PROTECT_HOURS')::int)) then
    raise exception 'TARGET_PROTECTED'; end if;
  -- quân đã chọn: mỗi loại 1..số đang có
  if p_army is null or jsonb_typeof(p_army) <> 'object' then raise exception 'NO_ARMY'; end if;
  for k, v in select * from jsonb_each(p_army) loop
    n := coalesce((v #>> '{}')::int, 0);
    if n < 0 then raise exception 'INVALID_ARMY'; end if;
    if n = 0 then continue; end if;
    select quantity into have from user_army where user_id = p_attacker and unit_code = k for update;
    if have is null or n > have then raise exception 'INVALID_ARMY'; end if;
    v_total := v_total + n;
  end loop;
  if v_total < 1 then raise exception 'NO_ARMY'; end if;
  if has_active_shield(p_attacker) then
    update shields set broken_at = now() where user_id = p_attacker and activated_at is not null and broken_at is null and expires_at > now();
    v_broke := true;
  end if;
  update daily_counters set attacks_used = attacks_used + 1 where user_id = p_attacker and day = vn_today();
  -- quân mang đi rời căn cứ
  for k, v in select * from jsonb_each(p_army) loop
    update user_army set quantity = quantity - (v #>> '{}')::int where user_id = p_attacker and unit_code = k;
  end loop;
  -- khiên bí mật của người bị đánh: toàn bộ quân đã chọn bị tiêu diệt, không có trận; người bị đánh MẤT 1 khiên
  if has_active_shield(p_defender) then
    v_left := _shield_absorb(p_defender);
    insert into attacks (attacker_id, defender_id, atk, def, damage, loot, defender_hp_after, shield_broken, status, hp_before, army, army_returned, stats, finished_at)
    values (p_attacker, p_defender, p_atk, p_def, 0, 0, h.hp, v_broke, 'BLOCKED', h.hp, p_army, true, jsonb_build_object('unitsLost', p_army), now()) returning id into v_id;
    select display_name into a_name from profiles where id = p_attacker;
    perform notify(p_defender, 'SHIELD_BLOCK', '🛡️ Khiên đã chặn một đợt tấn công!',
      coalesce(nullif(a_name, ''), 'Người ấy') || ' xuất ' || v_total || ' lính vào nhà bạn và bị khiên tiêu diệt toàn bộ. Bạn mất 1 khiên'
        || case when v_left > 0 then ' — còn ' || v_left || ' khiên (khiên kế tiếp đã tự bật).' else ' — đã HẾT khiên, nhà có thể bị tấn công!' end,
      jsonb_build_object('attack', v_id, 'shields_left', v_left));
    return jsonb_build_object('id', v_id, 'blocked', true, 'lost', p_army, 'shield_broken', v_broke);
  end if;
  v_snap := jsonb_set(jsonb_set(p_snapshot, '{house,hp}', to_jsonb(h.hp)), '{house,maxHp}', to_jsonb(h.max_hp));
  insert into attacks (attacker_id, defender_id, atk, def, damage, loot, defender_hp_after, shield_broken, status, hp_before, snapshot, army)
  values (p_attacker, p_defender, p_atk, p_def, 0, 0, h.hp, v_broke, 'PENDING', h.hp, v_snap, p_army) returning id into v_id;
  return jsonb_build_object('id', v_id, 'snapshot', v_snap, 'shield_broken', v_broke, 'blocked', false);
end $$;
revoke all on function _attack_begin(uuid, uuid, jsonb, numeric, numeric, jsonb) from public, anon, authenticated;
grant execute on function _attack_begin(uuid, uuid, jsonb, numeric, numeric, jsonb) to service_role;

-- ---------- kết thúc trận: lính sống trở về, lính ngã mất; lính gác bị hạ mất ----------
create or replace function _attack_finish(p_id uuid, p_attacker uuid, p_damage int, p_deploys jsonb, p_stats jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a attacks%rowtype; h user_house%rowtype; v_dmg int; v_loot int; v_after int; a_name text; v_glost jsonb; v_gsum int;
  pct numeric := greatest(0, least(1, coalesce(cfg_num('UNIT_LOSS_PCT'), 1))); v_back jsonb := '{}'; v_lost jsonb := '{}'; k text; v jsonb; n int; d int;
begin
  select * into a from attacks where id = p_id and attacker_id = p_attacker for update;
  if a.id is null then raise exception 'ATTACK_NOT_FOUND'; end if;
  if a.status <> 'PENDING' then raise exception 'ATTACK_NOT_PENDING'; end if;
  if a.created_at < now() - make_interval(mins => coalesce(cfg_num('ATTACK_PENDING_MINUTES'), 10)::int) then
    perform _attack_expire(p_id);
    return jsonb_build_object('id', p_id, 'expired', true, 'damage', 0, 'loot', 0, 'hp_after', a.defender_hp_after, 'ruined', false, 'shield_broken', a.shield_broken, 'returned', a.army);
  end if;
  select * into h from user_house where user_id = a.defender_id for update;
  v_dmg := greatest(0, least(h.hp, a.hp_before, coalesce(p_damage, 0)));
  v_after := h.hp - v_dmg;
  v_loot := round(v_dmg * cfg_num('LOOT_COIN_PER_DAMAGE'))::int;
  update user_house set hp = v_after, updated_at = now() where user_id = a.defender_id;
  if v_loot > 0 then perform apply_coins(p_attacker, v_loot, 'LOOT', p_id::text); end if;   -- hệ thống tạo xu, không trừ của người bị đánh
  -- quân mang đi: ngã thì mất (× UNIT_LOSS_PCT), còn lại trở về
  for k, v in select * from jsonb_each(coalesce(a.army, '{}')) loop
    n := coalesce((v #>> '{}')::int, 0);
    d := least(n, floor(greatest(0, coalesce((p_stats #>> array['lost', k])::numeric, 0)) * pct + 1e-9)::int);
    if d > 0 then v_lost := v_lost || jsonb_build_object(k, d); end if;
    if n - d > 0 then v_back := v_back || jsonb_build_object(k, n - d); end if;
  end loop;
  perform _army_add(p_attacker, v_back);
  v_glost := _apply_unit_losses(a.defender_id, p_stats -> 'guardsLost');
  select coalesce(sum((value #>> '{}')::int), 0) into v_gsum from jsonb_each(v_glost);
  update attacks set status = 'DONE', damage = v_dmg, loot = v_loot, defender_hp_after = v_after, deploys = p_deploys, army_returned = true,
    stats = coalesce(p_stats, '{}') || jsonb_build_object('unitsLost', v_lost, 'returned', v_back, 'guardsLostApplied', v_glost), finished_at = now() where id = p_id;
  select display_name into a_name from profiles where id = p_attacker;
  perform notify(a.defender_id, 'ATTACKED', coalesce(nullif(a_name, ''), 'Người ấy') || ' vừa tấn công nhà bạn! ⚔️',
    'Mất ' || v_dmg || ' HP, bị lấy ' || v_loot || ' xu chiến lợi phẩm'
      || case when v_gsum > 0 then ', ' || v_gsum || ' lính gác hy sinh' else '' end
      || case when v_after = 0 and v_dmg > 0 then ' — NHÀ ĐỔ NÁT 💥' else '' end,
    jsonb_build_object('attack', p_id, 'damage', v_dmg));
  return jsonb_build_object('id', p_id, 'expired', false, 'damage', v_dmg, 'loot', v_loot, 'hp_after', v_after, 'ruined', v_after = 0 and v_dmg > 0,
    'shield_broken', a.shield_broken, 'units_lost', v_lost, 'returned', v_back, 'guards_lost', v_glost);
end $$;
revoke all on function _attack_finish from public, anon, authenticated;
grant execute on function _attack_finish to service_role;
