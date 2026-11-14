-- AUTH-01/AUTH-05 (Phase 12): người chơi TỰ ĐĂNG KÝ. Game cho đúng 2 người:
--   người đăng ký đầu tiên = ADMIN, người thứ hai = PLAYER và tự ghép đôi; người thứ ba bị từ chối (GAME_FULL).
-- Vai trò KHÔNG lấy từ user_metadata (người dùng tự gửi được khi signUp → tránh tự xưng ADMIN).
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int; first_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('love-quest:new-user'));   -- 2 người đăng ký cùng lúc vẫn đúng thứ tự
  select count(*) into n from profiles where deleted_at is null;
  if n >= 2 then raise exception 'GAME_FULL' using hint = 'Love Quest chỉ dành cho 2 người'; end if;
  insert into profiles (id, role, display_name)
  values (new.id, case when n = 0 then 'ADMIN'::user_role else 'PLAYER'::user_role end, '');
  if n = 1 and not exists (select 1 from couples) then
    select id into first_id from profiles where deleted_at is null and id <> new.id order by created_at limit 1;
    insert into couples (player_a, player_b) values (first_id, new.id);
  end if;
  return new;
end $$;
