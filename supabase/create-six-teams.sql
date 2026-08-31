-- settingsのPIN、有効期間、各チームの登録上限を変更してから実行してください。
-- 実行結果のteam_tokenは再表示できないため、必ず安全な場所へ保存します。

with settings as (
  select
    '583204'::text as common_pin,
    now() + interval '30 days' as expires_at,
    10::integer as max_registrations
),
teams(team_name) as (
  values
    ('チームA'),
    ('チームB'),
    ('チームC'),
    ('チームD'),
    ('チームE'),
    ('チームF')
)
select
  teams.team_name,
  public.create_team_access(
    teams.team_name,
    settings.common_pin,
    settings.expires_at,
    settings.max_registrations
  ) as team_token
from teams
cross join settings;
