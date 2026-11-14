-- Phase 12: không giới hạn lượt tấn công mỗi ngày (BTL-01) + xu cập nhật realtime (profiles vào publication Realtime).

-- ATTACKS_PER_DAY = 0 nghĩa là không giới hạn. Các điều kiện khác (khiên, bảo hộ sau khi bị đánh, nhà đổ nát, có lính) giữ nguyên.
update game_config set value = '0', description = 'Số lần tấn công tối đa mỗi ngày (0 = không giới hạn)' where key = 'ATTACKS_PER_DAY';

create or replace function _attack_begin(p_attacker uuid, p_defender uuid, p_snapshot jsonb, p_atk numeric, p_def numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare h user_house%rowtype; v_used int; v_army int; v_id uuid; v_broke boolean := false; v_snap jsonb;
begin
  if partner_of(p_attacker) is distinct from p_defender then raise exception 'INVALID_TARGET'; end if;
  perform _expire_attacks();
  update attacks set status = 'EXPIRED', finished_at = now() where attacker_id = p_attacker and status = 'PENDING';   -- trận trước bỏ dở
  perform _ensure_daily(p_attacker);
  insert into daily_counters (user_id, day) values (p_attacker, vn_today()) on conflict do nothing;
  select attacks_used into v_used from daily_counters where user_id = p_attacker and day = vn_today() for update;
  -- ATTACKS_PER_DAY ≤ 0 = không giới hạn lượt (Phase 12); vẫn đếm attacks_used để thống kê
  if coalesce(cfg_num('ATTACKS_PER_DAY'), 0) > 0 and v_used >= cfg_num('ATTACKS_PER_DAY') then raise exception 'ATTACK_LIMIT'; end if;
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

-- Realtime: số xu ở thanh trên cập nhật ngay khi mua/nâng cấp/nhận thưởng (RLS profiles_read vẫn áp dụng cho Realtime)
do $$ begin
  alter publication supabase_realtime add table profiles;
exception when duplicate_object then null;
end $$;
