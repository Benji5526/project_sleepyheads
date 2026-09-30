# Phase 3 작업 시작 스크립트 (DevelopDoc/PHASE3_PLAN.md §5) — PowerShell용
# 사용: powershell -ExecutionPolicy Bypass -File scripts/phase3-start.ps1 병준|예림|현준   (영문: byeongjun|yerim|hyunjoon)
# 하는 일: 원본 main 맞추기 → 내 브랜치 만들기(있으면 이어서) → 설치·키 점검·테스트 → Claude Code를 내 지시문으로 시작
param([Parameter(Mandatory = $true)][string]$Name)
$ErrorActionPreference = "Stop"

switch ($Name) {
  { $_ -in "병준", "byeongjun" } { $who = "byeongjun"; $branch = "feat/WU-403-perf" }
  { $_ -in "예림", "yerim" } { $who = "yerim"; $branch = "feat/WU-401-board-server" }
  { $_ -in "현준", "hyunjoon" } { $who = "hyunjoon"; $branch = "feat/WU-401-board-ui" }
  default { Write-Host "사용법: scripts/phase3-start.ps1 병준|예림|현준"; exit 1 }
}

Set-Location (git rev-parse --show-toplevel)

if (git status --porcelain --untracked-files=no) {
  Write-Host "커밋하지 않은 변경이 있습니다. 먼저 커밋하거나 git stash 한 뒤 다시 실행하세요."
  exit 1
}

# 포크에서 일하면 원본 저장소를 upstream으로 둔다 (HANDOFF §0.2 합치는 방식)
$original = "wilstein91/project_sleepyheads"
$remote = "origin"
$originUrl = git remote get-url origin
if ($originUrl -notmatch [regex]::Escape($original)) {
  if (-not ((git remote) -contains "upstream")) {
    if ($originUrl -match "^https://") { git remote add upstream "https://github.com/$original.git" }
    else { git remote add upstream "git@github.com:$original.git" }
    Write-Host "원본 저장소를 upstream으로 등록했습니다."
  }
  $remote = "upstream"
}

Write-Host "== 원본 main 받기 ($remote)"
git fetch $remote
git switch main
git merge --ff-only "$remote/main"
if ($LASTEXITCODE -ne 0) { exit 1 }

git show-ref --verify --quiet "refs/heads/$branch"
if ($LASTEXITCODE -eq 0) { Write-Host "== 이미 있는 브랜치로 이어서: $branch"; git switch $branch }
else { Write-Host "== 새 브랜치: $branch"; git switch -c $branch }

Write-Host "== 설치·키 점검·테스트"
pnpm install
pnpm check:keys
if ($LASTEXITCODE -ne 0) { Write-Host "키 점검에 실패한 항목이 있습니다 — .env.local을 확인하세요 (HANDOFF §6.3)." }
pnpm test
if ($LASTEXITCODE -ne 0) { Write-Host "테스트가 실패했습니다. 시작하기 전에 확인하세요."; exit 1 }

$prompt = "DevelopDoc/prompts/phase3-$who.md"
if (Get-Command claude -ErrorAction SilentlyContinue) {
  Write-Host "== Claude Code 시작 ($prompt)"
  claude (Get-Content $prompt -Raw -Encoding UTF8)
} else {
  Write-Host "claude 명령을 찾지 못했습니다. Claude Code를 설치한 뒤, 이 폴더에서 아래를 실행하세요:"
  Write-Host "  claude (Get-Content $prompt -Raw -Encoding UTF8)"
}
