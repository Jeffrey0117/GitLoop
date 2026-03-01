<p align="center">
  <img src="gitloop-logo.png" alt="GitLoop" width="160" />
</p>

<h1 align="center">GitLoop</h1>

<p align="center">
  <strong>你自己的 GitHub。但它會思考。</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT" />
  <img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen" alt="Node 20+" />
  <img src="https://img.shields.io/badge/engine-Gitea-orange" alt="Gitea" />
</p>

<p align="center">
  <a href="README.md">English</a> | <strong>繁體中文</strong>
</p>

---

## 想像一下

你 push 了程式碼。還沒切換分頁：

> **AI Review：** 沒有嚴重問題。2 個中等建議。自動通過。
> **部署已觸發。** `myapp.yourdomain.com` 更新中...

隊友推了一個 commit，裡面有暴露的 API key。你的手機震動：

> 🔴 **嚴重：** `config.ts:42` 有寫死的密鑰。已攔截。

你在 Telegram 回覆：「回滾那個 commit。」搞定。

這就是 GitLoop。一個自架的 Git 平台，會**讀懂你的程式碼、審查它、然後告訴你發生了什麼** — 不用你開口問。

---

## 為什麼不用 GitHub 就好？

| | GitHub | GitLab 自架 | **GitLoop** |
|---|---|---|---|
| 費用 | 團隊 $4+/月 | 免費但笨重 | **免費、輕量** |
| AI code review | Copilot ($19/月) | 沒有內建 | **每次 push，免費** |
| Telegram 通知 | 只有 email | 只有 email | **即時、可互動** |
| 自動部署整合 | GitHub Actions | CI/CD 設定 | **一個 webhook，零 YAML** |
| 語音操作 | 不行 | 不行 | **透過 ClaudeBot 說「合併 PR 23」** |
| 完全自主 | 不是 | 是 | **是** |
| 設定時間 | 不適用 | 數小時 | **5 分鐘** |

---

## 生態系統：完整閉環

GitLoop 是最後一塊拼圖。閉環完成了：

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│   ClaudeBot       你說話。AI 寫程式碼。                   │
│   ↓               在手機上，透過 Telegram。               │
│                                                         │
│   GitLoop         程式碼到這裡。                          │
│   ↓               AI 審查。通知你。                       │
│                   GitHub 當備份。                         │
│                                                         │
│   CloudPipe       自動部署。                              │
│   ↓               健康檢查。必要時回滾。                   │
│                                                         │
│   上線了。         你的 app 已在線。                       │
│                   整個循環：不到 2 分鐘。                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

| 工具 | 做什麼 | Repo |
|------|--------|------|
| [**ClaudeBot**](https://github.com/Jeffrey0117/ClaudeBot) | 在手機上用 AI 寫程式 | Telegram 指揮台 |
| **GitLoop** | AI 原生 Git 平台，智能審查 | *你在這裡* |
| [**CloudPipe**](https://github.com/Jeffrey0117/CloudPipe) | 自架 Vercel。Git push 自動部署 | 從聊天管理 |
| [**DevUp**](https://github.com/Jeffrey0117/DevUp) | 新電腦？一個指令重建一切 | 環境啟動器 |
| [**ZeroSetup**](https://github.com/Jeffrey0117/ZeroSetup) | 任何專案，雙擊就跑 | 零設定步驟 |

**語音 → 程式碼 → 審查 → 部署 → 上線。不用打開筆電。**

---

## GitLoop 的特色

### AI 審查每一次 Push

不是 linter。不是規則檢查器。是一個**理解你程式碼**的 AI：

```
📦 Push to myapp/main (3 commits)
by Jeffrey — fix: auth token validation

🤖 AI Review:
  ✅ 沒有嚴重問題
  🟡 中等: src/auth.ts — refresh 時沒檢查 token 過期
  💡 建議: 考慮在 /api/login 加上速率限制

  已通過（附建議）。
```

它能抓到 linter 抓不到的問題：
- **安全性**：暴露的密鑰、注入漏洞、缺少驗證
- **破壞性變更**：API 簽名變更、移除的欄位
- **邏輯 bug**：off-by-one、null 檢查、競態條件
- **效能**：N+1 查詢、缺少索引、記憶體洩漏

### Telegram 原生

GitHub 寄 email 給你。你忽略它。
GitLoop 發 Telegram 訊息。你真的會看。

### GitHub 當備份

你不用放棄 GitHub。你只是**降級**它：

- GitLoop 是主要倉庫
- 每次 push 自動鏡像到 GitHub
- GitHub 掛了？你不在乎
- GitLoop 掛了？GitHub 有全部

### 零 YAML 部署

GitHub Actions 需要 50 行 YAML。GitLoop → CloudPipe：**一個 webhook**。Push 觸發部署。不用設定檔。

---

## 快速開始

### Docker（推薦）

```bash
git clone https://github.com/Jeffrey0117/GitLoop.git
cd GitLoop
cp .env.example .env        # 填入你的 token
cd docker && docker-compose up -d
```

### 手動安裝

```bash
git clone https://github.com/Jeffrey0117/GitLoop.git
cd GitLoop && npm install
npm run setup
npm run dev
```

---

## 授權

MIT
