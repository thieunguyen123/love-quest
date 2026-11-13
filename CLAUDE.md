# Love Quest – web game học tiếng Anh cho 2 người

Spec đầy đủ: `docs/spec.xlsx` (sheet 0–10). Luôn đọc sheet liên quan trước khi code; tham chiếu spec bằng ID (vd LVL-05, BTL-02).
Sửa luật/giá thì sửa spec + `game_config` trước, rồi đồng bộ code.

## Stack
Next.js 15 (App Router, TS, `src/`), Tailwind 4 + shadcn/ui, Framer Motion, Zustand, TanStack Query, Supabase (Postgres/Auth/Storage/Realtime), Vitest.
App nằm trong `app/`. Node 22 (`source ~/.nvm/nvm.sh && nvm use 22`).

## Lệnh (chạy trong app/)
- `npm run dev` (cổng **3100**, vì 3000 đang bị container khác dùng) · `npm run build` · `npm run lint` · `npm test` (48 unit test)
- **Hai Supabase local** (cần Docker Desktop): *dev* (cổng 543xx, dữ liệu người chơi thật) và *test* (cổng 553xx, thư mục `.sbtest/`, dùng cho test tự động — test **xóa sạch dữ liệu game**, đừng chạy vào DB dev).
  - dev: `npx supabase start -x imgproxy,edge-runtime,logflare,vector,supavisor,mailpit` · `npx supabase stop` · Studio http://127.0.0.1:54323
  - test: `npm run db:test:start` · `npm run db:test:stop` · `npm run db:test:reset`
- `npm run db:reset` : reset DB **dev** + migration + seed (xóa sạch!) · `npm run seed:db` : nạp config/màn/từ vựng/shop + 2 tài khoản dev
- Test tích hợp (chạy trên DB test): `npm run test:all` (phase 1,3,4,5,6,8) · lẻ từng phase `IT_ENV=.env.test npx tsx scripts/it-phaseN.ts`
- Smoke test HTTP có đăng nhập: bật server vào DB test `NEXT_DIST_DIR=.next-test env $(grep -v '^#' .env.test | xargs) npx next dev --turbopack -p 3101` rồi `npm run test:smoke`. Truy cập trình duyệt bằng `http://127.0.0.1:3101` (khác host với `localhost:3100` để không đè cookie đăng nhập).
- Build kiểm tra mà không đè `.next` của server dev: `NEXT_DIST_DIR=.next-build npm run build`
- E2E thế giới 3D (Chrome headless thật + Playwright, lái xe/va chạm/dốc/overlay/realtime/joystick): bật server test :3101 rồi `npm run test:e2e` (ảnh chụp ở `.e2e-shots/`). WSL này thiếu thư viện hệ thống cho Chrome: `npx playwright install-deps` (cần sudo), hoặc `apt-get download` các gói (libnss3, libgbm1, libasound2, libgtk-3-0, libfontconfig1…) rồi `dpkg -x` vào 1 thư mục và đặt `LD_LIBRARY_PATH`. Không có font emoji nên emoji hiện ô vuông trong ảnh chụp — không phải lỗi.
- `npm run seed:export` : đọc docs/spec.xlsx → supabase/seed/*.json

## Nguyên tắc bắt buộc
1. Mọi thay đổi xu / token / điểm / HP phải đi qua Postgres RPC (security definer) trong 1 transaction và ghi `coin_transactions`. Client KHÔNG tự cộng trừ.
2. Chấm điểm, thời gian câu hỏi, kết quả tấn công tính ở server. Đáp án đúng không gửi về client trước khi trả lời.
3. Mọi con số cân bằng đọc từ `game_config`, không hardcode.
4. Hàm logic thuần (điểm, calcBattle, normalizeVi, thắng/thua) đặt ở `src/lib/game/`, có unit test Vitest.
5. Mọi "ngày" tính theo Asia/Ho_Chi_Minh. RLS bật cho mọi bảng. UI tiếng Việt.
6. Secret chỉ ở `.env.local` (không commit). `SUPABASE_SERVICE_ROLE_KEY` chỉ dùng server-side.

## Tài khoản dev (chỉ local, KHÔNG dùng cho production)
- Út đặc (ADMIN): utdac@lovequest.local / utdac-dev-2026
- Mỡ heo (PLAYER): moheo@lovequest.local / moheo-dev-2026
Production: tạo user bằng Supabase dashboard (Auto Confirm), tắt "Allow new users to sign up", đổi `.env.local` sang URL/key của project cloud, chạy `supabase db push` rồi `npm run seed:db` (bỏ phần tạo user dev).

## Tiến độ (tất cả đã làm, có test)
- [x] P0 scaffold · P1 auth/profile/onboarding/hub · P2 học (flashcard), admin màn/từ, import CSV
- [x] P3 Mưa chữ (`lib/game/typing.ts`) · P4 màn thi đấu (engine 6 loại câu ở SQL `_build_question`, đếm ngược 48h, thưởng idempotent, thông báo realtime, đối đầu)
- [x] P5 shop/căn cứ/quân/vũ khí · P6 tấn công + khiên (`calc_atk/calc_def/calc_battle` ở SQL, twin TS ở `lib/game/battle.ts`)
- [x] P7 thế giới 3D `/world` (three + r3f + **@react-three/rapier**): xe kiểu arcade (`physics.ts: drive()` có unit test, va chạm/trọng lực do rapier), dốc nhảy, bowling, thùng, cọc; camera trên cao/sau xe (C), R về chỗ cũ, Shift tăng tốc, Space phanh, joystick ảo + nút 🚀 trên điện thoại, bản đồ nhỏ, xe người ấy realtime (kinematic, tông nhau được). Nhấn E mở trang 2D trong **overlay iframe** trên nền 3D; trang trong iframe chạy "chế độ nhúng" (script trong `(app)/layout.tsx` ẩn menu, link về `/` hoặc `/world` và Esc → đóng overlay). Hub `/` mặc định chuyển vào 3D trừ khi đã chọn 2D. `?at=home|partner|<zone>|ramp` chọn điểm xuất phát. · P8 sổ từ, cài đặt âm thanh, PWA, admin cấu hình/nhật ký/reset mùa

## Điểm cần biết / chưa hoàn hảo
- **LISTEN** (câu nghe): từ tiếng Anh phải gửi về client để đọc TTS nên đáp án lộ trong network (các loại khác không lộ). Chấp nhận được cho game 2 người.
- **Từ vựng**: chỉ có đủ từ cho màn 1–6 (`supabase/seed/words_extra.csv` + sheet 8). Màn 7–20 để Admin nhập/import CSV; màn chưa đủ ≥4 từ sẽ báo "chưa có đủ từ". IPA/nghĩa do AI soạn — cần người đọc lại.
- **Cron**: `pg_cron` được thử bật trong migration; nếu không có thì `cron_tick()` được gọi mỗi lần mở Hub/Màn chơi/3D (idempotent). Production nên bật pg_cron (mỗi 5 phút).
- **Web push** (NOT-02): đã có SW, bảng `push_subscriptions`, `/api/push/subscribe`, `/api/push/send`, trigger `notify_push` (pg_net). Để chạy thật: tạo VAPID (`npx web-push generate-vapid-keys`), đặt `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `PUSH_WEBHOOK_SECRET` trong env của app; thêm vào bảng `game_config` 2 key `PUSH_WEBHOOK_URL` (https://<domain>/api/push/send) và `PUSH_WEBHOOK_SECRET`. Chưa thử gửi push thật tới thiết bị. Khi app đang mở, thông báo hệ điều hành vẫn hiện qua Realtime.
- **Bảng giá shop** nằm ở `supabase/seed/shop_items.json` (viết tay theo sheet 5). Đổi giá: sửa file/bảng `shop_items` và `docs/spec.xlsx`.
- Giá trị trong `game_config` sửa được ở `/admin/config`; không tính lại kết quả cũ.
