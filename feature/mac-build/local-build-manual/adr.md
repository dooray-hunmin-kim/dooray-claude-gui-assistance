---
id: ADR-mac-build-local-build-01
title: macOS 빌드 — GitHub Actions 제거, 로컬 Mac 빌드 + 수동 업로드
status: accepted
date: 2026-05-22
supersedes: [ADR-mac-build-zip-fallback-01]
domain: build-release
---

# macOS 빌드 — GitHub Actions 제거, 로컬 Mac 빌드 + 수동 업로드

## 컨텍스트

GitHub-hosted macOS runner 에서 dmg 빌드가 codesign 자동 탐색 시 keychain 권한 충돌로 실패 — Apple Developer 인증서 부재 상태에서 자동화 자체가 동작 안 함.

사용자가 보유한 옵션 4가지 검토:

1. **zip 단독** (ADR-zip-fallback-01) — GitHub Actions 에서 zip 만 빌드. codesign 단계 우회.
2. **dmg + zip 둘 다** — 둘 다 빌드 시도. dmg 실패가 zip 도 못 만들게 함 (electron-builder 직렬 빌드).
3. **Apple Developer Program 가입 + 정식 서명** — $99/년. 정식 dmg + Notarization.
4. **GitHub Actions macOS 잡 제거 + 로컬 Mac 수동 빌드 + 수동 업로드** ← 본 ADR 결정

## 결정

**옵션 4** — GitHub Actions 의 `build-macos` 잡 제거. 매 릴리즈마다 사용자가 로컬 Mac 에서 `npm run dist` → 생성된 dmg 를 `gh release upload` 로 첨부.

`package.json` 의 `build.mac` 은 원본 그대로 (`target: ["dmg"]`, `identity: "-"`) — 로컬 Mac 의 keychain 에서 ad-hoc 서명이 정상 동작.

## 대안과 기각 이유

1. **옵션 1 (zip 단독)** — *기각 (= supersede)*: dmg 의 드래그 → Applications UX 손실. 그런데 무서명 dmg/zip 둘 다 사용자 첫 실행 시 "확인되지 않은 개발자" 경고 + 우 클릭 → 열기 절차 동일. 즉 zip 의 *기능적 이점 0*, UX 손해만 있음.
2. **옵션 2 (dmg+zip 둘 다)** — *기각*: dmg 빌드 실패가 workflow 전체를 실패시킴. zip 도 안 받아짐.
3. **옵션 3 (Apple Developer 가입)** — *연기, 별도 사이클*: $99/년 + 가입 심사 1-3일. ROI 평가 필요. 사용자 다운로드 추세 + 사내 Apple Developer 조직 멤버 가능성 확인 후 결정. 본 ADR 의 결정은 *지금* 빌드 정상화가 목적.

## 결과 (Consequences)

### 긍정
- GitHub Actions release.yml 의 macOS 잡 실패 영구 해결 (잡 자체가 없으니 실패 안 함)
- macOS runner 비용 0 (Linux/Windows 의 10x 절감)
- 로컬 keychain 으로 ad-hoc 서명 정상 — 무서명 zip 대비 dmg 드래그 UX 유지
- 정식 인증서 도입 시 GitHub Actions 잡 복원만 하면 됨 (본 ADR supersede)

### 부정 / 트레이드오프
- **매 릴리즈마다 수동 5분 작업** — 사용자 (임태원) 가 본인 Mac 에서 `npm run dist` + `gh release upload`
- macOS 사용자 첫 실행 시 우 클릭 → 열기 절차 (무서명) — README "macOS 실행 차단 해제" 섹션 유지
- Apple Silicon (arm64) 과 Intel (x64) 모두 지원하려면 사용자가 둘 다 빌드 or universal binary 옵션 설정 필요 (`build.mac.target` 의 `arch` 옵션)

### 모니터링
- 릴리즈 빈도 / 사용자 수동 작업 부담
- 정식 서명 도입 트리거: (a) 릴리즈 빈도가 주 1회 이상 ↑, (b) Apple Developer 조직 멤버 확보, (c) macOS 다운로드 비중 ↑

## 절차 (README 참조)

```bash
# 1. 태그 체크아웃
git fetch --tags
git checkout v<버전>

# 2. 빌드
npm install
npm run dist

# 3. 업로드
gh release upload v<버전> release/*.dmg
```

## 후속 사이클 시드

- `feature/mac-build/code-signing/adr.md` (PLANNED) — Apple Developer Program 가입 ADR. 본 ADR supersede 후보.
- 사내 NHN Apple Developer 조직 멤버 가능 여부 확인 (비용 0 옵션)

## 참조

- `ADR-mac-build-zip-fallback-01` (superseded by 본 ADR)
- README "릴리즈" 섹션
- `.github/workflows/release.yml` 의 macOS 잡 제거 위치 주석
- 관련 PR (본 ADR 도입): TBD
