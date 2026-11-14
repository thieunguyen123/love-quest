-- BTL-01 (sửa luật): lính ngã trong trận là MẤT THẬT.
-- Người tấn công mất đúng số lính chết (p_stats.lost), người bị đánh mất đúng số lính gác bị giết (p_stats.guardsLost), × UNIT_LOSS_PCT.
-- p_stats do server tự mô phỏng lại từ nhật ký rải quân (lib/attack-core.ts) — client không gửi số này. Trận hết hạn / bỏ dở không mất lính.

insert into game_config (key, value, unit, description) values
  ('UNIT_LOSS_PCT', '1', '%', 'Phần lính chết trong trận bị mất thật (1 = chết bao nhiêu mất bấy nhiêu, 0 = quân tự hồi đủ) — áp cho cả lính tấn công và lính gác')
on conflict (key) do nothing;

-- trừ lính theo bảng {mã lính: số chết}; trả về {mã: số thật sự bị trừ}
create function _apply_unit_losses(p_user uuid, p_dead jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare k text; v jsonb; n int; have int; out jsonb := '{}'; pct numeric := greatest(0, least(1, coalesce(cfg_num('UNIT_LOSS_PCT'), 1)));
begin
  if p_dead is null or jsonb_typeof(p_dead) <> 'object' then return out; end if;
  for k, v in select * from jsonb_each(p_dead) loop
    n := floor(greatest(0, coalesce((v #>> '{}')::numeric, 0)) * pct + 1e-9)::int;
    if n <= 0 then continue; end if;
    select quantity into have from user_army where user_id = p_user and unit_code = k for update;
    if have is null or have <= 0 then continue; end if;
    n := least(n, have);
    update user_army set quantity = quantity - n where user_id = p_user and unit_code = k;
    out := out || jsonb_build_object(k, n);
  end loop;
  return out;
end $$;
revoke all on function _apply_unit_losses from public, anon, authenticated;

create or replace function _attack_finish(p_id uuid, p_attacker uuid, p_damage int, p_deploys jsonb, p_stats jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a attacks%rowtype; h user_house%rowtype; v_dmg int; v_loot int; v_after int; a_name text; v_lost jsonb; v_glost jsonb; v_gsum int;
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
  -- lính chết là mất (cả 2 bên)
  v_lost := _apply_unit_losses(p_attacker, p_stats -> 'lost');
  v_glost := _apply_unit_losses(a.defender_id, p_stats -> 'guardsLost');
  select coalesce(sum((value #>> '{}')::int), 0) into v_gsum from jsonb_each(v_glost);
  update attacks set status = 'DONE', damage = v_dmg, loot = v_loot, defender_hp_after = v_after, deploys = p_deploys,
    stats = coalesce(p_stats, '{}') || jsonb_build_object('unitsLost', v_lost, 'guardsLostApplied', v_glost), finished_at = now() where id = p_id;
  select display_name into a_name from profiles where id = p_attacker;
  perform notify(a.defender_id, 'ATTACKED', coalesce(nullif(a_name, ''), 'Người ấy') || ' vừa tấn công nhà bạn! ⚔️',
    'Mất ' || v_dmg || ' HP, bị lấy ' || v_loot || ' xu chiến lợi phẩm'
      || case when v_gsum > 0 then ', ' || v_gsum || ' lính gác hy sinh' else '' end
      || case when v_after = 0 and v_dmg > 0 then ' — NHÀ ĐỔ NÁT 💥' else '' end,
    jsonb_build_object('attack', p_id, 'damage', v_dmg));
  return jsonb_build_object('id', p_id, 'expired', false, 'damage', v_dmg, 'loot', v_loot, 'hp_after', v_after, 'ruined', v_after = 0 and v_dmg > 0,
    'shield_broken', a.shield_broken, 'units_lost', v_lost, 'guards_lost', v_glost);
end $$;
revoke all on function _attack_finish from public, anon, authenticated;
grant execute on function _attack_finish to service_role;
