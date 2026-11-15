// Nhóm key cấu hình cho dễ tìm (giống các nhóm ở sheet 3 CẤU HÌNH). Key mới chưa có nhóm → "Khác".
export const CONFIG_GROUPS: { id: string; icon: string; title: string; keys: RegExp }[] = [
  { id: "general", icon: "🌐", title: "Chung", keys: /^(TIMEZONE|STARTING_COINS)$/ },
  { id: "level", icon: "🏆", title: "Màn chơi & điểm", keys: /^(LEVEL_|WIN_|LOSE_|DRAW_|ANSWER_|NETWORK_|POINTS_|SPEED_BONUS|COMBO_|FIRST_STUDY)/ },
  { id: "typing", icon: "🌧️", title: "Mưa chữ", keys: /^TYPING_/ },
  { id: "daily", icon: "🎁", title: "Thưởng hằng ngày & nhiệm vụ", keys: /^(LOGIN_|QUEST_|COUPLE_)/ },
  { id: "grammar", icon: "📘", title: "Ngữ pháp", keys: /^GRAMMAR_/ },
  { id: "attack", icon: "⚔️", title: "Tấn công & sửa nhà", keys: /^(ATTACKS_PER_DAY|DEFENDER_ARMY|MIN_DAMAGE|DAMAGE_RANDOM|LOOT_|POST_ATTACK|REPAIR_|UNIT_LOSS|ATTACK_PENDING)/ },
  { id: "battle", icon: "🎯", title: "Trận đánh 3D (mô phỏng)", keys: /^(BATTLE_|HOUSE_DAMAGE|HOUSE_ARMOR|GUARD_|DEPLOY_|SPLASH_|DEFENSE_HOUSE)/ },
  { id: "shield", icon: "🛡️", title: "Khiên", keys: /^(SHIELD_|FREE_SHIELDS)/ },
  { id: "army", icon: "🪖", title: "Quân đội & thú cưng", keys: /^(ARMY_|PET_)/ },
  { id: "base", icon: "🏠", title: "Căn cứ", keys: /^(BASE_|OBSTACLE_)/ },
];
export const groupOf = (key: string) => CONFIG_GROUPS.find((g) => g.keys.test(key))?.id ?? "other";
