-- Phase 8: admin log, cấu hình, reset mùa giải, web push

create function admin_log(p_action text, p_entity text, p_entity_id text, p_diff jsonb default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  insert into admin_logs (admin_id, action, entity, entity_id, diff) values (auth.uid(), p_action, p_entity, p_entity_id, p_diff);
end $$;

-- ADM-03: sửa 1 key cấu hình (giữ nguyên kiểu dữ liệu), ghi log. Chỉ áp dụng cho hành động MỚI.
create function admin_set_config(p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare old jsonb;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  select value into old from game_config where key = p_key;
  if old is null then raise exception 'KEY_NOT_FOUND'; end if;
  if jsonb_typeof(old) <> jsonb_typeof(p_value) then raise exception 'TYPE_MISMATCH'; end if;
  update game_config set value = p_value, updated_at = now() where key = p_key;
  insert into admin_logs (admin_id, action, entity, entity_id, diff)
  values (auth.uid(), 'CONFIG_SET', 'game_config', p_key, jsonb_build_object('old', old, 'new', p_value));
end $$;

-- ADM-04: reset mùa giải. Xóa tiến trình game, GIỮ tài khoản, hồ sơ, từ vựng, cấu hình, sổ từ, bonus học trước.
create function admin_reset_season(p_confirm text) returns void
language plpgsql security definer set search_path = public as $$
declare r record; v_start int := coalesce(cfg_num('STARTING_COINS'), 500)::int;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_confirm <> 'RESET' then raise exception 'CONFIRM_REQUIRED'; end if;
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

-- NOT-02: web push
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table push_subscriptions enable row level security;
create policy push_own on push_subscriptions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Khi có thông báo mới → gọi webhook của app (/api/push/send) qua pg_net nếu đã cấu hình PUSH_WEBHOOK_URL / PUSH_WEBHOOK_SECRET trong game_config. Không cấu hình = bỏ qua.
create function notify_push() returns trigger language plpgsql security definer set search_path = public as $$
declare v_url text; v_secret text;
begin
  select value #>> '{}' into v_url from game_config where key = 'PUSH_WEBHOOK_URL';
  select value #>> '{}' into v_secret from game_config where key = 'PUSH_WEBHOOK_SECRET';
  if coalesce(v_url, '') = '' then return new; end if;
  begin
    perform net.http_post(url := v_url, headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', coalesce(v_secret, '')),
      body := jsonb_build_object('user_id', new.user_id, 'title', new.title, 'body', new.body, 'type', new.type, 'data', new.data));
  exception when others then null;   -- không để lỗi push làm hỏng giao dịch game
  end;
  return new;
end $$;
create trigger notifications_push after insert on notifications for each row execute function notify_push();

revoke all on function admin_log, admin_set_config, admin_reset_season from public, anon;
grant execute on function admin_log, admin_set_config, admin_reset_season to authenticated;
