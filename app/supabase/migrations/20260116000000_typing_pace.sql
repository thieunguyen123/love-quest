-- Mưa chữ (sheet 2 mục E "Độ khó tăng dần"): mới vào chậm, cứ 10 từ bắn trúng thì nhanh dần.
-- Ghi đè giá trị cũ (10s · 3 từ · −8%) bằng nhịp mới; Admin vẫn chỉnh được ở /admin/config.
update game_config set value = '16'   where key = 'TYPING_FALL_START_SEC';
update game_config set value = '5'    where key = 'TYPING_FALL_MIN_SEC';
update game_config set value = '0.12' where key = 'TYPING_SPEEDUP_PCT';
update game_config set value = '1'    where key = 'TYPING_MAX_ON_SCREEN_START';
update game_config set value = '4'    where key = 'TYPING_MAX_ON_SCREEN_END';
insert into game_config (key, value, unit, description) values
  ('TYPING_SPAWN_GAP_START_SEC', '3.5', 'giây', 'Khoảng cách ra từ mới lúc bắt đầu (mỗi lần tăng tốc ngắn lại TYPING_SPEEDUP_PCT×1.25)'),
  ('TYPING_SPAWN_GAP_MIN_SEC', '1.2', 'giây', 'Khoảng cách ra từ mới ngắn nhất')
on conflict (key) do nothing;
