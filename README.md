# obsidian-sync-plugin

Obsidian **桌面端**插件（manifest 名称：**Vault Sync (local)**，当前版本 **0.1.27**，要求 Obsidian **≥ 1.5.0**）：通过 JSON 协议与自建 **sync-server** 做双向同步（`/files`、上传/下载/删除等）。笔记在 **客户端加密** 后以密文与 **`cipher_hash`**、**`cipher_size`**、**`updated_at`** 对齐；服务端只处理密文与元数据（**端到端加密，E2EE**）。

同步逻辑在 **`main.ts`** 内实现（`axios` + `blueimp-md5`）；密钥派生、封装与线格式在 **`crypto-e2ee.ts`**（`hash-wasm` 的 **Argon2id**、`crypto.subtle` 的 AES-GCM 等）。**不依赖** 单独的 `sync-core` npm 包。请使用与当前插件 **冻结协议** 一致的 sync-server（`/files` 项含 **`encryption_version`**、**`vault_key_version`** 等字段，`upload`/`download` 与绑定接口匹配）。

## 功能概览

- **命令面板**：**「立即同步」**（`sync-now`）立即执行一次同步。
- **设置页**（标题 **「笔记同步」**）：顶部 **「下一步」** 引导与 **「同步状态」**（连接/同步结果等）；**设备绑定码** 区块（显示完整码、复制、重置；含凭证安全提示）；**绑定新设备** / **已绑定设备** 列表（可移除其它设备）。其下为 **「自动同步」**（总开关，对应持久化字段 `enableSync`）、**「手动同步」** 内的 **「立即同步」** 按钮。**「高级设置」** 折叠内为 **服务器地址**。
- **自动同步**：插件加载后 **2–5 秒** 随机延迟执行一次（仅在已开启自动同步、且已连接并有 `device_id` 时），之后 **每 60 秒** 一次；关闭 **自动同步** 后不执行定时与启动延迟同步。
- **身份与 E2EE**：使用 vault 根目录 **`.sync_config.json`** 中的 `user_id`（首次自动生成 UUID）及设备相关状态；**`.sync_crypto.json`** 缓存本 vault 的 **32 字节 vault 密钥**（仅本地，经同步上传的内容为密文）。可与服务端同步 `device_id` 等；**设备绑定码** 用于派生 KEK、解密服务端返回的 **envelope** 以取得同一 vault 密钥，从而在多设备间解密笔记。
- **多设备绑定**：设置中可展示绑定码（含脱敏/完整复制）、**输入绑定码** 与其他设备对齐同一 vault；首台设备在 **`/api/init`** 成功后用返回的 **binding_code** 初始化密钥与 envelope；可查看设备列表并在服务端移除设备（不做 vault 数据迁移）。移除后需重新输入绑定码。
- **冲突**：本地与远端均已修改同一文件时，将远端内容写入 **`原名.conflict.md`**，不覆盖当前本地正文（本地仍以明文工作，元数据里保留明文指纹供冲突判断）。
- **状态栏**：空闲 / 同步中 / 成功 / 失败（约 **3.5 秒** 后恢复为空闲提示）。

不参与同步的路径：以 `.` 开头、路径中含 `.obsidian`、以及 **`.sync_meta.json`** / **`.sync_config.json`** / **`.sync_crypto.json`**。

## 依赖与构建

```bash
npm install
npm run build
```

开发时可使用 `npm run dev`（esbuild watch，打包 **`main.ts`** 与 **`crypto-e2ee.ts`**，输出 `main.js`）。

可选：在 Node 下跑加密闭环自检（Wire / Envelope / AAD 等）：

```bash
npm run selftest:e2ee
```

将本仓库构建产物安装到 vault：把 **`manifest.json`**、**`main.js`**、**`styles.css`** 复制到 `.obsidian/plugins/obsidian-sync-plugin/`（或通过 Obsidian 的插件开发方式指向本目录）。`selftest:e2ee` 会在仓库根目录生成 **`tmp-e2ee-selftest.cjs`**（已在 `.gitignore` 中忽略）。

## 配置

**设置 → Vault Sync (local)**（界面标题为 **笔记同步**）：

| 项 | 说明 |
|----|------|
| **服务器地址**（高级设置内） | sync-server **根 URL**（无末尾斜杠）。留空或未填时，使用内置默认地址（见下文）。 |
| **自动同步** | 总开关（`data.json` 字段 **`enableSync`**）。关闭时不执行启动延迟与每 60 秒的自动同步；仍可通过命令或 **手动同步** 按钮触发。 |

Obsidian 会将插件设置持久化在 **`data.json`**（与插件 id 同目录），主要字段包括 `serverUrl`、`enableSync`。

当前代码中的内置默认服务地址为 **`http://120.77.77.185:3000`**（与 `main.ts` 中 `BUILTIN_DEFAULT_SERVER_URL` 一致）。若你自建服务，请改为你的 ECS/内网地址。

## 与云端联调

在 **云端 ECS** 上手动启动 `sync-server`，确认监听地址、端口及安全组/防火墙已放行。本地或 Obsidian 中将 **服务器地址** 设为该服务的基址（例如 `http://<公网IP>:3000`）后再验证同步。服务端需支持与本插件一致的 **E2EE 协议版本**（否则 `/files` 或加解密会不匹配）。

## 要求

- 仅 **本地文件夹 vault**（`FileSystemAdapter`），否则无法取得磁盘路径用于同步。
- 仅桌面端（`isDesktopOnly`）。
