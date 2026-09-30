#!/usr/bin/env bash
# Phase 1 작업 시작 스크립트 (DevelopDoc/PHASE1_PLAN.md §5)
# 사용: bash scripts/phase1-start.sh 병준|예림|현준   (영문: byeongjun|yerim|hyunjoon)
# 하는 일: 원본 main 맞추기 → 내 브랜치 만들기(있으면 이어서) → 설치·키 점검·테스트 → Claude Code를 내 지시문으로 시작
set -euo pipefail

case "${1:-}" in
  병준 | byeongjun) who=byeongjun; branch=feat/WU-201-projects ;;
  예림 | yerim) who=yerim; branch=feat/WU-202-versions ;;
  현준 | hyunjoon) who=hyunjoon; branch=feat/WU-304-news ;;
  *)
    echo "사용법: bash scripts/phase1-start.sh 병준|예림|현준"
    exit 1
    ;;
esac

cd "$(git rev-parse --show-toplevel)"

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "커밋하지 않은 변경이 있습니다. 먼저 커밋하거나 git stash 한 뒤 다시 실행하세요."
  exit 1
fi

# 포크에서 일하면 원본 저장소를 upstream으로 둔다 (HANDOFF §0.2 합치는 방식)
ORIGINAL="wilstein91/project_sleepyheads"
remote=origin
if ! git remote get-url origin | grep -q "$ORIGINAL"; then
  if ! git remote | grep -qx upstream; then
    if git remote get-url origin | grep -q "^https://"; then
      git remote add upstream "https://github.com/$ORIGINAL.git"
    else
      git remote add upstream "git@github.com:$ORIGINAL.git"
    fi
    echo "원본 저장소를 upstream으로 등록했습니다."
  fi
  remote=upstream
fi

echo "== 원본 main 받기 ($remote)"
git fetch "$remote"
git switch main
git merge --ff-only "$remote/main"

if git show-ref --verify --quiet "refs/heads/$branch"; then
  echo "== 이미 있는 브랜치로 이어서: $branch"
  git switch "$branch"
else
  echo "== 새 브랜치: $branch"
  git switch -c "$branch"
fi

echo "== 설치·키 점검·테스트"
pnpm install
pnpm check:keys || echo "키 점검에 실패한 항목이 있습니다 — .env.local을 확인하세요 (HANDOFF §6.3)."
pnpm test

prompt="DevelopDoc/prompts/phase1-$who.md"
if command -v claude >/dev/null 2>&1; then
  echo "== Claude Code 시작 ($prompt)"
  claude "$(cat "$prompt")"
else
  echo "claude 명령을 찾지 못했습니다. Claude Code를 설치한 뒤, 이 폴더에서 아래를 실행하세요:"
  echo "  claude \"\$(cat $prompt)\""
fi
