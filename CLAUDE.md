# Love Quest – web game học tiếng Anh cho 2 người

Spec đầy đủ: `docs/spec.xlsx` (sheet 0–10). Luôn đọc sheet liên quan trước khi code; tham chiếu spec bằng ID (vd LVL-05, BTL-02).
Sửa luật/giá thì sửa spec + `game_config` trước, rồi đồng bộ code.

## Stack
Next.js 15 (App Router, TS, `src/`), Tailwind 4 + shadcn/ui, Framer Motion, Zustand, TanStack Query, Supabase (Postgres/Auth/Storage/Realtime), Vitest.
App nằm trong `app/`. Node 20 (`source ~/.nvm/nvm.sh && nvm use 20`).

## Lệnh (chạy trong app/)
- `npm run dev` · `npm run build` · `npm run lint` · `npm test`
- `npm run seed:export` : đọc docs/spec.xlsx → supabase/seed/*.json (game_config, levels, shop_items, words)

## Nguyên tắc bắt buộc
1. Mọi thay đổi xu / token / điểm / HP phải đi qua Postgres RPC (security definer) trong 1 transaction và ghi `coin_transactions`. Client KHÔNG tự cộng trừ.
2. Chấm điểm, thời gian câu hỏi, kết quả tấn công tính ở server. Đáp án đúng không gửi về client trước khi trả lời.
3. Mọi con số cân bằng đọc từ `game_config`, không hardcode.
4. Hàm logic thuần (điểm, calcBattle, normalizeVi, thắng/thua) đặt ở `src/lib/game/`, có unit test Vitest.
5. Mọi "ngày" tính theo Asia/Ho_Chi_Minh. RLS bật cho mọi bảng. UI tiếng Việt.
6. Secret chỉ ở `.env.local` (không commit). `SUPABASE_SERVICE_ROLE_KEY` chỉ dùng server-side.
