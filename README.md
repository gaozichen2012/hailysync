# obsidian-sync-plugin

Obsidian 桌面端插件：命令「Sync now」调用 **sync-core** 的 `runSync`，将当前本地 vault 与自建 **sync-server** 同步。

## 依赖 sync-core（multi-repo）

`package.json` 中 `sync-core` 为 **npm 语义化版本**（如 `^1.0.0`）。任选其一：

### A. 已发布到 npm

```bash
npm install
npm run build
```

### B. 本地与 sync-core 同级克隆（未发布）

```bash
cd ../sync-core
npm install
npm link

cd ../obsidian-sync-plugin
npm link sync-core
npm install
npm run build
```

将 Obsidian 插件目录指向本仓库（或复制 `manifest.json`、`main.js`、`styles.css` 等到 `.obsidian/plugins/<id>/`）。

## 配置

默认服务地址 `http://localhost:3000`（见 `main.ts` 中 `DEFAULT_SETTINGS`）。后续可在设置页写入 `data.json`。

## 要求

- 仅 **本地文件夹 vault**（`FileSystemAdapter`），否则无法取得磁盘路径。
