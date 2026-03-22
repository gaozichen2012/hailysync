# 今晚已解决问题汇总

## 上传无正文 / multipart 不可用

`sync-core` 改为 JSON 上传：`{ path, content }`，先读本地文件再 `axios.post`，不再用 `FormData`。

## 上传缺少可观测性

增加 `upload start`、`file content length` 日志；请求体用显式 `payload` 对象；失败 `console.error` 并向上抛出。

## 空文件无法上传

`uploadFile` 曾对 `!content` 抛错，0 字节文件不能同步。已去掉该校验，读入后统一为字符串（`content || ""` 语义：`String(raw)`，空文件为 `""`），允许上传。

## 下载在 Obsidian 中失败（stream / pipe）

`downloadFile` 改为 `responseType: 'text'`，去掉 `stream` 与 `pipe`；插件传入 `writeVaultFile`，用 `vault.modify` / `vault.create` 写入；无回调时仍写磁盘供 Node 与测试。

## 集成测试 mock

`/download` 支持 `responseType: 'text'`；移除无效导出的 `parseUploadMultipart`。

## 仓库不含构建产物

从 `.gitignore` 移除 `main.js`，提交打包后的 `main.js`，便于克隆后免构建安装。

## 版本与远程同步

插件版本递增至 **0.1.4**，执行 `npm run build`；`sync-core` 与插件相关改动已提交并推送 Gitee。
