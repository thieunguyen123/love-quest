-- Phase 10: mở rộng căn cứ bằng dọn vật cản (BASE-13), kiểu nhà (BASE-14), thú cưng mới + buff theo chỉ số (BASE-03),
-- bỏ vũ khí khỏi cửa hàng (BASE-05). Lưới 20 → 30 ô: bố cục cũ dời +5 ô để giữ nguyên vị trí so với nhà.

alter type shop_category add value if not exists 'STYLE';

-- ---------- lưới lớn hơn: dời bố cục cũ, cập nhật cấu hình ----------
update base_layout set x = x + 5, z = z + 5 where coalesce(cfg_num('BASE_GRID_SIZE'), 20) = 20;
insert into game_config (key, value, unit, description) values
  ('BASE_GRID_SIZE', '30', 'ô', 'Cạnh lưới căn cứ 3D (mỗi ô 2 m). Nhà chính ở giữa.'),
  ('BASE_FREE_SIZE', '20', 'ô', 'Cạnh vùng trống ở giữa (không có vật cản) lúc bắt đầu')
on conflict (key) do update set value = excluded.value;

-- ---------- vật cản (định nghĩa chung, seed sinh ra) & vật cản đã dọn ----------
create table obstacles (
  id text primary key, code text not null, x int not null, z int not null, size int not null check (size between 1 and 4), price int not null check (price >= 0)
);
alter table obstacles enable row level security;
create policy obstacles_read on obstacles for select to authenticated using (true);

create table base_clear (
  user_id uuid not null references profiles(id) on delete cascade,
  obstacle_id text not null references obstacles(id) on delete cascade,
  cleared_at timestamptz not null default now(),
  primary key (user_id, obstacle_id)
);
alter table base_clear enable row level security;
create policy clear_read on base_clear for select to authenticated using (user_id = auth.uid() or user_id = partner_of(auth.uid()));

create function clear_obstacle(p_id text) returns int language plpgsql security definer set search_path = public as $$
declare v uuid := auth.uid(); o obstacles%rowtype;
begin
  if v is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into o from obstacles where id = p_id;
  if o.id is null then raise exception 'ITEM_NOT_FOUND'; end if;
  if exists (select 1 from base_clear where user_id = v and obstacle_id = p_id) then raise exception 'ALREADY_CLEARED'; end if;
  perform apply_coins(v, -o.price, 'PURCHASE', 'clear:' || p_id);
  insert into base_clear (user_id, obstacle_id) values (v, p_id);
  return o.price;
end $$;
revoke all on function clear_obstacle from public, anon;
grant execute on function clear_obstacle to authenticated;

-- save_base_layout: thêm kiểm tra không đè vật cản chưa dọn (twin: canPlace trong src/lib/game/layout.ts)
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
  if exists (select 1 from _it i join obstacles o on i.x < o.x + o.size and i.x + i.s > o.x and i.z < o.z + o.size and i.z + i.s > o.z
             where not exists (select 1 from base_clear c where c.user_id = v and c.obstacle_id = o.id)) then raise exception 'OVERLAP_OBSTACLE'; end if;
  if exists (select 1 from _it a join _it b on (a.kind, a.ref) < (b.kind, b.ref)
             where a.x < b.x + b.s and a.x + a.s > b.x and a.z < b.z + b.s and a.z + a.s > b.z) then raise exception 'OVERLAP'; end if;

  delete from base_layout where user_id = v;
  insert into base_layout (user_id, kind, ref, x, z, rot) select v, kind, ref, x, z, rot from _it;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------- kiểu nhà chính (chỉ ngoại hình) ----------
alter table user_house add column style text not null default 'classic';
create table user_styles (
  user_id uuid not null references profiles(id) on delete cascade,
  code text not null references shop_items(code),
  acquired_at timestamptz not null default now(),
  primary key (user_id, code)
);
alter table user_styles enable row level security;
create policy styles_read on user_styles for select to authenticated using (user_id = auth.uid() or user_id = partner_of(auth.uid()));

-- mua (rồi dùng luôn) 1 kiểu nhà
create function buy_style(p_code text) returns void language plpgsql security definer set search_path = public as $$
declare v uuid := auth.uid(); i shop_items%rowtype;
begin
  if v is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into i from shop_items where code = p_code and category::text = 'STYLE';
  if i.code is null then raise exception 'ITEM_NOT_FOUND'; end if;
  if not _unlocked(i.unlock_level) then raise exception 'ITEM_LOCKED'; end if;
  if p_code = 'style_classic' or exists (select 1 from user_styles where user_id = v and code = p_code) then raise exception 'ALREADY_OWNED'; end if;
  perform apply_coins(v, -i.price, 'PURCHASE', p_code);
  insert into user_styles (user_id, code) values (v, p_code);
  update user_house set style = substr(p_code, 7), updated_at = now() where user_id = v;
end $$;
create function set_style(p_code text) returns void language plpgsql security definer set search_path = public as $$
declare v uuid := auth.uid();
begin
  if v is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_code <> 'style_classic' and not exists (select 1 from user_styles where user_id = v and code = p_code) then raise exception 'ITEM_NOT_OWNED'; end if;
  update user_house set style = substr(p_code, 7), updated_at = now() where user_id = v;
end $$;
revoke all on function buy_style, set_style from public, anon;
grant execute on function buy_style, set_style to authenticated;

-- ---------- buff thú cưng: cộng theo chỉ số của mọi loài (không còn gắn với mã cat/corgi/dragon) ----------
create or replace function coin_bonus_pct(p_user uuid) returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((select sum(p.level * (s.stats->>'coin_pct_per_level')::numeric) from user_pets p join shop_items s on s.code = p.pet_code
          where p.user_id = p_user and s.stats ? 'coin_pct_per_level'
            and coalesce((select hp from user_house where user_id = p_user), 1) > 0), 0)
$$;
create or replace function calc_atk(p_user uuid) returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(a.quantity * (s.stats->>'atk')::numeric), 0)
    * (1 + cfg_num('ARMY_UPGRADE_ATK_PCT') * (select army_level from profiles where id = p_user))
    * (1 + coalesce((select sum((w.stats->>'atk_pct')::numeric) from user_weapons uw join shop_items w on w.code = uw.weapon_code where uw.user_id = p_user), 0))
    * (1 + coalesce((select sum(p.level * (d.stats->>'atk_pct_per_level')::numeric) from user_pets p join shop_items d on d.code = p.pet_code
                     where p.user_id = p_user and d.stats ? 'atk_pct_per_level' and coalesce((select hp from user_house where user_id = p_user), 1) > 0), 0))
  from user_army a join shop_items s on s.code = a.unit_code where a.user_id = p_user
$$;
create or replace function calc_def(p_user uuid) returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((select (stats->>'def')::numeric from shop_items where code = 'house_' || (select level from user_house where user_id = p_user)), 0)
    + coalesce((select sum(p.level * (c.stats->>'def_per_level')::numeric) from user_pets p join shop_items c on c.code = p.pet_code
                where p.user_id = p_user and c.stats ? 'def_per_level' and coalesce((select hp from user_house where user_id = p_user), 1) > 0), 0)
    + cfg_num('DEFENDER_ARMY_RATIO') * (
        select coalesce(sum(a.quantity * (s.stats->>'atk')::numeric), 0) * (1 + cfg_num('ARMY_UPGRADE_ATK_PCT') * (select army_level from profiles where id = p_user))
        from user_army a join shop_items s on s.code = a.unit_code where a.user_id = p_user)
$$;

-- ---------- bỏ vũ khí khỏi cửa hàng: không bán nữa; thắng màn nhận Nâng cấp thú cưng thay Quyền mua vũ khí ----------
create or replace function buy_weapon(p_code text) returns void language plpgsql security definer set search_path = public as $$
begin raise exception 'ITEM_RETIRED'; end $$;

CREATE OR REPLACE FUNCTION public.close_level(p_level uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  l levels%rowtype; ua uuid; ub uuid; aa level_attempts%rowtype; bb level_attempts%rowtype;
  v_win int; v_winner uuid; v_draw boolean := false; v_loser uuid; nxt levels%rowtype; p uuid; v_amt int;
begin
  select * into l from levels where id = p_level for update;
  if l.status = 'CLOSED' or l.rewarded_at is not null then return; end if;
  select user_id into ua from level_attempts where level_id = p_level and mode = 'RANKED' and status = 'SUBMITTED' order by submitted_at limit 1;
  if ua is null then return; end if;
  ub := partner_of(ua);
  select * into aa from level_attempts where level_id = p_level and user_id = ua and mode = 'RANKED';
  select * into bb from level_attempts where level_id = p_level and user_id = ub and mode = 'RANKED' and status = 'SUBMITTED';
  v_win := level_win_coins(l.order_no, l.reward_multiplier);

  if bb.id is null then v_winner := ua; v_loser := ub;                    -- người kia không chơi: thắng mặc định
  elsif aa.score > bb.score then v_winner := ua; v_loser := ub;
  elsif bb.score > aa.score then v_winner := ub; v_loser := ua;
  elsif aa.total_time_ms < bb.total_time_ms then v_winner := ua; v_loser := ub;
  elsif bb.total_time_ms < aa.total_time_ms then v_winner := ub; v_loser := ua;
  else v_draw := true; end if;

  if v_draw then
    foreach p in array array[ua, ub] loop
      v_amt := round(v_win * cfg_num('DRAW_RATIO') * (1 + coin_bonus_pct(p)))::int;
      perform apply_coins(p, v_amt, 'LEVEL_DRAW', l.order_no::text);
      perform grant_item(p, 'PET_UPGRADE', 1);
      perform notify(p, 'LEVEL_RESULT', 'Màn ' || l.order_no || ': HÒA 🤝', 'Mỗi người nhận ' || v_amt || ' xu + 1 Nâng cấp thú cưng', jsonb_build_object('level', l.order_no, 'result', 'DRAW'));
    end loop;
  else
    v_amt := round(v_win * (1 + coin_bonus_pct(v_winner)))::int;
    perform apply_coins(v_winner, v_amt, 'LEVEL_WIN', l.order_no::text);
    perform grant_item(v_winner, 'PET_UPGRADE', 1);
    perform grant_item(v_winner, 'PET_UPGRADE', 1);   -- Phase 10: thay Quyền mua vũ khí (đã bỏ vũ khí)
    perform grant_item(v_winner, 'ARMY_UPGRADE', 1);
    perform notify(v_winner, 'LEVEL_RESULT', 'Màn ' || l.order_no || ': BẠN THẮNG 🏆',
      '+' || v_amt || ' xu, 2 Nâng cấp thú cưng, 1 Nâng cấp quân đội', jsonb_build_object('level', l.order_no, 'result', 'WIN'));
    if exists (select 1 from level_attempts where level_id = p_level and user_id = v_loser and mode = 'RANKED' and status = 'SUBMITTED') then
      v_amt := round(v_win * cfg_num('LOSE_RATIO') * (1 + coin_bonus_pct(v_loser)))::int;
      perform apply_coins(v_loser, v_amt, 'LEVEL_LOSE', l.order_no::text);
      perform notify(v_loser, 'LEVEL_RESULT', 'Màn ' || l.order_no || ': thua rồi 😢', 'Nhận ' || v_amt || ' xu an ủi. Màn sau gỡ lại nhé!', jsonb_build_object('level', l.order_no, 'result', 'LOSE'));
    else
      perform notify(v_loser, 'LEVEL_RESULT', 'Màn ' || l.order_no || ': hết hạn ⌛', 'Bạn không chơi kịp nên người ấy thắng mặc định.', jsonb_build_object('level', l.order_no, 'result', 'LOSE'));
    end if;
  end if;

  update levels set status = 'CLOSED', closed_at = now(), winner_id = v_winner, is_draw = v_draw, rewarded_at = now() where id = p_level;
  update levels set status = 'OPEN', opened_at = now() where order_no = l.order_no + 1 and status = 'LOCKED' returning * into nxt;
  if nxt.id is not null then
    perform notify(ua, 'LEVEL_OPENED', 'Màn ' || nxt.order_no || ' đã mở 🎉', nxt.topic_vi, jsonb_build_object('level', nxt.order_no));
    perform notify(ub, 'LEVEL_OPENED', 'Màn ' || nxt.order_no || ' đã mở 🎉', nxt.topic_vi, jsonb_build_object('level', nxt.order_no));
  end if;
end $function$;

-- ---------- reset (dev + mùa giải) ----------
create or replace function dev_reset_game() returns void language plpgsql security definer set search_path = public as $$
declare t text;
begin
  foreach t in array array['attacks','shields','attempt_answers','level_attempts','user_weapons','user_pets','user_army',
    'typing_sessions','daily_counters','inventory','notifications','coin_transactions','word_progress','study_progress','admin_logs',
    'base_layout','user_decor','user_defenses','base_clear','user_styles','push_subscriptions']
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
  update user_house set style = 'classic' where true;
  perform _admin_reset_season_v2(p_confirm);
end $$;
revoke all on function admin_reset_season from public, anon;
grant execute on function admin_reset_season to authenticated;
