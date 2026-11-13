-- Phase 6: tấn công & khiên (BTL-01..05). Công thức trận đánh tính ở server.

create table shields (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  source text not null check (source in ('FREE', 'PAID')),
  granted_date date not null,
  activated_at timestamptz,
  expires_at timestamptz,
  broken_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index shields_free_once on shields (user_id, granted_date) where source = 'FREE';
alter table shields enable row level security;
create policy shields_read on shields for select to authenticated using (user_id = auth.uid() or user_id = partner_of(auth.uid()));

create table attacks (
  id uuid primary key default gen_random_uuid(),
  attacker_id uuid not null references profiles(id),
  defender_id uuid not null references profiles(id),
  atk numeric not null,
  def numeric not null,
  damage int not null,
  loot int not null,
  defender_hp_after int not null,
  shield_broken boolean not null default false,
  created_at timestamptz not null default now()
);
create index on attacks (defender_id, created_at desc);
create index on attacks (attacker_id, created_at desc);
alter table attacks enable row level security;
create policy attacks_read on attacks for select to authenticated using (attacker_id = auth.uid() or defender_id = auth.uid());

-- ---------- khiên ----------
create function has_active_shield(p_user uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from shields where user_id = p_user and activated_at is not null and broken_at is null and expires_at > now())
$$;

-- Cấp khiên miễn phí của ngày VN hôm nay (không cộng dồn: mỗi ngày 1 hàng, khiên cũ chưa dùng hết hạn cuối ngày)
create function _ensure_daily(p_user uuid) returns void language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  insert into shields (user_id, source, granted_date) values (p_user, 'FREE', vn_today()) on conflict do nothing;
  get diagnostics v_n = row_count;
  if v_n > 0 then perform notify(p_user, 'FREE_SHIELD', 'Bạn nhận 1 khiên miễn phí hôm nay 🛡️', 'Nhớ bật khiên trước khi đi ngủ nhé!', '{}'); end if;
end $$;
create function ensure_daily() returns void language sql security definer set search_path = public as $$
  select _ensure_daily(auth.uid()) where auth.uid() is not null
$$;

create function activate_shield() returns timestamptz language plpgsql security definer set search_path = public as $$
declare v uuid := auth.uid(); s shields%rowtype; v_exp timestamptz;
begin
  perform _ensure_daily(v);
  if has_active_shield(v) then raise exception 'SHIELD_ACTIVE'; end if;
  select * into s from shields where user_id = v and activated_at is null and (source = 'PAID' or granted_date = vn_today())
    order by (source = 'FREE') desc, created_at limit 1 for update;
  if s.id is null then raise exception 'NO_SHIELD'; end if;
  v_exp := now() + make_interval(hours => cfg_num('SHIELD_DURATION_HOURS')::int);
  update shields set activated_at = now(), expires_at = v_exp where id = s.id;
  return v_exp;
end $$;

create function buy_shield() returns void language plpgsql security definer set search_path = public as $$
declare v uuid := auth.uid(); v_bought int;
begin
  perform _ensure_daily(v);
  insert into daily_counters (user_id, day) values (v, vn_today()) on conflict do nothing;
  select shields_bought into v_bought from daily_counters where user_id = v and day = vn_today() for update;
  if v_bought >= cfg_num('SHIELD_MAX_BUY_PER_DAY') then raise exception 'SHIELD_LIMIT'; end if;
  perform apply_coins(v, -cfg_num('SHIELD_PRICE')::int, 'SHIELD', null);
  update daily_counters set shields_bought = shields_bought + 1 where user_id = v and day = vn_today();
  insert into shields (user_id, source, granted_date) values (v, 'PAID', vn_today());
end $$;

-- ---------- công thức trận đánh ----------
create function calc_atk(p_user uuid) returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(a.quantity * (s.stats->>'atk')::numeric), 0)
    * (1 + cfg_num('ARMY_UPGRADE_ATK_PCT') * (select army_level from profiles where id = p_user))
    * (1 + coalesce((select sum((w.stats->>'atk_pct')::numeric) from user_weapons uw join shop_items w on w.code = uw.weapon_code where uw.user_id = p_user), 0))
    * (1 + coalesce((select p.level * (d.stats->>'atk_pct_per_level')::numeric from user_pets p join shop_items d on d.code = p.pet_code
                     where p.user_id = p_user and p.pet_code = 'dragon' and coalesce((select hp from user_house where user_id = p_user), 1) > 0), 0))
  from user_army a join shop_items s on s.code = a.unit_code where a.user_id = p_user
$$;

create function calc_def(p_user uuid) returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((select (stats->>'def')::numeric from shop_items where code = 'house_' || (select level from user_house where user_id = p_user)), 0)
    + coalesce((select p.level * (c.stats->>'def_per_level')::numeric from user_pets p join shop_items c on c.code = p.pet_code
                where p.user_id = p_user and p.pet_code = 'corgi' and coalesce((select hp from user_house where user_id = p_user), 1) > 0), 0)
    + cfg_num('DEFENDER_ARMY_RATIO') * (
        select coalesce(sum(a.quantity * (s.stats->>'atk')::numeric), 0) * (1 + cfg_num('ARMY_UPGRADE_ATK_PCT') * (select army_level from profiles where id = p_user))
        from user_army a join shop_items s on s.code = a.unit_code where a.user_id = p_user)
$$;

-- Thuần: sát thương = ROUND(MAX(ATK − DEF, 10%·ATK) × random), tối đa bằng HP hiện tại; loot = ROUND(sát thương × hệ số)
create function calc_battle(p_atk numeric, p_def numeric, p_rand numeric, p_hp int) returns jsonb language sql stable security definer set search_path = public as $$
  with d as (select least(p_hp, round(greatest(p_atk - p_def, cfg_num('MIN_DAMAGE_RATIO') * p_atk) * p_rand)::int) as dmg)
  select jsonb_build_object('damage', dmg, 'loot', round(dmg * cfg_num('LOOT_COIN_PER_DAMAGE'))::int) from d
$$;

create function _attack(p_attacker uuid, p_defender uuid, p_rand numeric) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  h user_house%rowtype; v_used int; v_atk numeric; v_def numeric; v_rand numeric; b jsonb; v_id uuid; v_broke boolean := false;
  v_army int; v_after int; a_name text;
begin
  if partner_of(p_attacker) is distinct from p_defender then raise exception 'INVALID_TARGET'; end if;
  perform _ensure_daily(p_attacker);
  insert into daily_counters (user_id, day) values (p_attacker, vn_today()) on conflict do nothing;
  select attacks_used into v_used from daily_counters where user_id = p_attacker and day = vn_today() for update;
  if v_used >= cfg_num('ATTACKS_PER_DAY') then raise exception 'ATTACK_LIMIT'; end if;
  select coalesce(sum(quantity), 0) into v_army from user_army where user_id = p_attacker;
  if v_army < 1 then raise exception 'NO_ARMY'; end if;
  select * into h from user_house where user_id = p_defender for update;
  if h.hp <= 0 then raise exception 'TARGET_RUINED'; end if;
  if has_active_shield(p_defender) then raise exception 'TARGET_SHIELDED'; end if;
  if exists (select 1 from attacks where defender_id = p_defender and created_at > now() - make_interval(hours => cfg_num('POST_ATTACK_PROTECT_HOURS')::int)) then
    raise exception 'TARGET_PROTECTED'; end if;

  if has_active_shield(p_attacker) then   -- đi đánh khi đang có khiên → khiên vỡ
    update shields set broken_at = now() where user_id = p_attacker and activated_at is not null and broken_at is null and expires_at > now();
    v_broke := true;
  end if;
  v_atk := calc_atk(p_attacker); v_def := calc_def(p_defender);
  v_rand := coalesce(p_rand, cfg_num('DAMAGE_RANDOM_MIN') + random() * (cfg_num('DAMAGE_RANDOM_MAX') - cfg_num('DAMAGE_RANDOM_MIN')));
  b := calc_battle(v_atk, v_def, v_rand, h.hp);
  v_after := h.hp - (b->>'damage')::int;
  update user_house set hp = v_after, updated_at = now() where user_id = p_defender;
  update daily_counters set attacks_used = attacks_used + 1 where user_id = p_attacker and day = vn_today();
  if (b->>'loot')::int > 0 then perform apply_coins(p_attacker, (b->>'loot')::int, 'LOOT', null); end if;   -- hệ thống tạo xu, không trừ của người bị đánh
  insert into attacks (attacker_id, defender_id, atk, def, damage, loot, defender_hp_after, shield_broken)
  values (p_attacker, p_defender, v_atk, v_def, (b->>'damage')::int, (b->>'loot')::int, v_after, v_broke) returning id into v_id;
  select display_name into a_name from profiles where id = p_attacker;
  perform notify(p_defender, 'ATTACKED', coalesce(nullif(a_name, ''), 'Người ấy') || ' vừa tấn công nhà bạn! ⚔️',
    'Mất ' || (b->>'damage') || ' HP, bị lấy ' || (b->>'loot') || ' xu chiến lợi phẩm' || case when v_after = 0 then ' — NHÀ ĐỔ NÁT 💥' else '' end,
    jsonb_build_object('attack', v_id, 'damage', (b->>'damage')::int));
  return jsonb_build_object('id', v_id, 'atk', v_atk, 'def', v_def, 'damage', (b->>'damage')::int, 'loot', (b->>'loot')::int,
    'hp_after', v_after, 'ruined', v_after = 0, 'shield_broken', v_broke);
end $$;

create function attack(p_defender uuid) returns jsonb language sql security definer set search_path = public as $$
  select _attack(auth.uid(), p_defender, null)
$$;

revoke all on function has_active_shield, _ensure_daily, calc_atk, calc_def, calc_battle, _attack from public, anon, authenticated;
grant execute on function has_active_shield to authenticated;
revoke all on function ensure_daily, activate_shield, buy_shield, attack from public, anon;
grant execute on function ensure_daily, activate_shield, buy_shield, attack to authenticated;

-- cron_tick bổ sung: cấp khiên miễn phí hằng ngày cho mọi người + nhắc khiên sắp hết (30 phút)
create or replace function cron_tick() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_resume int := coalesce(cfg_num('LEVEL_RESUME_MINUTES'), 10)::int; r record; hrs int; typ text;
begin
  for r in select id from profiles where deleted_at is null and onboarded_at is not null loop perform _ensure_daily(r.id); end loop;
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
  for r in select s.id, s.user_id from shields s where s.activated_at is not null and s.broken_at is null
           and s.expires_at > now() and s.expires_at <= now() + interval '30 minutes'
           and not exists (select 1 from notifications n where n.user_id = s.user_id and n.type = 'SHIELD_EXPIRING' and n.data->>'shield' = s.id::text) loop
    perform notify(r.user_id, 'SHIELD_EXPIRING', 'Khiên còn chưa đến 30 phút 🛡️', 'Bật khiên mới nếu cần.', jsonb_build_object('shield', r.id));
  end loop;
end $$;
revoke all on function cron_tick from public, anon;
grant execute on function cron_tick to authenticated, service_role;

-- Lịch pg_cron 00:00 giờ VN (17:00 UTC) cấp khiên miễn phí (nếu extension có sẵn); cron_tick 5 phút cũng đảm nhiệm việc này
do $$ begin
  perform cron.schedule('love-quest-daily', '0 17 * * *', 'select public.cron_tick()');
exception when others then null;
end $$;
