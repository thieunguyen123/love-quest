# Love Quest – web game học tiếng Anh cho 2 người

Spec đầy đủ: `docs/spec.xlsx` (sheet 0–10). Luôn đọc sheet liên quan trước khi code; tham chiếu spec bằng ID (vd LVL-05, BTL-02).
Sửa luật/giá thì sửa spec + `game_config` trước, rồi đồng bộ code.

## Stack
Next.js 15 (App Router, TS, `src/`), Tailwind 4 + shadcn/ui, Framer Motion, Zustand, TanStack Query, Supabase (Postgres/Auth/Storage/Realtime), Vitest.
App nằm trong `app/`. Node 22 (`source ~/.nvm/nvm.sh && nvm use 22`).

## Lệnh (chạy trong app/)
- `npm run dev` (cổng **3100**, vì 3000 đang bị container khác dùng) · `npm run build` · `npm run lint` · `npm test` (unit)
- Supabase local (cần Docker Desktop chạy): `npx supabase start -x imgproxy,edge-runtime,logflare,vector,supavisor,mailpit` · `npx supabase stop` · Studio http://127.0.0.1:54323
- `npm run db:reset` : reset DB local + chạy migration + seed (xóa sạch dữ liệu!)
- `npm run seed:db` : nạp config/màn/từ vựng + tạo 2 tài khoản dev + cặp đôi
- `npm run test:it` (test DB/RLS/RPC, cần seed, sẽ đổi dữ liệu của Mỡ heo) · `npm run test:http` (smoke test trang có đăng nhập, cần `npm run build && npm start`)
- `npm run seed:export` : đọc docs/spec.xlsx → supabase/seed/*.json (game_config, levels, shop_items, words)

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

## Tiến độ
- [x] Phase 0 scaffold · [x] Phase 1 (auth, profile, onboarding, hub 2D) · [x] Phase 2 (thư viện, flashcard, admin màn/từ, import CSV)
- [ ] Phase 3 mưa chữ · [ ] 4 màn thi đấu · [ ] 5 shop/căn cứ · [ ] 6 tấn công/khiên · [ ] 7 3D · [ ] 8 đánh bóng
