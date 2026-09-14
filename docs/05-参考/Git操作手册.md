# Git 操作手册

- 版本：v1.0
- 日期：2026-06-10
- 适用：本项目 `smart-mission-system` 及日常 Git 工作流（GitHub 远程、GCM 凭据、代理 127.0.0.1:7897）

---

## 1. 基础概念（一分钟版）

| 名词 | 含义 |
|---|---|
| 工作区 | 你正在编辑的文件（磁盘上的真实文件） |
| 暂存区（staging） | `git add` 之后、等待提交的变更 |
| 本地仓库 | 提交历史（`.git` 目录） |
| 远程仓库 | GitHub 上的仓库（如 `monk2846733026/smart-mission-system`） |
| commit | 一次快照，用哈希（如 `fdc58b7`）标识 |
| 分支 branch | 提交历史上的一个指针（本项目用 `main`） |

---

## 2. 日常推送（push）

```
git status                 # ① 看改了什么
git add -A                 # ② 全部变更加入暂存区
git commit -m "说明"       # ③ 生成一次提交（快照）
git push                   # ④ 推送到远程（分支已跟踪时）
```

- **首次推送**用：`git push -u origin main`（`-u` 建立跟踪关系，之后才能直接 `git push`）
- **好习惯**：push 前先 `git pull`，避免远程已有他人提交导致被拒

---

## 3. 拉取更新（pull）

`git pull` 实际是两步合一：**fetch（下载远程提交）+ merge（合并到本地）**。

```
git pull                 # 或 git pull origin main
```

- 只想下载不合并：`git fetch`
- **冲突处理**：合并时文件出现冲突标记：
  ```
  <<<<<<< HEAD
  你的改动
  =======
  别人的改动
  >>>>>>> origin/main
  ```
  手动改好 → `git add <文件>` → `git commit`（不需要 `-m`，会用默认合并信息）
- 更谨慎的做法：`git pull --rebase`（把你的提交重放到远程最新之上，历史更线性；团队有约定时使用）

---

## 4. 子项目 / 子模块（submodule）——回答"为什么 push 了子仓库，主仓库却没有 commit"

### 4.1 原理：主仓库对子仓库只存一个"指针"

子模块模式下，主仓库**不包含**子仓库的代码，只记录一个**指针（gitlink）**——即"子仓库当前是哪个 commit 的哈希"。

```
smart-mission-system/            ← 主仓库（GitHub 上的真实仓库）
├─ .gitmodules                   ← 声明有哪些子模块、各自的远程地址
├─ 2d-map/                       ← 只存"指针"，指向 2d-map 仓库的某个 commit
└─ ...其他文件

2d-map（另一个独立仓库，有自己的提交历史、自己的远程）
```

### 4.2 为什么 push 子仓库后，主仓库没有变化？

因为主仓库**根本不知道**子仓库有了新提交——它的指针还停在旧 commit 上。必须走**两步**：

1. 子仓库自己 push（推到子仓库的远程）
2. 回主仓库**更新指针**（`git add 2d-map`），再 commit + push

只做第 1 步，主仓库当然没有任何 commit——这正是你看到的现象。

### 4.3 以 2d-map 为例的完整流程

```
# ① 在子仓库内开发并推送
cd 2d-map
git add -A
git commit -m "新增缩放功能"
git push                          # 推到 2d-map 自己的远程仓库

# ② 回到主仓库，更新对子仓库的引用
cd ..
git status                        # 会看到 2d-map 显示 modified（指针变了）
git add 2d-map                    # 关键：这里记录的是"指针变化"，不是代码
git commit -m "chore: 更新 2d-map 子模块到新版本"
git push                          # 主仓库此时才包含新指针
```

### 4.4 拉取方（其他人/另一台机器）怎么拿子仓库代码

```
git pull                                   # 拿到主仓库的新指针
git submodule update --init --recursive    # 按新指针检出子仓库代码
```

- 如果只 `git pull` 而不执行 submodule update：`2d-map/` 目录内容不变（或停在旧版），`git status` 里 2d-map 显示 modified
- 首次克隆含子模块的仓库：`git clone --recurse-submodules <url>`

### 4.5 常见坑

| 坑 | 现象 | 解法 |
|---|---|---|
| 游离头指针（detached HEAD） | 子模块默认检出到**具体 commit** 而非分支，在里面 commit 后一 update 就"丢" | 进子仓库先 `git checkout main`（或自己的分支）再开发 |
| 忘了推子仓库本身 | 别人 `submodule update` 报 "reference is not a tree / 找不到该 commit" | 回子仓库 `git push` |
| 忘了在主仓库提交指针 | 别人拿到旧指针，看不到你的新功能 | 补第 ② 步 |
| 乱改 .gitmodules | 子模块远程地址错乱 | 不要手改，用 `git submodule set-url` |

---

## 5. 本项目当前情况与拆分建议

- **当前**：`smart-mission-system` 是**单仓库**，`frontend/`、`backend/`、`shell/` 都是普通目录，**没有 submodule**，日常就是第 2/3 节的 push/pull
- **若将来把某子项目（如 2d-map）拆成独立仓库**，两种方案：

| 方案 | 特点 | 适用 |
|---|---|---|
| **git submodule** | 子仓库独立提交独立发布；主仓库只存指针 | 子仓库要独立权限/独立发版、多人分工 |
| **git subtree** | 子仓库代码**合并进**主仓库历史，无指针烦恼 | 统一管理、不想折腾指针 |

拆分命令示例（submodule 方式）：

```
git submodule add <2d-map 远程地址> 2d-map
```

---

## 6. 常用命令速查

| 命令 | 作用 |
|---|---|
| `git status` / `git log --oneline` | 看状态 / 看历史 |
| `git diff` | 看未暂存的改动 |
| `git restore <file>` | 放弃工作区某文件的改动 |
| `git stash` / `git stash pop` | 暂存手头改动 / 恢复 |
| `git reset --soft HEAD~1` | 撤销最近一次 commit（保留改动） |
| `git revert <hash>` | 反向提交撤销历史（已推送时用这个） |
| `git branch` / `git switch -c 分支名` | 看分支 / 新建并切换分支 |
| `git remote -v` | 看远程地址 |
| `git config --get --global http.proxy` | 查看 git 代理（本项目为 `http://127.0.0.1:7897`） |

---

## 7. FAQ

| 问题 | 答案 |
|---|---|
| push 被拒 `non-fast-forward` | 远程有本地没有的提交：先 `git pull` 再 `git push` |
| push 时出现 `git-credential-manager-core was renamed` 警告 | 无害提示；凭据由 GCM 自动管理，无需处理 |
| `LF will be replaced by CRLF` 警告 | Windows 换行符自动转换提示，无害 |
| 提交错了想撤销 | 未 push：`git reset --soft HEAD~1`；已 push：`git revert <hash>`（**不要**对已推送提交用 `git reset --hard`） |
| 为什么主仓库里 `2d-map` 显示 modified 但里面没改文件 | 子模块指针变了（或子模块内有未提交改动），按 4.3/4.4 处理 |
