-- Điểm các màn ĐÃ ĐÓNG của cả 2 người (lịch sử đối đầu, LVL-12) + điểm của mình ở màn chưa đóng
create function rivalry_scores() returns table (level_id uuid, user_id uuid, score int)
language sql stable security definer set search_path = public as $$
  select a.level_id, a.user_id, a.score from level_attempts a
  where a.mode = 'RANKED' and a.status = 'SUBMITTED'
    and (a.user_id = auth.uid() or exists (select 1 from levels l where l.id = a.level_id and l.status = 'CLOSED'))
    and (a.user_id = auth.uid() or a.user_id = partner_of(auth.uid()))
$$;
revoke all on function rivalry_scores from public, anon;
grant execute on function rivalry_scores to authenticated;
