# obsidian-sync-plugin

Obsidian **桌面端**插件（manifest 名称：**Vault Sync (local)**，当前版本 **0.1.26**，要求 Obsidian **≥ 1.5.0**）：通过 JSON 协议与自建 **sync-server** 做双向同步（`/files`、上传/下载/删除等，本地与远端以 hash + `updated_at` 对齐）。

同步逻辑在 **`main.ts`** 内实现（`axios` + `blueimp-md5`），**不依赖** 单独的 `sync-core` npm 包。

## 功能概览

- **命令面板**：**「立即同步」**（`sync-now`）立即执行一次同步。
- **设置页**：**「手动同步」** 区块内 **「立即同步」** 按钮，效果相同。**「高级设置」** 折叠内可配置 **服务器地址**；总开关 **Enable Sync** 在设置页顶部。
- **自动同步**：插件加载后 **2–5 秒** 随机延迟执行一次（仅在已连接且开启同步时），之后 **每 60 秒** 一次；可在设置中关闭总开关。
- **Enable Sync**：关闭时不执行任何同步（含启动延迟与定时同步）；开启后可手动或通过命令同步。
- **身份**：使用 vault 根目录 **`.sync_config.json`** 中的 `user_id`（首次自动生成 UUID）；可与服务端同步 `device_id` 等，**不参与笔记文件同步**。
- **多设备绑定**：设置中可展示绑定码（含脱敏/完整复制）、**输入绑定码** 与其他设备对齐同一 `user_id`；可查看设备列表并在服务端移除设备（不做 vault 数据迁移）。
- **冲突**：本地与远端均已修改同一文件时，将远端内容写入 **`原名.conflict.md`**，不覆盖当前本地正文。
- **状态栏**：空闲 / 同步中 / 成功 / 失败（约 **3.5 秒** 后恢复为空闲提示）。

不参与同步的路径：以 `.` 开头、路径中含 `.obsidian`、以及 **`.sync_meta.json`** / **`.sync_config.json`**。

## 依赖与构建

```bash
npm install
npm run build
```

开发时可使用 `npm run dev`（esbuild watch，输出 `main.js`）。

将本仓库构建产物安装到 vault：把 **`manifest.json`**、**`main.js`**、**`styles.css`** 复制到 `.obsidian/plugins/obsidian-sync-plugin/`（或通过 Obsidian 的插件开发方式指向本目录）。

## 配置

**设置 → Vault Sync (local)**：

| 项 | 说明 |
|----|------|
| **服务器地址**（高级设置内） | sync-server **根 URL**（无末尾斜杠）。留空或未填时，使用内置默认地址（见下文）。 |
| **Enable Sync** | 总开关，见上文。 |

Obsidian 会将插件设置持久化在 **`data.json`**（与插件 id 同目录），主要字段包括 `serverUrl`、`enableSync`。

当前代码中的内置默认服务地址为 **`http://120.77.77.185:3000`**（与 `main.ts` 中 `BUILTIN_DEFAULT_SERVER_URL` 一致）。若你自建服务，请改为你的 ECS/内网地址。

## 与云端联调

在 **云端 ECS** 上手动启动 `sync-server`，确认监听地址、端口及安全组/防火墙已放行。本地或 Obsidian 中将 **服务器地址** 设为该服务的基址（例如 `http://<公网IP>:3000`）后再验证同步。

## 要求

- 仅 **本地文件夹 vault**（`FileSystemAdapter`），否则无法取得磁盘路径用于同步。
- 仅桌面端（`isDesktopOnly`）。
